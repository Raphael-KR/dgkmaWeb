import { NOTICE_SOURCE_TEXT_MAX_LENGTH } from "./content-limits";
import { z } from "zod";
import { postDocumentSchema, type PostDocument } from "./post-document";
import type { NoticeSource, NoticeType } from "./notices";
import { POST_IMAGE_LIMIT } from "./uploads";
import { postTitleSchema, postImagePathSchema, postImageUrlsSchema } from "./post-input";

export const postRevisionSchema = z.object({ revision: z.number().int().nonnegative() }).strict();
export const updatePostSchema = postRevisionSchema
  .extend({
    title: postTitleSchema,
    content: postDocumentSchema,
    categoryId: z.number().int().positive(),
    imageUrls: postImageUrlsSchema,
  })
  .strict();
export type UpdatePost = z.infer<typeof updatePostSchema>;

function retainsExistingImages(paths: string[], existing: string[]): boolean {
  const remaining = new Map<string, number>();
  for (const path of existing) remaining.set(path, (remaining.get(path) ?? 0) + 1);
  for (const path of paths) {
    const count = remaining.get(path) ?? 0;
    if (count === 0) return false;
    remaining.set(path, count - 1);
  }
  return true;
}

// The server supplies its current row after checking authorship, never a client baseline.
export function createUpdatePostSchema(current: { title: string; imageUrls: string[] | null }) {
  return updatePostSchema.extend({
    title: z.literal(current.title).or(postTitleSchema),
    imageUrls: z
      .array(postImagePathSchema)
      .refine(
        (paths) =>
          paths.length <= POST_IMAGE_LIMIT || retainsExistingImages(paths, current.imageUrls ?? []),
        `이미지는 ${POST_IMAGE_LIMIT}개까지 첨부하거나 기존 첨부만 유지·줄일 수 있습니다.`,
      ),
  });
}
export const postVisibilitySchema = postRevisionSchema.extend({ isHidden: z.boolean() }).strict();
export const noticeCorrectionSchema = postRevisionSchema
  .extend({ sourceText: z.string().trim().min(1).max(NOTICE_SOURCE_TEXT_MAX_LENGTH) })
  .strict();
export const saveNoticeCorrectionSchema = z
  .object({ previewToken: z.string().min(1).max(250_000) })
  .strict();
export type NoticeEditPreview = {
  eventType: NoticeType;
  title: string;
  content: PostDocument;
  questions: string[];
  sources: NoticeSource[];
  previewToken: string | null;
};
