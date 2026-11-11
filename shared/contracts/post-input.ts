import { z } from "zod";
import { POST_TITLE_MAX_LENGTH } from "./content-limits";
import { POST_ATTACHMENT_LIMIT, DOCUMENT_ATTACHMENT_LIMIT } from "./uploads";
import { postDocumentImagePaths, postDocumentFilePaths, type PostDocument } from "./post-document";

export const postTitleSchema = z
  .string()
  .trim()
  .min(1, "제목을 입력해 주세요.")
  .max(POST_TITLE_MAX_LENGTH, `제목은 ${POST_TITLE_MAX_LENGTH}자까지 입력할 수 있습니다.`);

export const postAttachmentPathSchema = z
  .string()
  .regex(/^\/objects\/[A-Za-z0-9/_-]+$/, "잘못된 첨부 파일 경로입니다.");

export const postImageUrlsSchema = z
  .array(postAttachmentPathSchema)
  .max(POST_ATTACHMENT_LIMIT, `이미지는 ${POST_ATTACHMENT_LIMIT}개까지 첨부할 수 있습니다.`);

export type PostAttachments = { content: PostDocument; imageUrls?: string[] | null };

export function postAttachmentPaths(post: PostAttachments) {
  return [
    ...(post.imageUrls ?? []),
    ...postDocumentImagePaths(post.content),
    ...postDocumentFilePaths(post.content),
  ];
}

function withinLimitOrPreservesExisting(paths: string[], maximum: number, existing: string[]) {
  if (paths.length <= maximum) return true;
  const remaining = new Map<string, number>();
  for (const path of existing) remaining.set(path, (remaining.get(path) ?? 0) + 1);
  for (const path of paths) {
    const count = remaining.get(path) ?? 0;
    if (!count) return false;
    remaining.set(path, count - 1);
  }
  return true;
}

export function checkPostAttachmentLimit(
  post: PostAttachments,
  context: z.RefinementCtx,
  existing?: PostAttachments,
) {
  const attachments = postAttachmentPaths(post);
  const documents = postDocumentFilePaths(post.content);
  if (
    !withinLimitOrPreservesExisting(
      attachments,
      POST_ATTACHMENT_LIMIT,
      existing ? postAttachmentPaths(existing) : [],
    )
  )
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: `본문과 첨부 파일은 합계 ${POST_ATTACHMENT_LIMIT}개까지 추가하거나 기존 파일만 유지·줄일 수 있습니다. 입력: ${attachments.length}개.`,
    });
  if (
    !withinLimitOrPreservesExisting(
      documents,
      DOCUMENT_ATTACHMENT_LIMIT,
      existing ? postDocumentFilePaths(existing.content) : [],
    )
  )
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["content"],
      message: `일반 첨부 파일은 게시글당 ${DOCUMENT_ATTACHMENT_LIMIT}개까지 추가하거나 기존 파일만 유지·줄일 수 있습니다. 입력: ${documents.length}개.`,
    });
}
