// Apply a reviewed development manifest. Removing previous rows requires a separate retirement file.
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { migrationTarget } from "../local-backups/community/tools/migration-target.mjs";
import { verifyLinkedAlbums } from "./lib/band-album-catalog.mjs";
import { checkRetirements, loadRetirements, removeReviewed } from "./lib/band-retirements.mjs";
import {
  CONTAINER,
  loadManifest,
  readUploadEvidence,
  requireMatch,
  verifyUploadedAssets,
} from "./lib/band-development-manifest.mjs";

const workspace = fileURLToPath(new URL("../", import.meta.url));
let stage = "arguments";
let committed = false;

// One field set serves both the previews and the verification in a new connection.
async function readBand(db) {
  const posts = (
    await db.query(
      `
    SELECT p.id, p.revision, p.import_data->>'sourceId' AS key, p.title, p.content, c.name AS category,
           p.author_id, p.author_name, p.import_data, p.image_urls, p.is_hidden, p.is_published,
           p.published_at AT TIME ZONE 'UTC' AS date
    FROM posts p JOIN categories c ON c.id = p.category_id
    WHERE p.import_data->>'platform' = 'band' AND p.import_data->>'containerId' = $1`,
      [CONTAINER],
    )
  ).rows;
  const comments = (
    await db.query(
      `
    SELECT c.id, c.revision, c.import_source_id AS key, p.import_data->>'sourceId' AS post,
           c.author_id, c.author_name, c.content, c.attachment, c.is_hidden,
           c.created_at AT TIME ZONE 'UTC' AS date, parent.import_source_id AS parent
    FROM comments c JOIN posts p ON p.id = c.post_id
    LEFT JOIN comments parent ON c.parent_comment_id = parent.id
    WHERE p.import_data->>'platform' = 'band' AND p.import_data->>'containerId' = $1
      AND c.import_source_id IS NOT NULL`,
      [CONTAINER],
    )
  ).rows;
  return {
    posts: new Map(posts.map((row) => [row.key, row])),
    comments: new Map(comments.map((row) => [row.key, row])),
  };
}

async function daumFingerprint(db) {
  return (
    await db.query(`
    SELECT count(*)::int AS count,
           md5(coalesce(string_agg(md5(to_jsonb(p)::text), '' ORDER BY p.id), '')) AS digest
    FROM posts p WHERE import_data->>'platform' = 'daum-cafe'`)
  ).rows[0];
}

function attachmentFor(assets, path) {
  if (Array.isArray(path)) return path.map((item) => attachmentFor(assets, item));
  if (path === null) return null;
  const { objectPath, contentType, name, size } = assets.get(path);
  return { objectPath, contentType, name, size };
}

function compareStored(plan, stored, assets, requireAll) {
  const missing = { posts: [], comments: [] };
  for (const post of plan.posts) {
    const row = stored.posts.get(post.sourceId);
    if (!row) {
      missing.posts.push(post);
      continue;
    }
    const { importedAt, ...source } = row.import_data;
    requireMatch(
      row.is_published &&
        !row.is_hidden &&
        row.author_id === null &&
        row.author_name === post.verifiedAuthorName &&
        row.category === post.categoryName &&
        row.title === post.title &&
        isDeepStrictEqual(row.content, post.content) &&
        isDeepStrictEqual(row.image_urls, post.imageUrls) &&
        isDeepStrictEqual(source, post.importData) &&
        Number.isFinite(Date.parse(importedAt)) &&
        row.date?.getTime() === Date.parse(post.publishedAt),
      `existing-post-differs:${post.sourceId}`,
    );
  }
  for (const comment of plan.comments) {
    const row = stored.comments.get(comment.sourceKey);
    if (!row) {
      missing.comments.push(comment);
      continue;
    }
    requireMatch(
      row.post === comment.sourcePostId &&
        row.parent === comment.parentSourceKey &&
        !row.is_hidden &&
        row.author_id === null &&
        row.author_name === comment.verifiedAuthorName &&
        row.content === comment.content &&
        row.date?.getTime() === Date.parse(comment.createdAt) &&
        isDeepStrictEqual(
          row.attachment,
          attachmentFor(assets, comment.attachmentPaths ?? comment.attachmentPath),
        ),
      `existing-comment-differs:${comment.sourceKey}`,
    );
  }
  if (requireAll)
    requireMatch(
      !missing.posts.length && !missing.comments.length,
      `missing-after-import:posts=${missing.posts.length}:comments=${missing.comments.length}`,
    );
  return missing;
}

async function insertMissing(db, missing, categoryIds, assets) {
  const importedAt = new Date().toISOString();
  const posts = missing.posts.map((p) => ({
    title: p.title,
    content: p.content,
    category_id: categoryIds.get(p.categoryName),
    author_name: p.verifiedAuthorName,
    import_data: { ...p.importData, importedAt },
    image_urls: p.imageUrls,
    published_at: p.publishedAt,
  }));
  await db.query(
    `
    INSERT INTO posts (title, content, category_id, author_name, import_data, image_urls, published_at, is_published)
    SELECT title, content, category_id, author_name, import_data, image_urls, published_at AT TIME ZONE 'UTC', true
    FROM jsonb_to_recordset($1) x(title text, content jsonb, category_id integer, author_name text,
                                  import_data jsonb, image_urls text[], published_at timestamptz)`,
    [JSON.stringify(posts)],
  );
  const comments = missing.comments.map((c) => ({
    source_id: c.sourceKey,
    parent_id: c.parentSourceKey,
    post_key: c.sourcePostId,
    author_name: c.verifiedAuthorName,
    content: c.content,
    created_at: c.createdAt,
    attachment: attachmentFor(assets, c.attachmentPaths ?? c.attachmentPath),
  }));
  // Parents must exist in this transaction before resolving reply IDs.
  for (const replies of [false, true]) {
    const batch = comments.filter((row) => (row.parent_id !== null) === replies);
    if (!batch.length) continue;
    const result = await db.query(
      `
      INSERT INTO comments (post_id, import_source_id, parent_comment_id, author_name, content, created_at, attachment)
      SELECT p.id, c.source_id, parent.id, c.author_name, c.content, c.created_at AT TIME ZONE 'UTC', c.attachment
      FROM jsonb_to_recordset($1) c(source_id text, parent_id text, post_key text,
                                    author_name text, content text, created_at timestamptz, attachment jsonb)
      JOIN posts p ON p.import_data->>'sourceId' = c.post_key AND p.import_data->>'platform' = 'band'
                  AND p.import_data->>'containerId' = $2
      LEFT JOIN comments parent ON parent.post_id = p.id AND parent.import_source_id = c.parent_id
      WHERE c.parent_id IS NULL OR parent.id IS NOT NULL`,
      [JSON.stringify(batch), CONTAINER],
    );
    requireMatch(
      result.rowCount === batch.length,
      `parent-or-post-missing:expected=${batch.length}:inserted=${result.rowCount}`,
    );
  }
}

async function run() {
  const [file, sha256, mode, receipt, receiptSha256, flag, retireFile, retireSha] =
    process.argv.slice(2);
  const retireRequested =
    process.argv.length === 10 &&
    flag === "--retire" &&
    retireFile &&
    /^[a-f0-9]{64}$/.test(retireSha);
  requireMatch(
    file &&
      /^[a-f0-9]{64}$/.test(sha256) &&
      ["--preview", "--apply", "--verify"].includes(mode) &&
      (process.argv.length === 5 ||
        ((process.argv.length === 7 || retireRequested) &&
          receipt &&
          /^[a-f0-9]{64}$/.test(receiptSha256))),
    "expected-final-manifest-sha256-mode-[upload-receipt-receiptSha256]",
  );
  const target = migrationTarget(workspace, "development", "heliumdb");
  requireMatch(
    process.env.PGDATABASE === target.expectedDatabase && process.env.PGHOST && process.env.PGUSER,
    "development-PG-environment-required",
  );
  stage = "manifest";
  const plan = await loadManifest(file, sha256);
  const retire = retireRequested
    ? await loadRetirements(retireFile, retireSha, sha256, plan)
    : null;
  if (plan.posts.some((p) => p.albumSha256))
    await verifyLinkedAlbums(plan.posts, target.privateDir());
  const assets = new Map(plan.assets.map((a) => [a.objectPath, a]));
  stage = "uploaded-files";
  if (assets.size) {
    target.privateDir();
    const evidence = receipt
      ? await readUploadEvidence(plan.assets, plan.throughKst, receipt, receiptSha256)
      : null;
    await verifyUploadedAssets(plan.assets, evidence);
  }
  const pool = await target.pool();
  try {
    stage = "development-transaction";
    let beforeDaum;
    const client = await pool.connect();
    try {
      await target.verifyDatabase(client);
      await client.query(
        mode === "--apply" ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
      );
      await client.query("SET LOCAL lock_timeout = '8s'");
      if (mode === "--apply")
        await client.query("LOCK TABLE posts, comments IN SHARE ROW EXCLUSIVE MODE");
      beforeDaum = await daumFingerprint(client);
      const categoryRows = (await client.query("SELECT id, name FROM categories WHERE is_active"))
        .rows;
      const categories = new Map(categoryRows.map((c) => [c.name, c.id]));
      for (const p of plan.posts)
        requireMatch(categories.has(p.categoryName), `inactive-category:post=${p.sourceId}`);
      const existing = await readBand(client);
      const retiring = await checkRetirements(client, retire, existing, compareStored);
      const missing = compareStored(plan, existing, assets, false);
      requireMatch(
        existing.posts.size - retiring.posts.length + missing.posts.length === plan.posts.length &&
          existing.comments.size - retiring.comments.length + missing.comments.length ===
            plan.comments.length,
        "unexpected-development-band-sources",
      );
      console.log(
        JSON.stringify({
          stage: "preview",
          postsToInsert: missing.posts.length,
          commentsToInsert: missing.comments.length,
          postsToRemove: retiring.posts.length,
          commentsToRemove: retiring.comments.length,
          totalPosts: plan.posts.length,
          totalComments: plan.comments.length,
          verifiedFiles: assets.size,
          existingDaum: beforeDaum.count,
          existingBandPosts: existing.posts.size,
          existingBandComments: existing.comments.size,
        }),
      );
      if (mode === "--apply") {
        await removeReviewed(client, retiring);
        await insertMissing(client, missing, categories, assets);
        compareStored(plan, await readBand(client), assets, true);
      }
      await client.query("COMMIT");
      committed = mode === "--apply";
    } finally {
      // Closing this connection also aborts any open, uncommitted transaction.
      client.release(true);
    }
    if (mode === "--preview") return;
    stage = "new-connection-verification";
    const verify = await pool.connect();
    try {
      await target.verifyDatabase(verify);
      await verify.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      requireMatch(
        isDeepStrictEqual(beforeDaum, await daumFingerprint(verify)),
        "daum-posts-changed",
      );
      const stored = await readBand(verify);
      compareStored(plan, stored, assets, true);
      requireMatch(
        stored.posts.size === plan.posts.length && stored.comments.size === plan.comments.length,
        "development-band-inventory-differs",
      );
      await verify.query("COMMIT");
      const verifiedAt = new Date().toISOString();
      const report = {
        verifiedAt,
        manifestSha256: sha256,
        database: target.expectedDatabase,
        completeBandInventory: true,
        verifiedPosts: plan.posts.length,
        verifiedComments: plan.comments.length,
        verifiedFiles: assets.size,
        preservedDaumPosts: beforeDaum.count,
      };
      stage = "receipt";
      await writeFile(
        resolve(dirname(file), `band-development-${Date.now()}-${randomUUID()}.json`),
        JSON.stringify({
          ...report,
          posts: plan.posts.map((p) => [p.sourceId, stored.posts.get(p.sourceId).id]),
          comments: plan.comments.map((c) => [c.sourceKey, stored.comments.get(c.sourceKey).id]),
        }) + "\n",
        { mode: 0o600, flag: "wx" },
      );
      console.log(JSON.stringify(report));
    } finally {
      verify.release(true);
    }
  } finally {
    await pool.end();
  }
}

run().catch((error) => {
  // Database and validator messages may contain original content or member names.
  console.error(
    JSON.stringify({
      stage,
      committed,
      error: error.name,
      reason: error.importDetail,
      code: /^[A-Z0-9_]+$/.test(String(error.code)) ? error.code : undefined,
      invalidFields: error.issues?.slice(0, 3).map((issue) => issue.path),
    }),
  );
  process.exitCode = 1;
});
