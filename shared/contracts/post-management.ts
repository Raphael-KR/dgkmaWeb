import { z } from "zod";
import { postDocumentSchema, type PostDocument } from "./post-document";
import type { NoticeSource, NoticeType } from "./notices";

export const postRevisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
export const updatePostSchema = postRevisionSchema.extend({
  title: z.string().trim().min(1, "제목을 입력해 주세요.").max(300),
  content: postDocumentSchema,
  categoryId: z.number().int().positive(),
  imageUrls: z.array(z.string().regex(/^\/objects\/[A-Za-z0-9/_-]+$/)).max(20),
}).strict();
export type UpdatePost = z.infer<typeof updatePostSchema>;
export const postVisibilitySchema = postRevisionSchema.extend({ isHidden: z.boolean() }).strict();
export const noticeCorrectionSchema = postRevisionSchema.extend({ sourceText: z.string().trim().min(1).max(20_000) }).strict();
export const saveNoticeCorrectionSchema = z.object({ previewToken: z.string().min(1).max(250_000) }).strict();
export type NoticeEditPreview = {
  eventType: NoticeType;
  title: string;
  content: PostDocument;
  questions: string[];
  sources: NoticeSource[];
  previewToken: string | null;
};
