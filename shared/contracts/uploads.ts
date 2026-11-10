// Shared by image pickers, upload validation and safe inline storage responses.
export const IMAGE_UPLOAD_MAX_MB = 10;
export const IMAGE_UPLOAD_MAX_BYTES = IMAGE_UPLOAD_MAX_MB * 1024 * 1024;
export const IMAGE_UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
export const IMAGE_UPLOAD_ACCEPT = IMAGE_UPLOAD_CONTENT_TYPES.join(",");
export const POST_IMAGE_LIMIT = 20;

const imageContentTypes = new Set<string>(IMAGE_UPLOAD_CONTENT_TYPES);
export function isUploadImageContentType(contentType: string): boolean {
  return imageContentTypes.has(contentType);
}
