import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { postImportDataSchema } from "../../shared/contracts/post-import.ts";
import { insertPostSchema } from "../../shared/contracts/index.ts";
import { COMMENT_MAX_LENGTH } from "../../shared/contracts/content-limits.ts";
import {
  bandAttachmentPathSchema,
  postAttachmentPaths,
} from "../../shared/contracts/post-input.ts";
import { postDocumentImagePaths } from "../../shared/contracts/post-document.ts";
import { normalizePostDocument } from "../../shared/editor/post-document.ts";
import {
  isUploadImageContentType,
  uploadSizeLimit,
  validateUploadType,
} from "../../shared/contracts/uploads.ts";
import {
  validateUploadContents,
  validUploadName,
} from "../../server/integrations/object-storage/upload-file-validation.ts";
import {
  ObjectStorageService,
  objectStorageClient,
} from "../../server/integrations/object-storage/objectStorage.ts";
import {
  bandAttachmentScope,
  bandContainerId,
  bandMediaPrefix,
} from "../../server/modules/content/band-media-paths.ts";

export const CONTAINER = bandContainerId;
export const BAND_UPLOAD_SCOPE = bandAttachmentScope("development");

export async function visitBandFiles(files, visit) {
  // Bound both the number of in-flight requests and the memory used by byte verification.
  const batchSize = 24;
  for (let i = 0; i < files.length; i += batchSize) {
    const batch = await Promise.allSettled(files.slice(i, i + batchSize).map(visit));
    const failed = batch.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;
  }
}

function developmentBandStore(privateDir) {
  const [bucket, ...parts] = privateDir.replace(/^\//, "").replace(/\/$/, "").split("/");
  return {
    bucket: objectStorageClient.bucket(bucket),
    prefix: [...parts, bandMediaPrefix("development")].join("/") + "/",
  };
}

export function listBandUploads(privateDir) {
  const { bucket, prefix } = developmentBandStore(privateDir);
  return bucket.getFilesStream({ prefix: prefix + "uploads/" });
}

export function developmentBandObject(privateDir, relative) {
  requireMatch(
    /^(?:uploads\/[a-f0-9-]{36}|posts\/[1-9][0-9]*\.json|videos\/[a-f0-9]{64}\.mp4)$/.test(
      relative,
    ),
    "invalid-private-band-object-key",
  );
  const { bucket, prefix } = developmentBandStore(privateDir);
  return bucket.file(prefix + relative);
}
export const bandLogicalPath = bandAttachmentPathSchema;
export function bandObject(privateDir, objectPath) {
  bandLogicalPath.parse(objectPath);
  return developmentBandObject(
    privateDir,
    "uploads/" + objectPath.slice("/objects/band-imports/".length),
  );
}
export const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function requireMatch(condition, detail) {
  if (!condition) throw Object.assign(new Error("Band import check"), { importDetail: detail });
}

const id = z.string().regex(/^[1-9]\d*$/);
const name = z.string().trim().min(1).max(500);
const date = z.string().datetime({ offset: true });
const path = bandLogicalPath;
const sourceComment = z.string().regex(/^post:[1-9]\d*\/comment:[1-9]\d*(?:\/reply:[1-9]\d*)?$/);
const item = z
  .object({
    sourceId: id,
    title: z.string(),
    content: z.unknown(),
    categoryName: z.string().min(1),
    verifiedAuthorName: name,
    publishedAt: date,
    importData: postImportDataSchema.omit({ importedAt: true }),
    imageUrls: z.array(path),
    reviewedPhotoCount: z.number().int().positive().optional(),
    linkedAlbumSourceId: id.optional(),
    albumSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict();
const comment = z
  .object({
    sourcePostId: id,
    sourceKey: sourceComment,
    parentSourceKey: sourceComment.nullable(),
    verifiedAuthorName: name,
    createdAt: date,
    content: z.string(),
    originalContentLength: z.number().int().positive().optional(),
    attachmentPath: path.nullable().optional(),
    attachmentPaths: z.array(path).min(1).optional(),
  })
  .strict();
const asset = z
  .object({
    objectPath: path,
    name: z.string(),
    contentType: z.string(),
    size: z.number().int().positive(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
const manifest = z
  .object({
    format: z.literal("band-development-import-v2"),
    throughKst: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    posts: z.array(item).min(1),
    comments: z.array(comment),
    assets: z.array(asset),
  })
  .strict();

function unique(rows, key) {
  const values = new Map(rows.map((row) => [row[key], row]));
  requireMatch(
    values.size === rows.length,
    `duplicate-${key}:rows=${rows.length}:unique=${values.size}`,
  );
  return values;
}

export async function loadManifest(file, expectedHash) {
  const bytes = await readFile(file);
  requireMatch(digest(bytes) === expectedHash, `manifest-digest:actual=${digest(bytes)}`);
  const plan = manifest.parse(JSON.parse(bytes));
  const midnight = Date.parse(`${plan.throughKst}T00:00:00+09:00`);
  const cutoff = midnight + 86_400_000;
  requireMatch(
    Number.isFinite(midnight) &&
      cutoff <= Date.now() &&
      new Date(midnight + 32_400_000).toISOString().slice(0, 10) === plan.throughKst,
    "invalid-cutoff",
  );
  const assets = unique(plan.assets, "objectPath");
  const posts = unique(plan.posts, "sourceId");
  const comments = unique(plan.comments, "sourceKey");
  const usedAssets = new Set();
  for (const post of plan.posts) {
    const source = post.importData;
    requireMatch(
      source.platform === "band" &&
        source.containerId === CONTAINER &&
        source.sourceId === post.sourceId &&
        source.url === `https://band.us/band/${CONTAINER}/post/${post.sourceId}` &&
        Date.parse(source.originalCreatedAt) === Date.parse(post.publishedAt) &&
        Date.parse(post.publishedAt) < cutoff &&
        post.categoryName !== "all",
      `post-metadata:${post.sourceId}`,
    );
    // Tiptap attributes can have a null prototype. Compare the JSON representation
    // that PostgreSQL actually stores, including all marks and their attributes.
    post.content = JSON.parse(JSON.stringify(normalizePostDocument(post.content)));
    if (post.linkedAlbumSourceId) {
      requireMatch(
        post.albumSha256 && posts.get(post.linkedAlbumSourceId)?.albumSha256 === post.albumSha256,
        `unverified-shared-album:${post.sourceId}`,
      );
    }
    if (post.reviewedPhotoCount !== undefined) {
      requireMatch(
        !post.albumSha256 &&
          post.imageUrls.length === post.reviewedPhotoCount &&
          postDocumentImagePaths(post.content).length === 0,
        `reviewed-post-photo-count:${post.sourceId}`,
      );
    }
    const validated = insertPostSchema.parse({
      title: post.title,
      content: post.content,
      // Original gallery files have a reviewed count and are each verified against storage below.
      imageUrls: post.reviewedPhotoCount === undefined ? post.imageUrls : [],
    });
    requireMatch(post.title === validated.title, `post-title-whitespace:${post.sourceId}`);
    for (const ref of postAttachmentPaths(post)) {
      requireMatch(
        assets.has(ref) && assets.get(ref).contentType !== "video/mp4",
        `unknown-post-file:${post.sourceId}`,
      );
      usedAssets.add(ref);
    }
    for (const ref of [...post.imageUrls, ...postDocumentImagePaths(post.content)]) {
      requireMatch(
        isUploadImageContentType(assets.get(ref).contentType),
        `nonimage-in-photo:${post.sourceId}`,
      );
    }
  }
  for (const row of plan.comments) {
    const prefix = `post:${row.sourcePostId}/comment:`;
    const root = row.sourceKey.split("/reply:")[0];
    const expectedParent = root === row.sourceKey ? null : root;
    requireMatch(
      row.sourceKey.startsWith(prefix) &&
        posts.has(row.sourcePostId) &&
        row.parentSourceKey === expectedParent &&
        (!expectedParent || comments.has(expectedParent)) &&
        Date.parse(row.createdAt) < cutoff,
      `comment-source:${row.sourceKey}`,
    );
    requireMatch(
      (row.attachmentPath !== undefined) !== (row.attachmentPaths !== undefined),
      "ambiguous-comment-attachment",
    );
    const paths = row.attachmentPaths ?? (row.attachmentPath ? [row.attachmentPath] : []);
    const contentLength = row.content.length;
    const longComment = contentLength > COMMENT_MAX_LENGTH;
    requireMatch(
      (longComment
        ? row.originalContentLength === contentLength
        : row.originalContentLength === undefined) &&
        (row.content.trim().length > 0 || paths.length > 0),
      `invalid-comment-content:${row.sourceKey}:length=${contentLength}:source-length=${row.originalContentLength ?? "standard"}`,
    );
    for (const ref of paths) {
      const file = assets.get(ref);
      requireMatch(
        file &&
          (!row.attachmentPaths ||
            isUploadImageContentType(file.contentType) ||
            file.contentType === "video/mp4"),
        "invalid-imported-comment-file",
      );
      usedAssets.add(ref);
    }
  }
  requireMatch(
    usedAssets.size === assets.size,
    `unreferenced-assets:expected=${assets.size}:used=${usedAssets.size}`,
  );
  return plan;
}

export async function validateBandUpload(file, contents) {
  if (file.contentType === "video/mp4") {
    requireMatch(
      /^band-comment-video-[1-9][0-9]*\.mp4$/.test(file.name) &&
        file.size === contents.length &&
        digest(contents) === file.sha256,
      "invalid-comment-video",
    );
    let offset = 0;
    const boxes = new Set();
    while (offset + 8 <= contents.length) {
      const type = contents.toString("ascii", offset + 4, offset + 8);
      let size = contents.readUInt32BE(offset);
      let header = 8;
      if (size === 1) {
        requireMatch(offset + 16 <= contents.length, "truncated-video-header");
        size = Number(contents.readBigUInt64BE(offset + 8));
        header = 16;
      } else if (size === 0) size = contents.length - offset;
      requireMatch(
        size >= header && size <= contents.length - offset && (offset !== 0 || type === "ftyp"),
        "invalid-video-box",
      );
      boxes.add(type);
      offset += size;
    }
    requireMatch(
      offset === contents.length && boxes.has("moov") && boxes.has("mdat"),
      "incomplete-comment-video",
    );
    return;
  }
  const kind = validateUploadType(file.name, file.contentType);
  requireMatch(
    validUploadName(file.name) &&
      kind.ok &&
      kind.contentType === file.contentType &&
      file.size <= uploadSizeLimit(file.contentType).bytes,
    `invalid-upload-metadata:${file.objectPath}`,
  );
  const actual = digest(contents);
  requireMatch(
    contents.length === file.size && actual === file.sha256,
    `file-content:${file.objectPath}:expected-bytes=${file.size}:actual-bytes=${contents.length}:expected=${file.sha256}:actual=${actual}`,
  );
  await validateUploadContents(contents, file.name, file.contentType);
}

function storedAssetVersion(file, meta, requiredScope) {
  requireMatch(
    meta.contentType === file.contentType &&
      Number(meta.size) === file.size &&
      decodeURIComponent(meta.metadata?.downloadName ?? "") === file.name &&
      meta.generation,
    `stored-file-metadata:${file.objectPath}:expected-bytes=${file.size}:actual-bytes=${Number(meta.size)}`,
  );
  if (requiredScope) {
    requireMatch(
      meta.metadata?.importScope === requiredScope,
      `existing-object-outside-import:${file.objectPath}`,
    );
  }
  const version = {
    generation: String(meta.generation),
    metageneration: String(meta.metageneration),
  };
  requireMatch(
    /^\d+$/.test(version.metageneration) && /^\d+$/.test(version.generation),
    `missing-object-version:${file.objectPath}`,
  );
  return version;
}

export async function verifyBandStoredAsset(file, object, requiredScope) {
  const [meta] = await object.getMetadata();
  const version = storedAssetVersion(file, meta, requiredScope);
  const [contents] = await object.bucket
    .file(object.name, { generation: meta.generation })
    .download();
  await validateBandUpload(file, contents);
  return version;
}

export async function readUploadEvidence(assets, day, file, hash) {
  const raw = await readFile(file);
  requireMatch(
    digest(raw) === hash,
    `upload-receipt-digest:expected=${hash}:actual=${digest(raw)}`,
  );
  const receipt = JSON.parse(raw);
  requireMatch(
    receipt.format === "band-development-upload-receipt-v2" &&
      receipt.environment === "development" &&
      receipt.containerId === CONTAINER &&
      receipt.throughKst === day &&
      receipt.assets.length === assets.length,
    "upload-receipt-scope-or-count",
  );
  const recorded = unique(receipt.assets, "objectPath");
  for (const file of assets) {
    const row = recorded.get(file.objectPath);
    requireMatch(
      row &&
        file.sha256 === row.sha256 &&
        file.size === row.size &&
        file.name === row.name &&
        file.contentType === row.contentType &&
        /^\d+$/.test(row.generation) &&
        /^\d+$/.test(row.metageneration),
      `upload-receipt-entry:${file.objectPath}`,
    );
  }
  return recorded;
}

export async function verifyUploadedAssets(assets, evidence) {
  const privateDir = new ObjectStorageService().getPrivateObjectDir();
  if (evidence) {
    // The upload receipt verified the bytes at a pinned generation. Recheck each
    // object's metadata and both versions in the private development prefix.
    const remaining = new Map(assets.map((a) => [bandObject(privateDir, a.objectPath).name, a]));
    for await (const object of listBandUploads(privateDir)) {
      const asset = remaining.get(object.name);
      if (!asset) continue;
      const version = storedAssetVersion(asset, object.metadata, BAND_UPLOAD_SCOPE);
      const prior = evidence.get(asset.objectPath);
      requireMatch(
        version.generation === prior.generation && version.metageneration === prior.metageneration,
        `stored-object-version-changed:${asset.objectPath}`,
      );
      remaining.delete(object.name);
    }
    requireMatch(remaining.size === 0, `missing-stored-objects:${remaining.size}`);
    return;
  }
  await visitBandFiles(assets, (file) =>
    verifyBandStoredAsset(file, bandObject(privateDir, file.objectPath), BAND_UPLOAD_SCOPE),
  );
}
