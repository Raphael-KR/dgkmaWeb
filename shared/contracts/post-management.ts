import { NOTICE_SOURCE_TEXT_MAX_LENGTH } from "./content-limits";
import { z } from "zod";
import { postDocumentSchema, type PostDocument } from "./post-document";
import type { NoticeSource, NoticeType } from "./notices";
import {
  postTitleSchema,
  postAttachmentPathSchema,
  postImageUrlsSchema,
  checkPostAttachmentLimit,
} from "./post-input";

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

// The server supplies its current row after checking authorship, never a client baseline.
export function createUpdatePostSchema(current: {
  title: string;
  imageUrls: string[] | null;
  content: PostDocument;
}) {
  return updatePostSchema
    .extend({
      title: z.literal(current.title).or(postTitleSchema),
      imageUrls: z.array(postAttachmentPathSchema),
    })
    .superRefine((post, context) => checkPostAttachmentLimit(post, context, current));
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
