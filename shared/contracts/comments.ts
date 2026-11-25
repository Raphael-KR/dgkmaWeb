import { z } from "zod";
import { COMMENT_MAX_LENGTH } from "./content-limits";
import { postAttachmentPathSchema } from "./post-input";
import type { UploadedFile } from "./uploads";

export type CommentAttachmentData = UploadedFile | UploadedFile[];

export type Comment = {
  id: number;
  postId: number;
  parentCommentId: number | null;
  isAuthor: boolean;
  content: string;
  createdAt: string | null;
  editedAt: string | null;
  isHidden: boolean;
  revision: number;
  attachment: CommentAttachmentData | null;
};

// A hidden comment's text and attachment are omitted for ordinary viewers.
export type CommentWithAuthor = Omit<Comment, "content"> & {
  content: string | null;
  author: { name: string; affiliation: string | null } | null;
};

const commentFields = z.object({
  content: z
    .string()
    .max(COMMENT_MAX_LENGTH, `댓글은 ${COMMENT_MAX_LENGTH}자까지 입력할 수 있습니다.`),
  attachmentPath: postAttachmentPathSchema.nullable().default(null),
});
const hasComment = (value: z.infer<typeof commentFields>) =>
  !!value.content.trim() || !!value.attachmentPath;
const emptyMessage = "댓글 내용이나 첨부 파일을 넣어 주세요.";

export const insertCommentSchema = commentFields.refine(hasComment, {
  message: emptyMessage,
  path: ["content"],
});
export const commentRevisionSchema = z.object({ revision: z.number().int().nonnegative() });
export const updateCommentSchema = commentFields.merge(commentRevisionSchema).refine(hasComment, {
  message: emptyMessage,
  path: ["content"],
});
export const commentVisibilitySchema = commentRevisionSchema.extend({ isHidden: z.boolean() });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type UpdateComment = z.infer<typeof updateCommentSchema>;
