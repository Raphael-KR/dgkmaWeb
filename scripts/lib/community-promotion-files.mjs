import { createHash, randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { readFile, rename, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileTypeFromFile } from "file-type";
import { bandAttachmentPathSchema } from "../../shared/contracts/post-input.ts";
import { uploadSizeLimit, validateUploadType } from "../../shared/contracts/uploads.ts";
import {
  validateUploadContents,
  validUploadName,
} from "../../server/integrations/object-storage/upload-file-validation.ts";
import { objectStorageClient } from "../../server/integrations/object-storage/objectStorage.ts";
import {
  BAND_VIDEO_CATALOG_MAX_BYTES,
  bandAttachmentScope,
  bandMediaPrefix,
  bandVideoCatalogSchema,
  bandVideoScope,
} from "../../server/modules/content/band-media-paths.ts";
import { visitBandFiles } from "./band-development-manifest.mjs";
import { promotionError as fail } from "./community-promotion-db.mjs";

const sourceBandPrefix = bandMediaPrefix("development");
const digestPattern = /^[a-f0-9]{64}$/;
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function promotionStore(target) {
  const [bucket, ...rest] = target.privateDir().replace(/^\//, "").split("/");
  const prefix = rest.join("/") + "/";
  return { bucket: objectStorageClient.bucket(bucket), prefix, environment: target.environment };
}

export function promotionObject(store, key) {
  const path = key
    .replace(/^heritage\/development\//, `heritage/${store.environment}/`)
    .replace(sourceBandPrefix + "/", bandMediaPrefix(store.environment) + "/");
  return store.bucket.file(store.prefix + path);
}

export function attachmentSpec(objectPath, allowBand) {
  if (/^\/objects\/uploads\/[a-f0-9-]{36}$/.test(objectPath)) {
    return { key: objectPath.slice("/objects/".length), kind: "attachment" };
  }
  if (allowBand && bandAttachmentPathSchema.safeParse(objectPath).success) {
    return { key: sourceBandPrefix + "/uploads/" + basename(objectPath), kind: "band-attachment" };
  }
  fail("unsupported-attachment-path");
}

export function photoSpec(name) {
  return { key: "heritage/development/photos/" + name, kind: "photo" };
}

const videoSpec = (hash) => ({ key: sourceBandPrefix + `/videos/${hash}.mp4`, kind: "band-video" });

export function readVideoCatalog(bytes, key) {
  if (bytes.length > BAND_VIDEO_CATALOG_MAX_BYTES) fail("video-catalog-too-large:" + bytes.length);
  const catalog = bandVideoCatalogSchema.parse(JSON.parse(bytes.toString("utf8")));
  const unique = new Set(catalog.videos.map((video) => video.sourceId));
  if (basename(key) !== catalog.sourcePostId + ".json" || unique.size !== catalog.videos.length) {
    fail("video-catalog-source-or-duplicate:" + catalog.sourcePostId);
  }
  return catalog;
}

async function readDigest(stream, path) {
  let bytes = 0;
  const hash = createHash("sha256");
  const digest = new Transform({
    transform(chunk, _encoding, done) {
      bytes += chunk.length;
      hash.update(chunk);
      done(null, chunk);
    },
  });
  const output = path
    ? createWriteStream(path, { flags: "wx", mode: 0o600 })
    : new Writable({
        write(_chunk, _encoding, done) {
          done();
        },
      });
  await pipeline(stream, digest, output);
  return { sha256: hash.digest("hex"), bytes };
}

const blobPath = (directory, file) => join(directory, "blobs", file.sha256);
const hasFileName = (file) => file.kind === "attachment" || file.kind === "band-attachment";

function storageScope(file, environment) {
  if (file.kind === "band-attachment") return bandAttachmentScope(environment);
  if (file.kind === "band-video" || file.kind === "band-catalog")
    return bandVideoScope(environment);
  return null;
}

function validateMetadata(file, meta, environment) {
  const expectedScope = storageScope(file, environment);
  const metadataName = hasFileName(file)
    ? decodeURIComponent(meta.metadata?.downloadName ?? "")
    : file.name;
  if (
    !meta.generation ||
    Number(meta.size) !== file.bytes ||
    meta.contentType !== file.contentType ||
    metadataName !== file.name ||
    (expectedScope && meta.metadata?.importScope !== expectedScope) ||
    (meta.contentEncoding && meta.contentEncoding !== "identity")
  ) {
    fail(
      `object-metadata:${file.kind}:${file.sha256 ?? "source"}:expected-size=${file.bytes}:actual-size=${meta.size}:type-matches=${meta.contentType === file.contentType}:name-matches=${metadataName === file.name}:scope-matches=${!expectedScope || meta.metadata?.importScope === expectedScope}`,
    );
  }
}

async function captureFile(store, directory, spec) {
  const object = promotionObject(store, spec.key);
  const [meta] = await object.getMetadata();
  const file = {
    ...spec,
    name: hasFileName(spec)
      ? decodeURIComponent(meta.metadata?.downloadName ?? "")
      : basename(spec.key),
    contentType: meta.contentType,
    bytes: Number(meta.size),
  };
  validateMetadata(file, meta, store.environment);
  const tmp = join(directory, "blobs", "." + randomUUID());
  try {
    const version = object.bucket.file(object.name, { generation: meta.generation });
    const read = await readDigest(version.createReadStream(), tmp);
    if (read.bytes !== file.bytes) {
      fail(`source-file-bytes:expected=${file.bytes}:actual=${read.bytes}`);
    }
    file.sha256 = read.sha256;
    await rename(tmp, blobPath(directory, file));
    return file;
  } catch (error) {
    await unlink(tmp).catch(() => {});
    throw error;
  }
}

export async function capturePromotionFiles(store, directory, specs, bandPosts) {
  const files = new Map();
  const plan = new Map(specs.map((spec) => [spec.key, spec]));
  if (bandPosts.size) {
    const prefix = store.prefix + sourceBandPrefix + "/posts/";
    for await (const object of store.bucket.getFilesStream({ prefix })) {
      const match = /^([0-9]{1,20})\.json$/.exec(object.name.slice(prefix.length));
      if (!match || !bandPosts.has(match[1])) continue;
      const spec = { key: object.name.slice(store.prefix.length), kind: "band-catalog" };
      const file = await captureFile(store, directory, spec);
      const catalog = readVideoCatalog(await readFile(blobPath(directory, file)), file.key);
      for (const video of catalog.videos) {
        const spec = videoSpec(video.sha256);
        plan.set(spec.key, spec);
      }
      files.set(file.key, file);
    }
  }
  await visitBandFiles([...plan.values()], async (spec) => {
    files.set(spec.key, await captureFile(store, directory, spec));
  });
  return [...files.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function validSpec(file) {
  if (file.kind === "attachment") return /^uploads\/[a-f0-9-]{36}$/.test(file.key);
  if (file.kind === "photo") {
    return (
      /^heritage\/development\/photos\/[a-f0-9]{64}\.(jpg|png|webp|gif)$/.test(file.key) &&
      basename(file.key).split(".")[0] === file.sha256
    );
  }
  if (!file.key.startsWith(sourceBandPrefix + "/")) return false;
  const relative = file.key.slice(sourceBandPrefix.length + 1);
  if (file.kind === "band-attachment") {
    return (
      relative.startsWith("uploads/") &&
      relative === "uploads/" + basename(relative) &&
      bandAttachmentPathSchema.safeParse("/objects/band-imports/" + basename(relative)).success
    );
  }
  if (file.kind === "band-video") return file.key === videoSpec(file.sha256).key;
  return file.kind === "band-catalog" && /^posts\/[0-9]{1,20}\.json$/.test(relative);
}

export async function validatePromotionFiles(directory, files, references, bandPosts, version) {
  const byKey = new Map();
  for (const file of files) {
    if (
      !file ||
      typeof file.key !== "string" ||
      !digestPattern.test(file.sha256) ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes <= 0 ||
      byKey.has(file.key) ||
      !validSpec(file) ||
      (version === 1 && file.kind.startsWith("band-"))
    ) {
      fail("invalid-snapshot-file-entry");
    }
    byKey.set(file.key, file);
  }
  let videoPosts = 0;
  let videoReferences = 0;
  await visitBandFiles(files, async (file) => {
    const path = blobPath(directory, file);
    if (file.contentType === "video/mp4" && ["band-video", "band-attachment"].includes(file.kind)) {
      const read = await readDigest(createReadStream(path));
      if (
        read.bytes !== file.bytes ||
        read.sha256 !== file.sha256 ||
        (await fileTypeFromFile(path))?.mime !== file.contentType
      )
        fail("video-validation:" + file.sha256);
      return;
    }
    const data = await readFile(path);
    if (data.length !== file.bytes || sha256(data) !== file.sha256)
      fail("file-digest:" + file.sha256);
    if (file.kind === "band-catalog") {
      const catalog = readVideoCatalog(data, file.key);
      if (file.contentType !== "application/json" || !bandPosts.has(catalog.sourcePostId)) {
        fail("unexpected-video-catalog:" + catalog.sourcePostId);
      }
      for (const video of catalog.videos) {
        const spec = videoSpec(video.sha256);
        const blob = byKey.get(spec.key);
        if (blob?.bytes !== video.size || blob.contentType !== video.contentType) {
          fail("unverified-catalog-video:" + video.sha256);
        }
        references.add(spec.key);
        videoReferences++;
      }
      references.add(file.key);
      videoPosts++;
      return;
    }
    const type = validateUploadType(file.name, file.contentType);
    if (
      file.kind === "band-video" ||
      !validUploadName(file.name) ||
      !type.ok ||
      type.contentType !== file.contentType ||
      data.length > uploadSizeLimit(file.contentType).bytes
    ) {
      fail("file-type-validation:" + file.sha256);
    }
    await validateUploadContents(data, file.name, file.contentType);
  });
  const missing = [...references].filter((key) => !byKey.has(key)).length;
  if (missing || references.size !== byKey.size) {
    fail(
      `snapshot-file-references:expected=${references.size}:actual=${byKey.size}:missing=${missing}`,
    );
  }
  return { videoPosts, videoReferences };
}

export async function existingPromotionFiles(store, files) {
  const names = files.map(({ key }) => promotionObject(store, key).name);
  const selected = new Set(names);
  const prefixes = new Set(names.map((name) => name.slice(0, name.lastIndexOf("/") + 1)));
  const existing = new Set();
  // List the target folders once. The create-only precondition still handles a concurrent upload.
  for (const prefix of prefixes) {
    for await (const object of store.bucket.getFilesStream({ prefix })) {
      if (selected.has(object.name)) existing.add(object.name);
    }
  }
  return existing;
}

export async function copyPromotionFile(store, directory, file, existing) {
  const object = promotionObject(store, file.key);
  if (!existing.has(object.name)) {
    const metadata = {};
    const scope = storageScope(file, store.environment);
    if (scope) metadata.importScope = scope;
    if (hasFileName(file)) {
      metadata.downloadName = encodeURIComponent(file.name).replace(
        /['()*]/g,
        (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
      );
    }
    try {
      await pipeline(
        createReadStream(blobPath(directory, file)),
        object.createWriteStream({
          resumable: false,
          preconditionOpts: { ifGenerationMatch: 0 },
          metadata: { contentType: file.contentType, cacheControl: "private, no-store", metadata },
        }),
      );
    } catch (error) {
      if (Number(error.code) !== 412) throw error;
    }
  }
  const [meta] = await object.getMetadata();
  validateMetadata(file, meta, store.environment);
  const version = object.bucket.file(object.name, { generation: meta.generation });
  const read = await readDigest(version.createReadStream());
  if (read.sha256 !== file.sha256 || read.bytes !== file.bytes) {
    fail(
      `production-file-digest:expected=${file.sha256}:actual=${read.sha256}:bytes=${read.bytes}`,
    );
  }
}
