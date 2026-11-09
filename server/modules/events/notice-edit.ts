import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { noticeCorrectionSchema, saveNoticeCorrectionSchema, postDocumentText, type NoticeEditPreview } from "@shared/contracts";
import type { NoticeData, NoticeFacts } from "@shared/contracts/notices";
import { postDocumentFromMarkdown } from "@shared/editor/post-document";
import type { Post } from "../../db/schema";
import type { RouteContext } from "../../lib/route-context";
import { getErrorType } from "../../lib/safe-logging";
import { storage } from "../../storage";
import { extractNoticeFacts, NoticeGenerationError } from "./notice-extraction";
import { normalizeCelebrationFacts } from "./celebration-normalization";
import { noticeFieldSources } from "./notice-field-sources";
import { renderNotice } from "./notice-rendering";
import { EventSourcePolicyError } from "./event-source-policy";

type EditToken = {
  version: 1; userId: number; postId: number; revision: number; expiresAt: number;
  sourceText: string; eventData: NoticeData; renderedHash: string;
};
const idSchema = z.coerce.number().int().positive();
const digest = (title: string, content: string) => createHash("sha256").update(JSON.stringify([title, content])).digest("hex");
function signature(encoded: string) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new NoticeGenerationError("경조사 수정 설정을 확인해 주세요.", 503);
  return createHmac("sha256", secret).update(`dgkma:notice-edit:v1:${encoded}`).digest();
}
function signToken(payload: EditToken) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = `${encoded}.${signature(encoded).toString("base64url")}`;
  if (token.length > 250_000) throw new NoticeGenerationError("정정 내용을 줄여 다시 작성해 주세요.");
  return token;
}
function verifyToken(token: string): EditToken {
  const [encoded, mac, extra] = token.split(".");
  const invalid = () => new NoticeGenerationError("미리보기가 만료되었거나 변경되었습니다. 다시 작성해 주세요.", 409);
  if (!encoded || !mac || extra !== undefined) throw invalid();
  const expected = signature(encoded);
  const received = Buffer.from(mac, "base64url");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) throw invalid();
  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as EditToken;
  if (payload.version !== 1 || payload.expiresAt <= Date.now()) throw invalid();
  return payload;
}
async function ownPublishedNotice(req: Request) {
  const post = await storage.getOwnNotice(idSchema.parse(req.params.id), req.session.userId!);
  if (!post?.isPublished || !post.eventData) throw new NoticeGenerationError("작성한 경조사 게시글을 찾을 수 없습니다.", 404);
  return post;
}
function inputWithExistingFacts(post: Post, correction: string) {
  const facts = post.eventData?.facts;
  return `기존 게시글의 확인된 정보입니다. 아래 정정이 없는 사실은 유지하세요.\n대상: ${facts?.memberName ?? ""} ${facts?.admissionYear ?? ""}학번\n${JSON.stringify(facts)}\n기존 게시문:\n${postDocumentText(post.content)}\n\n작성자 정정(우선):\n${correction}`;
}
function fail(res: Response, error: unknown) {
  if (error instanceof z.ZodError || error instanceof EventSourcePolicyError) return res.status(400).json({ message: "정정 내용과 링크를 확인해 주세요." });
  if (error instanceof NoticeGenerationError) return res.status(error.status).json({ message: error.message });
  console.error("Notice edit failed", { errorType: getErrorType(error) });
  return res.status(500).json({ message: "경조사 수정에 실패했습니다. 입력은 유지되며 기존 게시글은 변경하지 않았습니다." });
}

export function registerNoticeEditRoutes(app: Express, { eventParseLimiter, eventParseTimeoutMs, readSources }: Pick<RouteContext, "eventParseLimiter" | "eventParseTimeoutMs" | "readSources">) {
  // The parent /api/posts/notices middleware supplies authentication and no-store.
  app.post("/api/posts/notices/:id/edit-preview", eventParseLimiter, async (req, res) => {
    try {
      signature(""); // Check configuration before a potentially paid extraction.
      const input = noticeCorrectionSchema.parse(req.body);
      const post = await ownPublishedNotice(req);
      if (post.revision !== input.revision) throw new NoticeGenerationError("게시글이 변경되었습니다. 정정 내용을 보관한 뒤 다시 불러와 주세요.", 409);
      const original = post.eventData!;
      const contextInput = inputWithExistingFacts(post, input.sourceText);
      const sources = await readSources(input.sourceText, AbortSignal.timeout(eventParseTimeoutMs), original.eventType);
      const extracted = await extractNoticeFacts(original.eventType, contextInput, sources.combinedText, AbortSignal.timeout(60_000));
      const facts = normalizeCelebrationFacts(original.eventType, extracted);
      const fieldSources = noticeFieldSources(facts, input.sourceText, sources.evidence) ?? {};
      for (const key of Object.keys(facts) as (keyof NoticeFacts)[]) {
        if (JSON.stringify(facts[key]) === JSON.stringify(original.facts?.[key]) && original.fieldSources?.[key]) {
          fieldSources[key] = original.fieldSources[key];
        }
      }
      const data: NoticeData = { ...original, facts, fieldSources,
        sources: Array.from(new Map([...original.sources, ...sources.sources].map(source => [source.url, source])).values()) };
      const rendered = await renderNotice(data, contextInput, req.session.userId!, storage);
      data.questions = rendered.questions;
      const preview: NoticeEditPreview = {
        eventType: data.eventType, title: rendered.title, content: postDocumentFromMarkdown(rendered.content),
        questions: rendered.questions, sources: sources.sources,
        previewToken: rendered.questions.length ? null : signToken({
          version: 1, userId: req.session.userId!, postId: post.id, revision: post.revision,
          expiresAt: Date.now() + 15 * 60_000, sourceText: input.sourceText, eventData: data,
          renderedHash: digest(rendered.title, rendered.content),
        }),
      };
      res.json(preview);
    } catch (error) { fail(res, error); }
  });
  app.patch("/api/posts/notices/:id/edit", async (req, res) => {
    try {
      const { previewToken } = saveNoticeCorrectionSchema.parse(req.body);
      const token = verifyToken(previewToken);
      const post = await ownPublishedNotice(req);
      if (token.userId !== req.session.userId || token.postId !== post.id || token.revision !== post.revision || token.eventData.eventType !== post.eventData!.eventType) {
        throw new NoticeGenerationError("게시글이 변경되었습니다. 미리보기를 다시 작성해 주세요.", 409);
      }
      const rendered = await renderNotice(token.eventData, inputWithExistingFacts(post, token.sourceText), req.session.userId!, storage);
      if (rendered.questions.length || digest(rendered.title, rendered.content) !== token.renderedHash) {
        throw new NoticeGenerationError("회원 정보나 문안이 변경되었습니다. 미리보기를 다시 확인해 주세요.", 409);
      }
      const saved = await storage.updatePublishedNotice(post.id, req.session.userId!, token.revision, {
        eventData: token.eventData, title: rendered.title, content: postDocumentFromMarkdown(rendered.content),
      });
      if (!saved) throw new NoticeGenerationError("게시글이 변경되었습니다. 미리보기를 다시 작성해 주세요.", 409);
      res.json({ id: saved.id });
    } catch (error) { fail(res, error); }
  });
}
