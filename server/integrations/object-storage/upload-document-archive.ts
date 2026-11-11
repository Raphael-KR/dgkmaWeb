import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { load } from "cheerio";
import type { Readable } from "node:stream";

export class UploadFormatError extends Error {
  constructor(
    public readonly details: Record<string, string | number | boolean>,
    message = "확장자와 파일 내용이 일치하는 지원 파일인지 확인해 주세요.",
  ) {
    super(message);
    this.name = "UploadFormatError";
  }
}

const MAX_ENTRIES = 10_000;
const MAX_METADATA_BYTES = 1024 * 1024;
const officeParts: Record<string, { part: string; type: string }> = {
  docx: {
    part: "word/document.xml",
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
  },
  xlsx: {
    part: "xl/workbook.xml",
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml",
  },
  pptx: {
    part: "ppt/presentation.xml",
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml",
  },
};

function openArchive(contents: Buffer): Promise<ZipFile> {
  return new Promise((resolve, reject) =>
    fromBuffer(
      contents,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip)
          reject(new UploadFormatError({ reason: "zip_structure", bytes: contents.length }));
        else resolve(zip);
      },
    ),
  );
}

async function readMetadata(zip: ZipFile, entry: Entry): Promise<string> {
  if (entry.uncompressedSize > MAX_METADATA_BYTES)
    throw new UploadFormatError({
      reason: "document_metadata_size",
      maximum: MAX_METADATA_BYTES,
      actual: entry.uncompressedSize,
    });
  const stream = await new Promise<Readable>((resolve, reject) =>
    zip.openReadStream(entry, (error, value) => {
      if (error || !value) reject(new UploadFormatError({ reason: "document_metadata_read" }));
      else resolve(value);
    }),
  );
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_METADATA_BYTES)
      throw new UploadFormatError({
        reason: "expanded_metadata_size",
        maximum: MAX_METADATA_BYTES,
        actual: total,
      });
    chunks.push(bytes);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks));
}

/** Read the central directory and only format metadata. Never extract files to disk. */
export async function inspectDocumentArchive(contents: Buffer, extension: string): Promise<void> {
  // Modern encrypted Office files can also use CFB; the header does not prove a legacy format.
  if (contents.subarray(0, 8).equals(Buffer.from("d0cf11e0a1b11ae1", "hex")))
    throw new UploadFormatError(
      { reason: "unsupported_cfb_container", extension },
      "암호화되었거나 지원하지 않는 문서 형식입니다. 암호화되지 않은 지원 형식으로 저장해서 올려 주세요.",
    );
  if (!contents.subarray(0, 4).equals(Buffer.from("504b0304", "hex")))
    throw new UploadFormatError({ reason: "zip_signature", extension });
  const zip = await openArchive(contents);
  const entries = new Set<string>();
  const metadata = new Map<string, string>();
  try {
    if (zip.entryCount > MAX_ENTRIES)
      throw new UploadFormatError({
        reason: "archive_entry_count",
        maximum: MAX_ENTRIES,
        actual: zip.entryCount,
      });
    await new Promise<void>((resolve, reject) => {
      let stopped = false;
      const fail = (error: unknown) => {
        stopped = true;
        reject(error);
        zip.close();
      };
      zip.on("error", () => fail(new UploadFormatError({ reason: "zip_read" })));
      zip.once("end", resolve);
      zip.on("entry", (entry: Entry) => {
        void (async () => {
          if (stopped) return;
          if (entries.has(entry.fileName))
            throw new UploadFormatError({ reason: "duplicate_zip_entry" });
          if (entry.isEncrypted())
            throw new UploadFormatError(
              { reason: "encrypted_document" },
              "암호화된 문서는 첨부할 수 없습니다. 암호화를 해제한 파일을 올려 주세요.",
            );
          entries.add(entry.fileName);
          if (/(?:^|\/)vbaProject\.bin$/i.test(entry.fileName))
            throw new UploadFormatError({ reason: "macro_document" });
          if (
            [
              "[Content_Types].xml",
              "mimetype",
              "META-INF/container.xml",
              "Contents/content.hpf",
            ].includes(entry.fileName)
          )
            metadata.set(entry.fileName, await readMetadata(zip, entry));
          if (!stopped) zip.readEntry();
        })().catch(fail);
      });
      zip.readEntry();
    });
    if (extension === "hwpx") {
      const mimetype = metadata.get("mimetype")?.trim();
      const container = load(metadata.get("META-INF/container.xml") ?? "", { xml: true });
      const manifest = load(metadata.get("Contents/content.hpf") ?? "", { xml: true });
      const hasRoot = container("*")
        .toArray()
        .some((node) => container(node).attr("full-path") === "Contents/content.hpf");
      const hasSection = manifest("*")
        .toArray()
        .some((node) => /^(?:Contents\/)?section\d+\.xml$/.test(manifest(node).attr("href") ?? ""));
      if (
        mimetype !== "application/hwp+zip" ||
        !hasRoot ||
        !hasSection ||
        !entries.has("Contents/header.xml") ||
        !entries.has("Contents/section0.xml")
      )
        throw new UploadFormatError({
          reason: "hwpx_structure",
          hasRoot,
          hasSection,
          hasHeader: entries.has("Contents/header.xml"),
          hasBody: entries.has("Contents/section0.xml"),
          validMimetype: mimetype === "application/hwp+zip",
        });
      return;
    }
    const expected = officeParts[extension];
    const types = load(metadata.get("[Content_Types].xml") ?? "", { xml: true });
    const overrides = types("*").toArray();
    const validPart = overrides.some(
      (node) =>
        types(node).attr("PartName") === `/${expected.part}` &&
        types(node).attr("ContentType") === expected.type,
    );
    const macro = overrides.some((node) =>
      /macroEnabled|vbaProject/i.test(types(node).attr("ContentType") ?? ""),
    );
    if (!entries.has(expected.part) || !validPart || macro)
      throw new UploadFormatError({
        reason: "office_structure",
        extension,
        hasBody: entries.has(expected.part),
        validPart,
        macro,
      });
  } catch (error) {
    if (error instanceof UploadFormatError) throw error;
    throw new UploadFormatError({ reason: "document_structure_unreadable", extension });
  } finally {
    zip.close();
  }
}
