// Promote a verified development snapshot, never the raw community backup.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { migrationTarget } from "./migration-target.mjs";
import {
  applyPromotionRows,
  previewPromotion,
  promotionError as fail,
  readPromotionRows,
} from "../../../scripts/lib/community-promotion-db.mjs";
import {
  attachmentSpec,
  capturePromotionFiles,
  copyPromotionFile,
  existingPromotionFiles,
  photoSpec,
  promotionObject,
  promotionStore,
  validatePromotionFiles,
} from "../../../scripts/lib/community-promotion-files.mjs";
import { visitBandFiles } from "../../../scripts/lib/band-development-manifest.mjs";
import { bandContainerId } from "../../../server/modules/content/band-media-paths.ts";
import {
  HERITAGE_CATALOG_MAX_BYTES,
  heritageCatalogSchema,
} from "../../../server/modules/heritage/catalog-schema.ts";
import { normalizePostDocument } from "../../../shared/editor/post-document.ts";
import { insertPostSchema } from "../../../shared/contracts/index.ts";
import { postImportDataSchema } from "../../../shared/contracts/post-import.ts";
import { postAttachmentPaths } from "../../../shared/contracts/post-input.ts";
import { isUploadImageContentType } from "../../../shared/contracts/uploads.ts";

process.umask(0o077);
let stage = "arguments";
const progress = { filesVerified: 0, databaseCommitted: false, catalogPublished: false };
const [workspace, directory, mode, expectedDatabase] = process.argv.slice(2);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const checksum = (value) =>
  hash(
    JSON.stringify(value, (_key, item) =>
      item && typeof item === "object" && !Array.isArray(item)
        ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
        : item,
    ),
  );
const catalogKey = "heritage/development/catalog.json";
const positiveId = (value) => Number.isSafeInteger(value) && value > 0 && value < 2_147_483_647;
const validDate = (value) => value === null || Number.isFinite(Date.parse(value));
const validRevision = (value) => Number.isSafeInteger(value) && value >= 0;
const validAffiliation = (value) => value === null || typeof value === "string";

function inspectSnapshot(snapshot) {
  const { schemaVersion: version, posts, comments = [] } = snapshot;
  if (
    snapshot.kind !== "development-completed-community" ||
    ![1, 2].includes(version) ||
    snapshot.sourceDatabase !== "heliumdb" ||
    !Array.isArray(posts) ||
    !Array.isArray(comments) ||
    (version === 1 && comments.length)
  )
    fail("not-a-development-content-snapshot");
  const catalog = heritageCatalogSchema.parse(snapshot.catalog);
  if (Buffer.byteLength(JSON.stringify(catalog)) > HERITAGE_CATALOG_MAX_BYTES)
    fail("catalog-too-large");
  const specs = catalog.photos.map((photo) => photoSpec(photo.file));
  const postById = new Map();
  const sourceKeys = new Set();
  const bandPosts = new Set();
  for (const post of posts) {
    if (
      !positiveId(post.id) ||
      postById.has(post.id) ||
      post.author_id !== null ||
      !post.category_name ||
      typeof post.author_name !== "string" ||
      !post.author_name.trim() ||
      (version === 2 && !validAffiliation(post.author_affiliation))
    )
      fail("invalid-post-identity");
    postById.set(post.id, post);
    const source = postImportDataSchema.parse(post.import_data);
    const sourceKey = JSON.stringify([source.platform, source.containerId, source.sourceId]);
    if (sourceKeys.has(sourceKey)) fail("duplicate-post-origin:" + post.id);
    sourceKeys.add(sourceKey);
    const band = source.platform === "band";
    if (band) {
      if (version !== 2 || source.containerId !== bandContainerId) {
        fail("unexpected-band-source:" + post.id);
      }
      bandPosts.add(source.sourceId);
    }
    if (checksum(normalizePostDocument(post.content)) !== checksum(post.content)) {
      fail("noncanonical-source-document:" + post.id);
    }
    // The BAND import already verified original gallery counts, including those above the compose limit.
    if (post.image_urls !== null && !Array.isArray(post.image_urls))
      fail("invalid-post-images:" + post.id);
    insertPostSchema.parse({
      title: post.title,
      content: post.content,
      imageUrls: band ? [] : post.image_urls,
      categoryId: 1,
      isPublished: true,
    });
    if (
      !validRevision(post.revision) ||
      typeof post.is_hidden !== "boolean" ||
      ![post.published_at, post.created_at, post.updated_at].every(validDate)
    )
      fail("invalid-post-state:" + post.id);
    for (const path of postAttachmentPaths({ content: post.content, imageUrls: post.image_urls })) {
      specs.push(attachmentSpec(path, band));
    }
  }
  const commentById = new Map();
  const commentKeys = new Set();
  const commentFiles = [];
  for (const comment of comments) {
    const post = postById.get(comment.post_id);
    const source = comment.import_source_id;
    if (
      !positiveId(comment.id) ||
      commentById.has(comment.id) ||
      commentKeys.has(source) ||
      comment.author_id !== null ||
      !comment.author_name?.trim() ||
      !validAffiliation(comment.author_affiliation) ||
      post?.import_data.platform !== "band" ||
      !/^post:[1-9]\d*\/comment:[1-9]\d*(?:\/reply:[1-9]\d*)?$/.test(source) ||
      !source.startsWith("post:" + post.import_data.sourceId + "/comment:")
    ) {
      fail("invalid-comment-origin:" + comment.id);
    }
    commentById.set(comment.id, comment);
    commentKeys.add(source);
    const multiple = Array.isArray(comment.attachment);
    const attachments = multiple ? comment.attachment : [comment.attachment].filter(Boolean);
    if (
      typeof comment.content !== "string" ||
      (!comment.content.trim() && !attachments.length) ||
      (multiple && !attachments.length) ||
      !validRevision(comment.revision) ||
      typeof comment.is_hidden !== "boolean" ||
      ![comment.created_at, comment.edited_at].every(validDate)
    )
      fail("invalid-comment-state:" + comment.id);
    for (const attachment of attachments) {
      const spec = attachmentSpec(attachment.objectPath, true);
      if (
        spec.kind !== "band-attachment" ||
        (multiple &&
          !isUploadImageContentType(attachment.contentType) &&
          attachment.contentType !== "video/mp4")
      ) {
        fail("invalid-comment-attachment:" + comment.id);
      }
      specs.push(spec);
      commentFiles.push({ key: spec.key, attachment, commentId: comment.id });
    }
  }
  for (const comment of comments) {
    const rootKey = comment.import_source_id.split("/reply:")[0];
    const parent = commentById.get(comment.parent_comment_id);
    if (
      rootKey === comment.import_source_id
        ? comment.parent_comment_id !== null
        : parent?.import_source_id !== rootKey || parent.post_id !== comment.post_id
    ) {
      fail("invalid-parent-comment:" + comment.id);
    }
  }
  return { catalog, specs, bandPosts, commentFiles };
}

async function run() {
  if (
    !workspace ||
    !directory ||
    ![
      "--export-development",
      "--validate",
      "--preview-production",
      "--apply-production",
      "--reset-and-apply-production",
    ].includes(mode)
  )
    fail("invalid-promotion-arguments");
  const snapshotPath = resolve(directory, "development-content.json");
  if (mode === "--export-development") {
    stage = "export-development";
    const target = migrationTarget(workspace, "development", "heliumdb");
    await mkdir(directory, { mode: 0o700 });
    await mkdir(resolve(directory, "blobs"), { mode: 0o700 });
    const pool = await target.pool();
    const client = await pool.connect();
    let rows;
    try {
      await target.verifyDatabase(client);
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      rows = await readPromotionRows(client, 2);
      await client.query("COMMIT");
    } finally {
      client.release(true);
      await pool.end();
    }
    const store = promotionStore(target);
    const catalogObject = promotionObject(store, catalogKey);
    const [catalogBytes] = await catalogObject.download();
    if (catalogBytes.length > HERITAGE_CATALOG_MAX_BYTES) fail("catalog-too-large");
    const snapshot = {
      kind: "development-completed-community",
      schemaVersion: 2,
      sourceDatabase: "heliumdb",
      exportedAt: new Date().toISOString(),
      posts: rows.posts,
      comments: rows.comments,
      excludedPosts: rows.counts.posts - rows.posts.length,
      excludedComments: rows.counts.comments - rows.comments.length,
      catalog: JSON.parse(catalogBytes.toString("utf8")),
    };
    const { catalog, specs, bandPosts } = inspectSnapshot(snapshot);
    snapshot.catalog = catalog;
    stage = "export-development-files";
    snapshot.files = await capturePromotionFiles(store, directory, specs, bandPosts);
    const [again] = await catalogObject.download();
    if (!again.equals(catalogBytes)) fail("catalog-changed-during-export");
    const bytes = JSON.stringify(snapshot) + "\n";
    await writeFile(snapshotPath, bytes, { mode: 0o600, flag: "wx" });
    console.log(
      JSON.stringify({
        mode,
        posts: snapshot.posts.length,
        comments: snapshot.comments.length,
        excludedPosts: snapshot.excludedPosts,
        excludedComments: snapshot.excludedComments,
        albums: catalog.albums.length,
        files: snapshot.files.length,
        snapshotSha256: hash(bytes),
      }),
    );
    return;
  }

  stage = "snapshot-validation";
  const bytes = await readFile(snapshotPath);
  const snapshot = JSON.parse(bytes);
  const { catalog, specs, bandPosts, commentFiles } = inspectSnapshot(snapshot);
  if (!Array.isArray(snapshot.files)) fail("invalid-snapshot-files");
  const fileReport = await validatePromotionFiles(
    directory,
    snapshot.files,
    new Set(specs.map((spec) => spec.key)),
    bandPosts,
    snapshot.schemaVersion,
  );
  const byKey = new Map(snapshot.files.map((file) => [file.key, file]));
  for (const { key, attachment, commentId } of commentFiles) {
    const file = byKey.get(key);
    if (
      file.name !== attachment.name ||
      file.contentType !== attachment.contentType ||
      file.bytes !== attachment.size
    )
      fail("comment-attachment-metadata:" + commentId);
  }
  const report = {
    mode,
    posts: snapshot.posts.length,
    comments: snapshot.comments?.length ?? 0,
    replies: snapshot.comments?.filter((row) => row.parent_comment_id !== null).length ?? 0,
    albums: catalog.albums.length,
    photoEntries: catalog.photos.length,
    files: snapshot.files.length,
    ...fileReport,
    snapshotSha256: hash(bytes),
  };
  console.log(JSON.stringify(report));
  if (mode === "--validate") return;

  stage = "preview-production";
  const target = migrationTarget(workspace, "production", expectedDatabase, { promotion: true });
  const pool = await target.pool();
  try {
    const previewClient = await pool.connect();
    let preview;
    try {
      await target.verifyDatabase(previewClient);
      await previewClient.query("BEGIN READ ONLY");
      preview = await previewPromotion(previewClient, snapshot);
      await previewClient.query("COMMIT");
    } finally {
      previewClient.release(true);
    }
    const store = promotionStore(target);
    const catalogObject = promotionObject(store, catalogKey);
    const [exists] = await catalogObject.exists();
    const generation = exists ? (await catalogObject.getMetadata())[0].generation : 0;
    const reset = mode === "--reset-and-apply-production";
    console.log(
      JSON.stringify({
        mode,
        database: expectedDatabase,
        before: preview.counts,
        resetRequested: reset,
        replacesAlbumCatalog: exists,
      }),
    );
    if (mode === "--preview-production") return;
    if (!reset && (preview.counts.posts || preview.counts.comments)) {
      fail(
        "production-board-not-empty:posts=" +
          preview.counts.posts +
          ":comments=" +
          preview.counts.comments,
      );
    }
    stage = "copy-production-files";
    const existing = await existingPromotionFiles(store, snapshot.files);
    await visitBandFiles(snapshot.files, async (file) => {
      await copyPromotionFile(store, directory, file, existing);
      progress.filesVerified++;
      if (progress.filesVerified % 1000 === 0) {
        console.log(JSON.stringify({ stage, filesVerified: progress.filesVerified }));
      }
    });

    const verify = async (connection) => {
      const rows = await readPromotionRows(connection, snapshot.schemaVersion);
      if (checksum(rows.posts) !== checksum(snapshot.posts)) {
        fail(
          "production-posts:expected=" +
            report.posts +
            ":actual=" +
            rows.posts.length +
            ":digest-match=false",
        );
      }
      if (checksum(rows.comments) !== checksum(snapshot.comments ?? [])) {
        fail(
          "production-comments:expected=" +
            report.comments +
            ":actual=" +
            rows.comments.length +
            ":digest-match=false",
        );
      }
      if (rows.counts.posts !== report.posts || rows.counts.comments !== report.comments) {
        fail(
          "production-board-count:posts=" + rows.counts.posts + ":comments=" + rows.counts.comments,
        );
      }
    };
    stage = "write-production-database";
    const writer = await pool.connect();
    try {
      await target.verifyDatabase(writer);
      await applyPromotionRows(writer, snapshot, preview, reset, verify);
      progress.databaseCommitted = true;
    } finally {
      writer.release(true);
    }
    stage = "publish-production-catalog";
    await catalogObject.save(JSON.stringify(catalog), {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: generation },
      metadata: { contentType: "application/json", cacheControl: "private, no-store" },
    });
    progress.catalogPublished = true;
    const [storedCatalog] = await catalogObject.download();
    if (checksum(JSON.parse(storedCatalog.toString("utf8"))) !== checksum(catalog))
      fail("production-catalog-mismatch");

    stage = "verify-new-connection";
    const reader = await pool.connect();
    try {
      await target.verifyDatabase(reader);
      await reader.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      await verify(reader);
      await reader.query("COMMIT");
    } finally {
      reader.release(true);
    }
    await writeFile(
      resolve(directory, "promotion-" + Date.now() + "-" + randomUUID() + ".json"),
      JSON.stringify(
        {
          ...report,
          ...progress,
          database: expectedDatabase,
          appliedAt: new Date().toISOString(),
          beforePosts: preview.counts.posts,
          beforeComments: preview.counts.comments,
          afterPosts: report.posts,
          afterComments: report.comments,
          postIdsPreserved: true,
          records: snapshot.posts.map((p) => ({
            platform: p.import_data.platform,
            containerId: p.import_data.containerId,
            sourceId: p.import_data.sourceId,
            developmentPostId: p.id,
            productionPostId: p.id,
          })),
          commentRecords: (snapshot.comments ?? []).map((c) => ({
            sourceId: c.import_source_id,
            postId: c.post_id,
            parentCommentId: c.parent_comment_id,
            developmentCommentId: c.id,
            productionCommentId: c.id,
          })),
          albumIds: catalog.albums.map((a) => a.id),
          physicalFilesDeleted: 0,
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600, flag: "wx" },
    );
    console.log(JSON.stringify({ status: "verified", ...report }));
  } finally {
    await pool.end();
  }
}

try {
  await run();
} catch (error) {
  console.error(
    JSON.stringify({
      stage,
      status: "failed",
      progress,
      reason: error.reason,
      errorType: error.constructor.name,
      code: /^[A-Z0-9_]+$/.test(error.code ?? "") ? error.code : undefined,
      validationFields: error.issues?.slice(0, 5).map(({ code, path }) => ({ code, path })),
    }),
  );
  process.exitCode = 1;
}
