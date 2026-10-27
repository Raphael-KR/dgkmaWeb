import type { Express } from "express";
import type { CommunityEvent } from "@shared/schema";
import {
  COMMUNITY_EVENT_TYPES, communityEventDraftSchema, communityEventPublishSchema,
  type CommunityEventDraftInput, type CommunityEventPublishInput,
} from "@shared/community-events";
import { z } from "zod";
import { storage } from "../../storage";
import { requireAuthenticated } from "../../middleware/auth";
import { parsePositiveInteger } from "../../lib/route-params";
import { parseObituaryEventSource, parseObituarySms } from "./obituary-parser";
import { readEventSources } from "./event-source-reader";
import { normalizeCommunityEventSources, sanitizeStoredCommunityEventSources } from "./community-event-source-policy";
import { EventSourcePolicyError } from "./event-source-policy";
import { assembleTrustedObituary } from "./obituary-member-policy";
import type { RouteContext } from "../../lib/route-context";

const eventParseRequestSchema = z.object({
  eventType: z.enum(COMMUNITY_EVENT_TYPES),
  input: z.string().min(1).max(20_000),
}).strict();

export type RouteEventSourceReader = (
  input: string,
  signal?: AbortSignal,
) => ReturnType<typeof readEventSources>;

export function createDefaultEventSourceReader(
  sourceReader: typeof readEventSources = readEventSources,
): RouteEventSourceReader {
  return (input, signal) => sourceReader(input, undefined, signal);
}

function sanitizePublishedEvent(event: CommunityEvent) {
  const safeEvent = sanitizeStoredCommunityEventSources(event);
  const { sourceText: _sourceText, ...publishedEvent } = safeEvent;
  return publishedEvent;
}

export function registerEventRoutes(
  app: Express,
  { eventParseLimiter, eventParseTimeoutMs, readSources }: RouteContext,
): void {
  app.use("/api/obituary", requireAuthenticated);
  app.use("/api/obituaries", requireAuthenticated);

  // Obituary URL parsing route
  app.post("/api/obituary/parse", (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ message: "text 필드가 필요합니다" });
      }
      const parsed = parseObituarySms(text);
      res.json(parsed);
    } catch (error) {
      res.status(500).json({ message: "부고 문자 분석에 실패했습니다" });
    }
  });

  app.get("/api/obituaries", async (req, res) => {
    try {
      const list = await storage.getObituaries();
      res.json(list);
    } catch (error) {
      res.status(500).json({ message: "부고 목록 조회에 실패했습니다" });
    }
  });

  app.get("/api/obituaries/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (Number.isNaN(id)) {
        return res.status(400).json({ message: "잘못된 부고입니다" });
      }
      const obituary = await storage.getObituary(id);
      if (!obituary) {
        return res.status(404).json({ message: "부고를 찾을 수 없습니다" });
      }
      res.json(obituary);
    } catch (error) {
      res.status(500).json({ message: "부고 조회에 실패했습니다" });
    }
  });

  app.post("/api/obituaries", async (req, res) => {
    try {
      if (!req.session?.userId) {
        return res.status(401).json({ message: "로그인이 필요합니다" });
      }
      const obituary = await storage.createObituary({
        ...req.body,
        authorId: req.session.userId,
      });
      res.status(201).json(obituary);
    } catch (error) {
      res.status(500).json({ message: "부고 등록에 실패했습니다" });
    }
  });

  app.post("/api/events/parse", requireAuthenticated, eventParseLimiter, async (req, res) => {
    const controller = new AbortController();
    let timedOut = false;
    const onDisconnect = () => {
      if (!res.writableEnded) controller.abort();
    };
    req.once("aborted", onDisconnect);
    res.once("close", onDisconnect);
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, eventParseTimeoutMs);

    try {
      const { eventType, input } = eventParseRequestSchema.parse(req.body);
      const sourceResult = await readSources(input, controller.signal);
      const fetchedSourceUrls = sourceResult.sources
        .filter((source) => source.status === "fetched")
        .map((source) => source.url);

      if (eventType === "obituary") {
        const parsed = parseObituaryEventSource(sourceResult.combinedText);
        const sourceUrl = fetchedSourceUrls[0];
        return res.json({
          draft: {
            ...parsed.draft,
            sourceText: input,
            sourceUrls: fetchedSourceUrls,
            details: {
              ...parsed.draft.details,
              ...(sourceUrl ? { sourceUrl } : {}),
            },
          },
          missingFields: parsed.missingFields,
          sources: sourceResult.sources,
        });
      }

      return res.json({
        draft: {
          eventType,
          sourceText: input,
          sourceUrls: fetchedSourceUrls,
          details: { memo: sourceResult.combinedText.slice(0, 5_000) },
        },
        missingFields: [],
        sources: sourceResult.sources,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      if (timedOut) {
        return res.status(504).json({ message: "분석 시간이 초과되었습니다" });
      }
      if (controller.signal.aborted) return;
      return res.status(500).json({ message: "소식 초안 분석에 실패했습니다" });
    } finally {
      clearTimeout(timeout);
      req.removeListener("aborted", onDisconnect);
      res.removeListener("close", onDisconnect);
    }
  });

  app.use("/api/events", requireAuthenticated);

  app.get("/api/events/drafts/latest", async (req, res) => {
    try {
      const eventType = z.enum(COMMUNITY_EVENT_TYPES).parse(req.query.type);
      const event = await storage.getLatestEventDraft(req.session.userId!, eventType);
      if (!event) {
        return res.status(404).json({ message: "임시 저장된 소식을 찾을 수 없습니다" });
      }
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      res.status(500).json({ message: "임시 저장된 소식 조회에 실패했습니다" });
    }
  });

  app.post("/api/events/drafts", async (req, res) => {
    try {
      const data = normalizeCommunityEventSources(communityEventDraftSchema.parse(req.body));
      const event = await storage.createEventDraft(req.session.userId!, data);
      res.status(201).json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      if (error instanceof EventSourcePolicyError) {
        return res.status(400).json({ message: "공개 링크 형식을 확인해주세요" });
      }
      res.status(500).json({ message: "임시 저장된 소식 작성에 실패했습니다" });
    }
  });

  app.patch("/api/events/drafts/:id", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const data = normalizeCommunityEventSources(communityEventDraftSchema.parse(req.body));
      const event = await storage.updateEventDraft(id, req.session.userId!, data);
      if (!event) {
        return res.status(404).json({ message: "임시 저장된 소식을 찾을 수 없습니다" });
      }
      res.json(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      if (error instanceof EventSourcePolicyError) {
        return res.status(400).json({ message: "공개 링크 형식을 확인해주세요" });
      }
      res.status(500).json({ message: "임시 저장된 소식 수정에 실패했습니다" });
    }
  });

  app.delete("/api/events/drafts/:id", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const deleted = await storage.deleteEventDraft(id, req.session.userId!);
      if (!deleted) {
        return res.status(404).json({ message: "임시 저장된 소식을 찾을 수 없습니다" });
      }
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "임시 저장된 소식 삭제에 실패했습니다" });
    }
  });

  app.post("/api/events/:id/preview", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const userId = req.session.userId!;
      const draft = await storage.getEventDraft(id, userId);
      if (!draft || draft.eventType !== "obituary") {
        return res.status(404).json({ message: "임시 저장된 부고를 찾을 수 없습니다" });
      }
      const preview = await assembleTrustedObituary(draft, userId, storage);
      if (preview.kind === "invalid") {
        return res.status(400).json({
          message: "저장된 부고 초안이 올바르지 않습니다",
          missingFields: preview.missingFields,
        });
      }
      if (preview.kind === "missing") {
        return res.status(400).json({
          message: "부고문 미리보기에 필요한 정보가 부족합니다",
          missingFields: preview.missingFields,
        });
      }
      if (preview.kind === "blocked") {
        return res.status(400).json({
          message: preview.message,
          missingFields: preview.missingFields,
        });
      }

      res.json({ text: preview.text });
    } catch {
      res.status(500).json({ message: "부고문 미리보기를 만들지 못했습니다" });
    }
  });

  app.post("/api/events/:id/publish", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const userId = req.session.userId!;
      const ownedDraft = await storage.getEventDraft(id, userId);
      if (!ownedDraft) {
        const alreadyPublished = await storage.getPublishedEvent(id);
        if (alreadyPublished?.authorId === userId) {
          return res.json(sanitizePublishedEvent(alreadyPublished));
        }
        return res.status(404).json({ message: "소식을 찾을 수 없습니다" });
      }

      let data: CommunityEventPublishInput;
      if (req.body?.eventType === "obituary") {
        const draftData = normalizeCommunityEventSources(
          communityEventDraftSchema.parse(req.body),
        );
        if (draftData.eventType !== "obituary" || ownedDraft.eventType !== "obituary") {
          return res.status(400).json({ message: "잘못된 요청입니다" });
        }
        const candidate = {
          ...ownedDraft,
          ...draftData,
          details: draftData.details,
        } as CommunityEvent;
        const announcement = await assembleTrustedObituary(candidate, userId, storage);
        if (announcement.kind !== "ready") {
          return res.status(400).json({
            message: announcement.kind === "invalid"
              ? "저장된 부고 초안이 올바르지 않습니다"
              : announcement.kind === "blocked"
                ? announcement.message
                : "부고문 게시에 필요한 정보가 부족합니다",
            missingFields: announcement.missingFields,
          });
        }
        const canonicalDraft: CommunityEventDraftInput = {
          ...draftData,
          relatedMemberName: announcement.input.memberName,
          contactNumber: announcement.input.memberPhone,
          details: {
            ...draftData.details,
            memberTitle: announcement.input.memberTitle,
          },
        };
        data = normalizeCommunityEventSources(communityEventPublishSchema.parse(canonicalDraft));
      } else {
        data = normalizeCommunityEventSources(communityEventPublishSchema.parse(req.body));
        if (data.eventType !== ownedDraft.eventType) {
          return res.status(400).json({ message: "잘못된 요청입니다" });
        }
      }

      const event = await storage.publishEvent(id, userId, data);
      if (!event) {
        return res.status(404).json({ message: "소식을 찾을 수 없습니다" });
      }
      res.json(sanitizePublishedEvent(event));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      if (error instanceof EventSourcePolicyError) {
        return res.status(400).json({ message: "공개 링크 형식을 확인해주세요" });
      }
      res.status(500).json({ message: "소식 발행에 실패했습니다" });
    }
  });

  app.get("/api/events", async (req, res) => {
    try {
      const eventType = req.query.type === undefined
        ? undefined
        : z.enum(COMMUNITY_EVENT_TYPES).parse(req.query.type);
      const events = await storage.getPublishedEvents(eventType);
      res.json(events.map(sanitizePublishedEvent));
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "잘못된 요청입니다", errors: error.errors });
      }
      res.status(500).json({ message: "소식 목록 조회에 실패했습니다" });
    }
  });

  app.get("/api/events/:id", async (req, res) => {
    try {
      const id = parsePositiveInteger(req.params.id);
      if (!id) {
        return res.status(400).json({ message: "잘못된 소식입니다" });
      }
      const event = await storage.getPublishedEvent(id);
      if (!event) {
        return res.status(404).json({ message: "소식을 찾을 수 없습니다" });
      }
      res.json(sanitizePublishedEvent(event));
    } catch (error) {
      res.status(500).json({ message: "소식 조회에 실패했습니다" });
    }
  });
}
