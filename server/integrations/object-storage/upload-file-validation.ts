import { fileTypeFromBuffer } from "file-type";
import { uploadExtension } from "@shared/contracts/uploads";
import { inspectDocumentArchive, UploadFormatError } from "./upload-document-archive";

// Retain the download name, never filesystem separators or control characters.
export function validUploadName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 180 &&
    value === value.trim() &&
    !new RegExp("[\\\\/\\p{Cc}\\p{Cf}]", "u").test(value) &&
    value.isWellFormed()
  );
}

function isText(contents: Buffer): boolean {
  const bom = contents.subarray(0, 2).toString("hex");
  const encodings =
    bom === "fffe" ? ["utf-16le"] : bom === "feff" ? ["utf-16be"] : ["utf-8", "euc-kr"];
  for (const encoding of encodings) {
    try {
      const text = new TextDecoder(encoding, { fatal: true }).decode(contents);
      let binary = false;
      for (let index = 0; index < text.length; index++) {
        const code = text.charCodeAt(index);
        if (code <= 8 || code === 11 || (code >= 14 && code <= 31) || code === 127) {
          binary = true;
          break;
        }
      }
      if (!binary) return true;
    } catch {
      // A legacy Korean text file may not be UTF-8; no file contents are logged.
    }
  }
  return false;
}

export async function validateUploadContents(contents: Buffer, name: string, contentType: string) {
  const extension = uploadExtension(name);
  if (["hwpx", "docx", "xlsx", "pptx"].includes(extension)) {
    await inspectDocumentArchive(contents, extension);
    return;
  }
  if (["txt", "md", "csv"].includes(extension)) {
    if (!isText(contents))
      throw new UploadFormatError({ reason: "text_encoding_or_controls", bytes: contents.length });
    return;
  }
  let detected: string | undefined;
  try {
    detected = (await fileTypeFromBuffer(contents))?.mime;
  } catch {
    throw new UploadFormatError({
      reason: "unreadable_signature",
      expected: contentType,
      bytes: contents.length,
    });
  }
  // APNG is a PNG container and continues to use the allowed image/png response.
  if (detected !== contentType && !(contentType === "image/png" && detected === "image/apng"))
    throw new UploadFormatError({
      reason: "signature_mismatch",
      expected: contentType,
      actual: detected ?? "unknown",
      bytes: contents.length,
    });
}

export { UploadFormatError } from "./upload-document-archive";
