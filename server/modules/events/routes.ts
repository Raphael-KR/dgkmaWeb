import type { Express, Request, Response } from "express";
import { z } from "zod";
import { NOTICE_TYPES, noticeRevisionSchema, noticeTextSchema } from "@shared/contracts/notices";
import { storage } from "../../storage";
import { requireAuthenticated } from "../../middleware/auth";
import { readEventSources } from "./event-source-reader";
import { extractNoticeFacts, staticObituaryFacts, NoticeGenerationError } from "./notice-extraction";
import { renderNotice } from "./notice-rendering";
import { EventSourcePolicyError } from "./event-source-policy";
import type { RouteContext } from "../../lib/route-context";

export type RouteEventSourceReader = (input: string, signal?: AbortSignal) => ReturnType<typeof readEventSources>;
export function createDefaultEventSourceReader(reader: typeof readEventSources = readEventSources): RouteEventSourceReader {
  return (input, signal) => reader(input, undefined, signal);
}
const idSchema = z.coerce.number().int().positive();
function failure(res: Response, error: unknown) {
  if (error instanceof z.ZodError || error instanceof EventSourcePolicyError) return res.status(400).json({ message: "입력 형식과 링크를 확인해 주세요." });
  if (error instanceof NoticeGenerationError) return res.status(error.status).json({ message: error.message });
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) return res.status(504).json({ message: "작성 시간이 초과되었습니다. 초안은 보존되어 있으니 다시 시도해 주세요." });
  return res.status(500).json({ message: "경조사 요청을 처리하지 못했습니다. 저장된 초안을 확인해 주세요." });
}
const conflict = (res: Response) => res.status(409).json({ message: "초안이 다른 창에서 변경되었습니다. 입력을 복사한 뒤 초안을 다시 불러와 주세요." });
async function ownDraft(req: Request, res: Response) {
  const draft = await storage.getOwnNotice(idSchema.parse(req.params.id), req.session.userId!);
  if (!draft || draft.isPublished) { res.status(404).json({ message: "작성 중인 초안을 찾을 수 없습니다." }); return; }
  return draft;
}

export function registerEventRoutes(app: Express, { eventParseLimiter, eventParseTimeoutMs, readSources }: RouteContext): void {
  const base = "/api/posts/notices";
  app.use(base, requireAuthenticated, (_req, res, next) => { res.set("Cache-Control", "private, no-store"); next(); });
  app.post(`${base}/drafts/:type`, async (req, res) => {
    try { res.json(await storage.getNoticeDraft(req.session.userId!, z.enum(NOTICE_TYPES).parse(req.params.type))); }
    catch (error) { failure(res, error); }
  });
  app.patch(`${base}/:id`, async (req, res) => {
    try {
      const input = noticeTextSchema.parse(req.body);
      const draft = await ownDraft(req, res);
      if (!draft?.eventData) return;
      const saved = await storage.saveNotice(draft.id, req.session.userId!, input.revision, {
        sourceText: input.sourceText, title: "", content: "",
        eventData: { ...draft.eventData, facts: null, questions: [], sources: [] },
      });
      if (!saved) return conflict(res);
      res.json(saved);
    } catch (error) { failure(res, error); }
  });
  app.delete(`${base}/:id`, async (req, res) => {
    try {
      const { revision } = noticeRevisionSchema.parse(req.body);
      if (!await storage.deleteNoticeDraft(idSchema.parse(req.params.id), req.session.userId!, revision)) return conflict(res);
      res.status(204).end();
    } catch (error) { failure(res, error); }
  });
  app.post(`${base}/:id/generate`, eventParseLimiter, async (req, res) => {
    try {
      const { revision } = noticeRevisionSchema.parse(req.body);
      const draft = await ownDraft(req, res);
      if (!draft?.eventData) return;
      if (draft.revision !== revision) return conflict(res);
      if (!draft.sourceText?.trim()) return res.status(400).json({ message: "경조사 내용이나 공개 링크를 입력해 주세요." });
      const sources = await readSources(draft.sourceText, AbortSignal.timeout(eventParseTimeoutMs));
      const signal = AbortSignal.timeout(60_000);
      const facts = (draft.eventData.eventType === "obituary"
        ? staticObituaryFacts(draft.sourceText, sources.urls, sources.structuredObituary) : undefined)
        ?? await extractNoticeFacts(draft.eventData.eventType, draft.sourceText, sources.combinedText, signal);
      const data = { ...draft.eventData, facts, sources: sources.sources };
      const rendered = await renderNotice(data, draft.sourceText, req.session.userId!, storage);
      const saved = await storage.saveNotice(draft.id, req.session.userId!, revision, {
        title: rendered.title, content: rendered.content, eventData: { ...data, questions: rendered.questions },
      });
      if (!saved) return conflict(res);
      res.json(saved);
    } catch (error) { failure(res, error); }
  });
  app.post(`${base}/:id/publish`, async (req, res) => {
    try {
      const { revision } = noticeRevisionSchema.parse(req.body);
      const draft = await storage.getOwnNotice(idSchema.parse(req.params.id), req.session.userId!);
      if (!draft?.eventData) return res.status(404).json({ message: "초안을 찾을 수 없습니다." });
      if (draft.isPublished && draft.revision === revision + 1) return res.json({ id: draft.id });
      if (draft.isPublished || draft.revision !== revision) return conflict(res);
      if (!draft.content || !draft.title || draft.eventData.questions.length) return res.status(422).json({ message: "필요한 정보를 보완하고 미리보기를 확인해 주세요." });
      const rendered = await renderNotice(draft.eventData, draft.sourceText ?? "", req.session.userId!, storage);
      if (rendered.questions.length || rendered.content !== draft.content || rendered.title !== draft.title) {
        return res.status(409).json({ message: "회원 정보나 작성 내용이 변경되었습니다. 미리보기를 다시 생성하고 확인해 주세요." });
      }
      const post = await storage.publishNotice(draft.id, req.session.userId!, revision);
      if (!post) {
        const current = await storage.getOwnNotice(draft.id, req.session.userId!);
        if (current?.isPublished && current.revision === revision + 1) return res.json({ id: current.id });
        return conflict(res);
      }
      res.json({ id: post.id });
    } catch (error) { failure(res, error); }
  });
}
