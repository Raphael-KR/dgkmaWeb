import { useRef, useState } from "react";
import {
  POST_ATTACHMENT_LIMIT,
  DOCUMENT_ATTACHMENT_LIMIT,
  uploadSizeLimit,
  validateUploadType,
  type UploadedFile,
} from "@shared/contracts/uploads";
import { postAttachmentPaths, type PostAttachments } from "@shared/contracts/post-input";
import { postDocumentFilePaths } from "@shared/contracts/post-document";
import { useUpload } from "@/hooks/use-upload";

export function usePostUploads(
  getAttachments: () => PostAttachments,
  onError: (message: string) => void,
) {
  const [isUploading, setIsUploading] = useState(false);
  const pending = useRef(false);
  const { uploadFile } = useUpload({ onError: (error) => onError(error.message) });

  async function uploadFiles(files: File[]): Promise<UploadedFile[]> {
    if (!files.length || pending.current) return [];
    const current = getAttachments();
    const count = postAttachmentPaths(current).length;
    let documentCount = postDocumentFilePaths(current.content).length;
    pending.current = true;
    setIsUploading(true);
    const uploaded: UploadedFile[] = [];
    const errors = new Set<string>();
    try {
      for (const file of files) {
        const validation = validateUploadType(file.name, file.type);
        if (!validation.ok) {
          errors.add(validation.message);
          continue;
        }
        const limit = uploadSizeLimit(validation.contentType);
        if (file.size <= 0 || file.size > limit.bytes) {
          errors.add(
            `파일은 0바이트 초과 ${limit.mb}MB 이하만 업로드할 수 있습니다. 입력 크기: ${file.size}바이트.`,
          );
          continue;
        }
        if (validation.kind === "document" && documentCount >= DOCUMENT_ATTACHMENT_LIMIT) {
          errors.add(
            `일반 첨부 파일은 게시글당 ${DOCUMENT_ATTACHMENT_LIMIT}개까지 추가할 수 있습니다. 현재 ${documentCount}개입니다.`,
          );
          continue;
        }
        if (count + uploaded.length >= POST_ATTACHMENT_LIMIT) {
          errors.add(
            `본문·첨부 합계 ${POST_ATTACHMENT_LIMIT}개를 초과한 파일은 추가하지 않았습니다.`,
          );
          continue;
        }
        const result = await uploadFile(file);
        if (result) {
          const { objectPath, name, size, contentType } = result;
          uploaded.push({ objectPath, name, size, contentType });
          if (validation.kind === "document") documentCount++;
        }
      }
      return uploaded;
    } finally {
      pending.current = false;
      setIsUploading(false);
      if (errors.size) onError(Array.from(errors).join("\n\n"));
    }
  }

  return { uploadFiles, isUploading, pending };
}
