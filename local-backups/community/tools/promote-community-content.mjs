// Development-completed content snapshot; never accepts a backup import payload.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { migrationTarget } from "./migration-target.mjs";
process.umask(0o077);
let stage = "arguments";
const progress = { filesVerified: 0, databaseCommitted: false, catalogPublished: false };
process.on("uncaughtException", (error) => {
  console.error(
    JSON.stringify({
      stage,
      status: "failed",
      progress,
      reason: error.reason,
      errorType: error.constructor.name,
      code: /^[A-Z0-9_]+$/.test(error.code ?? "") ? error.code : undefined,
    }),
  );
  process.exit(1);
});
process.on("unhandledRejection", (error) => {
  throw error;
});
const [workspace, directory, mode, expectedDatabase] = process.argv.slice(2);
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
  throw new Error("Invalid promotion arguments");
const development = migrationTarget(workspace, "development", "heliumdb");
const load = development.load;
const { objectStorageClient } = await load("server/integrations/object-storage/objectStorage.ts");
const { heritageCatalogSchema, HERITAGE_CATALOG_MAX_BYTES } = await load(
  "server/modules/heritage/catalog-schema.ts",
);
const { normalizePostDocument } = await load("shared/editor/post-document.ts");
const { postImportDataSchema } = await load("shared/contracts/post-import.ts");
const { postAttachmentPaths } = await load("shared/contracts/post-input.ts");
const { insertPostSchema } = await load("shared/contracts/index.ts");
const { validateUploadType, uploadSizeLimit } = await load("shared/contracts/uploads.ts");
const { validateUploadContents, validUploadName } = await load(
  "server/integrations/object-storage/upload-file-validation.ts",
);
const hash = (data) => createHash("sha256").update(data).digest("hex");
const stable = (value) =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
const checksum = (value) => hash(stable(value));
const fail = (reason) => {
  throw Object.assign(new Error("Content promotion failed"), { reason });
};
const snapshotPath = resolve(directory, "development-content.json");
function bucketFor(target) {
  const [name, ...parts] = target.privateDir().replace(/^\//, "").split("/");
  return { bucket: objectStorageClient.bucket(name), prefix: parts.join("/") };
}
function objectFor(storage, key) {
  return storage.bucket.file(`${storage.prefix}/${key}`);
}
const readPostsSQL = `select p.id,p.title,p.content,p.author_id,p.author_name,p.import_data,p.is_hidden,p.revision,p.image_urls,p.event_data,p.source_text,c.name as category_name,
p.published_at AT TIME ZONE 'UTC' as published_at,p.created_at AT TIME ZONE 'UTC' as created_at,p.updated_at AT TIME ZONE 'UTC' as updated_at
from posts p join categories c on c.id=p.category_id where p.is_published=true and p.import_data is not null order by p.id`;
if (mode === "--export-development") {
  stage = "export-development";
  // A new folder per export prevents silently replacing an already approved snapshot.
  await mkdir(directory, { recursive: false, mode: 0o700 });
  await mkdir(resolve(directory, "blobs"), { mode: 0o700 });
  const pool = await development.pool();
  const client = await pool.connect();
  await development.verifyDatabase(client);
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  const posts = (await client.query(readPostsSQL)).rows;
  const total = (await client.query("select count(*)::int as count from posts")).rows[0].count;
  if (posts.some((p) => p.author_id !== null)) fail("imported-post-has-linked-account");
  await client.query("COMMIT");
  client.release();
  await pool.end();
  const storage = bucketFor(development);
  const catalogObject = objectFor(storage, "heritage/development/catalog.json");
  const [bytes] = await catalogObject.download();
  if (bytes.length > HERITAGE_CATALOG_MAX_BYTES) fail("catalog-too-large");
  const catalog = heritageCatalogSchema.parse(JSON.parse(bytes.toString("utf8")));
  const paths = [
    ...new Set(
      posts.flatMap((p) => postAttachmentPaths({ content: p.content, imageUrls: p.image_urls })),
    ),
  ];
  const files = [];
  async function capture(key, kind, name) {
    const object = objectFor(storage, key);
    const [data] = await object.download();
    const [metadata] = await object.getMetadata();
    const file = {
      key,
      kind,
      name: name ?? decodeURIComponent(metadata.metadata?.downloadName ?? ""),
      contentType: metadata.contentType,
      bytes: data.length,
      sha256: hash(data),
    };
    await writeFile(resolve(directory, "blobs", file.sha256), data, { mode: 0o600 });
    files.push(file);
  }
  for (const path of paths) {
    if (!/^\/objects\/uploads\/[a-f0-9-]{36}$/.test(path)) fail("unsupported-attachment-path");
    await capture(path.slice("/objects/".length), "attachment");
  }
  for (const file of new Set(catalog.photos.map((p) => p.file)))
    await capture("heritage/development/photos/" + file, "photo", file);
  const [again] = await catalogObject.download();
  if (hash(again) !== hash(bytes)) fail("catalog-changed-during-export");
  const snapshot = {
    kind: "development-completed-community",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    sourceDatabase: "heliumdb",
    excludedPosts: total - posts.length,
    posts,
    catalog,
    files,
  };
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2) + "\n", { mode: 0o600 });
  console.log(
    JSON.stringify({
      mode,
      posts: posts.length,
      excludedPosts: snapshot.excludedPosts,
      albums: catalog.albums.length,
      files: files.length,
      snapshotSha256: hash(await readFile(snapshotPath)),
    }),
  );
  process.exit(0);
}
stage = "snapshot-validation";
const snapshotBytes = await readFile(snapshotPath);
const snapshot = JSON.parse(snapshotBytes);
if (
  snapshot.kind !== "development-completed-community" ||
  snapshot.schemaVersion !== 1 ||
  snapshot.sourceDatabase !== "heliumdb"
)
  fail("not-a-development-content-snapshot");
const catalog = heritageCatalogSchema.parse(snapshot.catalog);
if (Buffer.byteLength(JSON.stringify(catalog)) > HERITAGE_CATALOG_MAX_BYTES)
  fail("catalog-too-large");
const keys = new Set();
const postIds = new Set();
for (const file of snapshot.files) {
  if (
    !/^[a-f0-9]{64}$/.test(file.sha256) ||
    keys.has(file.key) ||
    !["attachment", "photo"].includes(file.kind)
  )
    fail("invalid-or-duplicate-file");
  keys.add(file.key);
  if (
    file.kind === "attachment"
      ? !/^uploads\/[a-f0-9-]{36}$/.test(file.key)
      : !/^heritage\/development\/photos\/[a-f0-9]{64}\.(jpg|png|webp|gif)$/.test(file.key)
  )
    fail("invalid-file-key");
  if (file.kind === "photo" && file.key.split("/").pop().split(".")[0] !== file.sha256)
    fail("photo-filename-hash-mismatch");
  const data = await readFile(resolve(directory, "blobs", file.sha256));
  const type = validateUploadType(file.name, file.contentType);
  if (
    !validUploadName(file.name) ||
    !type.ok ||
    type.contentType !== file.contentType ||
    data.length !== file.bytes ||
    hash(data) !== file.sha256 ||
    data.length > uploadSizeLimit(file.contentType).bytes
  )
    fail("file-validation-failed:" + file.sha256);
  await validateUploadContents(data, file.name, file.contentType);
}
const referenced = new Set(catalog.photos.map((p) => "heritage/development/photos/" + p.file));
for (const post of snapshot.posts) {
  if (
    !Number.isSafeInteger(post.id) ||
    post.id < 1 ||
    postIds.has(post.id) ||
    post.author_id !== null ||
    !post.category_name ||
    typeof post.author_name !== "string"
  )
    fail("invalid-post-identity");
  postIds.add(post.id);
  postImportDataSchema.parse(post.import_data);
  const normalized = normalizePostDocument(post.content);
  if (checksum(normalized) !== checksum(post.content)) fail("noncanonical-source-document");
  insertPostSchema.parse({
    title: post.title,
    content: post.content,
    imageUrls: post.image_urls,
    categoryId: 1,
    isPublished: true,
  });
  if (
    !Number.isSafeInteger(post.revision) ||
    post.revision < 0 ||
    typeof post.is_hidden !== "boolean"
  )
    fail("invalid-post-state");
  for (const value of [post.published_at, post.created_at, post.updated_at])
    if (value !== null && !Number.isFinite(Date.parse(value))) fail("invalid-post-date");
  for (const path of postAttachmentPaths({ content: post.content, imageUrls: post.image_urls })) {
    if (!/^\/objects\/uploads\/[a-f0-9-]{36}$/.test(path)) fail("invalid-attachment-reference");
    referenced.add(path.slice("/objects/".length));
  }
}
if (keys.size !== referenced.size || [...referenced].some((key) => !keys.has(key)))
  fail("file-reference-mismatch");
console.log(
  JSON.stringify({
    mode,
    posts: snapshot.posts.length,
    albums: catalog.albums.length,
    files: keys.size,
    snapshotSha256: hash(snapshotBytes),
  }),
);
if (mode === "--validate") process.exit(0);
const target = migrationTarget(workspace, "production", expectedDatabase, { promotion: true });
const pool = await target.pool();
const client = await pool.connect();
await target.verifyDatabase(client);
await client.query(readPostsSQL + " LIMIT 0");
const categories = new Map(
  (await client.query("select id,name from categories where is_active=true")).rows.map((row) => [
    row.name,
    row.id,
  ]),
);
for (const post of snapshot.posts)
  if (!categories.has(post.category_name))
    fail("missing-production-category:" + post.category_name);
const before = (await client.query("select count(*)::int as count from posts")).rows[0].count;
const storage = bucketFor(target);
const catalogObject = objectFor(storage, "heritage/production/catalog.json");
const [exists] = await catalogObject.exists();
const generation = exists ? (await catalogObject.getMetadata())[0].generation : 0;
console.log(
  JSON.stringify({
    mode,
    database: expectedDatabase,
    beforePosts: before,
    resetRequested: mode === "--reset-and-apply-production",
    replacesAlbumCatalog: exists,
  }),
);
if (mode === "--preview-production") {
  client.release();
  await pool.end();
  process.exit(0);
}
if (mode === "--apply-production" && before !== 0)
  fail("production-posts-not-empty:actual=" + before);
stage = "copy-production-files";
for (const file of snapshot.files) {
  const key = file.key.replace(/^heritage\/development\//, "heritage/production/");
  const object = objectFor(storage, key);
  const [present] = await object.exists();
  if (!present)
    await object.save(await readFile(resolve(directory, "blobs", file.sha256)), {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: {
        contentType: file.contentType,
        cacheControl: "private, no-store",
        metadata:
          file.kind === "attachment"
            ? {
                downloadName: encodeURIComponent(file.name).replace(
                  /['()*]/g,
                  (c) => "%" + c.charCodeAt(0).toString(16),
                ),
              }
            : {},
      },
    });
  const [data] = await object.download();
  if (hash(data) !== file.sha256) fail("production-file-hash-mismatch:" + file.sha256);
  progress.filesVerified++;
}
stage = "write-production-database";
await client.query("BEGIN");
try {
  await client.query("LOCK TABLE posts IN SHARE ROW EXCLUSIVE MODE");
  const current = (await client.query("select count(*)::int as count from posts")).rows[0].count;
  if (mode === "--reset-and-apply-production") await client.query("DELETE FROM posts");
  else if (current !== 0) fail("production-changed:actual=" + current);
  for (const p of snapshot.posts)
    await client.query(
      `insert into posts (id,title,content,category_id,author_id,author_name,import_data,is_published,is_hidden,revision,image_urls,event_data,source_text,published_at,created_at,updated_at)
 values ($1,$2,$3::jsonb,$4,NULL,$5,$6::jsonb,true,$7,$8,$9,$10::jsonb,$11,($12::timestamptz AT TIME ZONE 'UTC'),($13::timestamptz AT TIME ZONE 'UTC'),($14::timestamptz AT TIME ZONE 'UTC'))`,
      [
        p.id,
        p.title,
        JSON.stringify(p.content),
        categories.get(p.category_name),
        p.author_name,
        JSON.stringify(p.import_data),
        p.is_hidden,
        p.revision,
        p.image_urls,
        JSON.stringify(p.event_data),
        p.source_text,
        p.published_at,
        p.created_at,
        p.updated_at,
      ],
    );
  await client.query(
    "select setval(pg_get_serial_sequence('posts','id'),greatest(coalesce(max(id),1),1),max(id) is not null) from posts",
  );
  await client.query("COMMIT");
  progress.databaseCommitted = true;
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
}
client.release(true);
stage = "publish-production-catalog";
await catalogObject.save(JSON.stringify(catalog), {
  resumable: false,
  preconditionOpts: { ifGenerationMatch: generation },
  metadata: { contentType: "application/json", cacheControl: "private, no-store" },
});
progress.catalogPublished = true;
const [storedCatalog] = await catalogObject.download();
if (checksum(JSON.parse(storedCatalog.toString())) !== checksum(catalog))
  fail("production-catalog-mismatch");
stage = "verify-new-connection";
const verify = await pool.connect();
await target.verifyDatabase(verify);
const rows = (await verify.query(readPostsSQL)).rows;
if (checksum(rows) !== checksum(snapshot.posts)) fail("production-post-snapshot-mismatch");
const after = (await verify.query("select count(*)::int as count from posts")).rows[0].count;
if (after !== snapshot.posts.length) fail("production-post-count-mismatch:actual=" + after);
verify.release();
await pool.end();
await writeFile(
  resolve(directory, `promotion-${Date.now()}-${randomUUID()}.json`),
  JSON.stringify(
    {
      appliedAt: new Date().toISOString(),
      database: expectedDatabase,
      snapshotSha256: hash(snapshotBytes),
      beforePosts: before,
      afterPosts: after,
      albums: catalog.albums.length,
      verifiedFiles: snapshot.files.length,
      postIdsPreserved: true,
      records: snapshot.posts.map((p) => ({
        platform: p.import_data.platform,
        containerId: p.import_data.containerId,
        sourceId: p.import_data.sourceId,
        developmentPostId: p.id,
        productionPostId: p.id,
      })),
      albumIds: catalog.albums.map((a) => a.id),
      physicalFilesDeleted: 0,
    },
    null,
    2,
  ) + "\n",
  { mode: 0o600 },
);
console.log(
  JSON.stringify({
    status: "verified",
    posts: after,
    albums: catalog.albums.length,
    files: snapshot.files.length,
  }),
);
