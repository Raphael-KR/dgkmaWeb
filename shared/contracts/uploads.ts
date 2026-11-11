// Shared by file pickers, upload validation and storage responses.
export const IMAGE_UPLOAD_MAX_MB = 5;
export const DOCUMENT_UPLOAD_MAX_MB = 10;
export const DOCUMENT_ATTACHMENT_LIMIT = 5;
export const IMAGE_UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_CONTENT_TYPES.join(",");
export const POST_ATTACHMENT_LIMIT = 40;

export const DOCUMENT_UPLOAD_TYPES = {
  pdf: "application/pdf",
  hwpx: "application/hwp+zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
} as const;
export type DocumentUploadExtension = keyof typeof DOCUMENT_UPLOAD_TYPES;
export const DOCUMENT_UPLOAD_ACCEPT = Object.keys(DOCUMENT_UPLOAD_TYPES)
  .map((extension) => `.${extension}`)
  .join(",");
export const DOCUMENT_UPLOAD_LABEL = Object.keys(DOCUMENT_UPLOAD_TYPES).join("·").toUpperCase();

const imageExtensions: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};
const legacyDocumentReplacements = { hwp: "hwpx", doc: "docx", xls: "xlsx", ppt: "pptx" } as const;
export const UPLOAD_INVALID_TYPE_MESSAGE = "허용되지 않는 파일 형식입니다.";
type UploadTypeValidation =
  { ok: true; kind: "image" | "document"; contentType: string } | { ok: false; message: string };

export function uploadExtension(name: string): string {
  return name.includes(".") ? name.split(".").at(-1)!.toLowerCase() : "";
}

export function validateUploadType(name: string, reportedType: string): UploadTypeValidation {
  const extension = uploadExtension(name);
  if (Object.hasOwn(legacyDocumentReplacements, extension)) {
    const replacement =
      legacyDocumentReplacements[extension as keyof typeof legacyDocumentReplacements];
    return {
      ok: false,
      message: `'.${extension}'는 보안상의 이유로 첨부할 수 없습니다.\n'.${replacement}'로 변환해서 올려 주세요.`,
    };
  }
  if (Object.hasOwn(imageExtensions, extension))
    return { ok: true, kind: "image", contentType: imageExtensions[extension] };
  // Clipboard images can have no filename extension; document types always require one.
  if (!extension && isUploadImageContentType(reportedType))
    return { ok: true, kind: "image", contentType: reportedType };
  if (Object.hasOwn(DOCUMENT_UPLOAD_TYPES, extension))
    return {
      ok: true,
      kind: "document",
      contentType: DOCUMENT_UPLOAD_TYPES[extension as DocumentUploadExtension],
    };
  return { ok: false, message: UPLOAD_INVALID_TYPE_MESSAGE };
}

export type UploadedFile = { objectPath: string; name: string; size: number; contentType: string };

export function formatUploadSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const imageContentTypes = new Set<string>(IMAGE_UPLOAD_CONTENT_TYPES);
export function isUploadImageContentType(contentType: string): boolean {
  return imageContentTypes.has(contentType);
}

export function uploadSizeLimit(contentType: string) {
  const mb = isUploadImageContentType(contentType) ? IMAGE_UPLOAD_MAX_MB : DOCUMENT_UPLOAD_MAX_MB;
  return { mb, bytes: mb * 1024 * 1024 };
}
