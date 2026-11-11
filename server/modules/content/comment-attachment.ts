import { postAttachmentPathSchema } from "@shared/contracts/post-input";
import { uploadSizeLimit, validateUploadType, type UploadedFile } from "@shared/contracts/uploads";
import {
  ObjectStorageService,
  ObjectNotFoundError,
} from "../../integrations/object-storage/objectStorage";
import { validUploadName } from "../../integrations/object-storage/upload-file-validation";
import { storage } from "../../storage";
import type { PostViewer } from "./storage-contract";

export class CommentAttachmentError extends Error {}

export async function resolveCommentAttachment(
  path: string | null,
  viewer: PostViewer,
  existing: UploadedFile | null = null,
): Promise<UploadedFile | null> {
  if (path === null) return null;
  postAttachmentPathSchema.parse(path);
  if (!(await storage.canReadPostAttachment(path, viewer)))
    throw new CommentAttachmentError("첨부 파일에 접근할 수 없습니다.");
  // Unchanged metadata belongs to the saved comment; do not revalidate legacy limits.
  if (existing?.objectPath === path) return existing;
  try {
    const file = await new ObjectStorageService().getObjectEntityFile(path);
    const [metadata] = await file.getMetadata();
    const encodedName = metadata.metadata?.downloadName;
    const name = typeof encodedName === "string" ? decodeURIComponent(encodedName) : "";
    const contentType = metadata.contentType ?? "";
    const size = Number(metadata.size);
    const type = validateUploadType(name, contentType);
    if (
      !validUploadName(name) ||
      !type.ok ||
      type.contentType !== contentType ||
      !Number.isSafeInteger(size) ||
      size <= 0 ||
      size > uploadSizeLimit(contentType).bytes
    )
      throw new CommentAttachmentError("첨부 파일의 형식이나 크기를 확인해 주세요.");
    return { objectPath: path, name, size, contentType };
  } catch (error) {
    if (error instanceof ObjectNotFoundError || error instanceof URIError)
      throw new CommentAttachmentError("첨부 파일을 확인할 수 없습니다. 다시 첨부해 주세요.");
    throw error;
  }
}
