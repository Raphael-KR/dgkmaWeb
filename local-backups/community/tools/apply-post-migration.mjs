import { migrationTarget } from "./migration-target.mjs";
// Final payload validation/import only. Original backups and SQLite stay on the Mac.
import { readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
let stage = "arguments",
  sourceId;
const fail = (error) => {
  console.error(
    JSON.stringify({
      status: "failed",
      stage,
      sourceId,
      errorType: error?.constructor?.name,
      reason: error?.reason,
      code:
        typeof error?.code === "string" && /^[A-Z0-9_]+$/.test(error.code) ? error.code : undefined,
    }),
  );
  process.exit(1);
};
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
const [workspace, payload, mode = "--validate", environment, expectedDatabase] =
  process.argv.slice(2);
if (
  !workspace ||
  !payload ||
  !["--validate", "--preview", "--apply", "--reset-and-apply"].includes(mode)
)
  throw new Error("Invalid arguments");
const target = migrationTarget(workspace, environment, expectedDatabase);
const load = (path) => import(pathToFileURL(resolve(workspace, path)));
const { normalizePostDocument } = await load("shared/editor/post-document.ts");
const { insertPostSchema } = await load("shared/contracts/index.ts");
const { postImportDataSchema } = await load("shared/contracts/post-import.ts");
const { postAttachmentPaths } = await load("shared/contracts/post-input.ts");
const { validateUploadType, uploadSizeLimit } = await load("shared/contracts/uploads.ts");
const { validateUploadContents, validUploadName } = await load(
  "server/integrations/object-storage/upload-file-validation.ts",
);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sorted = (value) =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, sorted(value[key])]),
        )
      : value;
const contentHash = (value) => hash(JSON.stringify(sorted(value)));
const plan = JSON.parse(await readFile(resolve(payload, "posts.json"), "utf8"));
if (plan.schemaVersion !== 2 || plan.platform !== "daum-cafe" || plan.containerId !== "1Tcxq")
  throw new Error("Expected final Daum payload v2");
if (new Set(plan.posts.map((post) => post.sourceId)).size !== plan.posts.length)
  throw new Error("Duplicate planned source identity");
const data = new Map();
stage = "file-validation";
for (const file of plan.assets) {
  if (
    !/^[a-f0-9-]{36}$/.test(file.id) ||
    file.objectPath !== `/objects/uploads/${file.id}` ||
    !validUploadName(file.name)
  )
    throw new Error("Invalid asset");
  const type = validateUploadType(file.name, file.contentType);
  if (!type.ok || type.contentType !== file.contentType) throw new Error("Invalid file type");
  const bytes = await readFile(resolve(payload, "files", file.id));
  if (
    hash(bytes) !== file.sha256 ||
    bytes.length !== file.bytes ||
    bytes.length > uploadSizeLimit(file.contentType).bytes
  )
    throw new Error("Invalid file contents");
  await validateUploadContents(bytes, file.name, file.contentType);
  data.set(file.id, bytes);
}
const paths = new Set(plan.assets.map((file) => file.objectPath));
stage = "document-validation";
for (const post of plan.posts) {
  sourceId = post.sourceId;
  post.importData = postImportDataSchema.omit({ importedAt: true }).parse(post.importData);
  if (
    post.authorId !== null ||
    typeof post.authorName !== "string" ||
    !post.authorName.trim() ||
    post.importData.sourceId !== post.sourceId ||
    post.importData.platform !== plan.platform ||
    post.importData.containerId !== plan.containerId ||
    post.importData.url !== post.sourceUrl ||
    new Date(post.importData.originalCreatedAt).toISOString() !==
      new Date(post.publishedAt).toISOString()
  )
    throw Object.assign(new Error("Invalid source metadata"), {
      reason: "source-identity-author-or-date-mismatch",
    });
  post.content = normalizePostDocument(post.content);
  insertPostSchema.parse({
    title: post.title,
    content: post.content,
    categoryId: 1,
    imageUrls: post.imageUrls,
    isPublished: true,
  });
  if (postAttachmentPaths(post).some((path) => !paths.has(path)))
    throw new Error("Unresolved attachment");
  post.contentSha256 = contentHash(post.content);
}
sourceId = undefined;
console.log(JSON.stringify({ stage, posts: plan.posts.length, assets: plan.assets.length, mode }));
if (mode === "--validate") process.exit(0);
const pool = await target.pool();
const client = await pool.connect();
await target.verifyDatabase(client);
await client.query("BEGIN READ ONLY");
const categories = new Map(
  (await client.query("select id,name from categories where is_active=true")).rows.map((row) => [
    row.name,
    row.id,
  ]),
);
const before = (await client.query("select count(*)::int as count from posts")).rows[0].count;
const beforeComments = (await client.query("select count(*)::int as count from comments")).rows[0]
  .count;
await client.query("ROLLBACK");
for (const post of plan.posts)
  if (!categories.has(post.categoryName))
    throw Object.assign(new Error("Missing category"), {
      reason: "missing-category:" + post.categoryName,
    });
console.log(
  JSON.stringify({
    stage: "preview",
    environment,
    database: expectedDatabase,
    beforePosts: before,
    beforeComments,
    planned: plan.posts.length,
    resetRequested: mode === "--reset-and-apply",
  }),
);
if (mode === "--preview") {
  client.release();
  await pool.end();
  process.exit(0);
}
// Reset is explicit, never an automatic action on each platform import.
if (mode === "--apply" && before !== 0)
  throw Object.assign(new Error("Target must be reset first"), {
    reason: `expected-empty-posts:actual=${before}`,
  });
const { ObjectStorageService, ObjectNotFoundError } = await load(
  "server/integrations/object-storage/objectStorage.ts",
);
const privateDir = target.privateDir();
class TargetObjects extends ObjectStorageService {
  getPrivateObjectDir() {
    return privateDir;
  }
}
const objects = new TargetObjects();
stage = "file-application";
let uploaded = 0,
  reusedFiles = 0;
for (const file of plan.assets) {
  let object;
  try {
    object = await objects.getObjectEntityFile(file.objectPath);
  } catch (error) {
    if (!(error instanceof ObjectNotFoundError)) throw error;
  }
  if (!object) {
    await objects.uploadObjectEntity(file.id, data.get(file.id), file.contentType, file.name);
    uploaded++;
    object = await objects.getObjectEntityFile(file.objectPath);
  } else reusedFiles++;
  const [bytes] = await object.download();
  if (hash(bytes) !== file.sha256)
    throw Object.assign(new Error("Stored asset mismatch"), {
      reason: "asset-hash-mismatch:id=" + file.id,
    });
}
const records = [];
stage = "database-application";
await client.query("BEGIN");
try {
  await client.query("LOCK TABLE posts IN SHARE ROW EXCLUSIVE MODE");
  const current = (await client.query("select count(*)::int as count from posts")).rows[0].count;
  if (mode === "--reset-and-apply") await client.query("DELETE FROM posts");
  else if (current !== 0)
    throw Object.assign(new Error("Target changed"), {
      reason: `expected-empty-posts:actual=${current}`,
    });
  for (const post of plan.posts) {
    sourceId = post.sourceId;
    const importData = postImportDataSchema.parse({
      ...post.importData,
      importedAt: new Date().toISOString(),
    });
    const { rows } = await client.query(
      "insert into posts (title,content,category_id,author_id,author_name,import_data,is_published,is_hidden,image_urls,published_at) values ($1,$2::jsonb,$3,NULL,$4,$5::jsonb,true,false,$6,($7::timestamptz AT TIME ZONE 'UTC')) returning id",
      [
        post.title,
        JSON.stringify(post.content),
        categories.get(post.categoryName),
        post.authorName,
        JSON.stringify(importData),
        post.imageUrls,
        post.publishedAt,
      ],
    );
    records.push({
      sourceId: post.sourceId,
      targetPostId: rows[0].id,
      sourceSha256: post.sourceSha256,
      contentSha256: post.contentSha256,
      categoryName: post.categoryName,
      importDataSha256: contentHash(importData),
    });
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
}
client.release(true);
stage = "new-connection-verification";
const verify = await pool.connect();
await target.verifyDatabase(verify);
for (const post of plan.posts) {
  sourceId = post.sourceId;
  const id = records.find((record) => record.sourceId === post.sourceId).targetPostId;
  const row = (
    await verify.query(
      "select *,published_at AT TIME ZONE 'UTC' as source_date from posts where id=$1",
      [id],
    )
  ).rows[0];
  if (
    !row ||
    contentHash(row.content) !== post.contentSha256 ||
    row.author_id !== null ||
    row.author_name !== post.authorName ||
    row.title !== post.title ||
    row.category_id !== categories.get(post.categoryName) ||
    !row.is_published ||
    row.is_hidden ||
    JSON.stringify(row.image_urls) !== JSON.stringify(post.imageUrls) ||
    new Date(row.source_date).toISOString() !== new Date(post.publishedAt).toISOString() ||
    contentHash(row.import_data) !==
      records.find((record) => record.targetPostId === id).importDataSha256
  )
    throw Object.assign(new Error("Post verification mismatch"), {
      reason: "stored-post-mismatch:id=" + id,
    });
}
const after = (await verify.query("select count(*)::int as count from posts")).rows[0].count;
if (after !== plan.posts.length)
  throw Object.assign(new Error("Count mismatch"), {
    reason: `post-count:expected=${plan.posts.length},actual=${after}`,
  });
verify.release();
await pool.end();
sourceId = undefined;
const report = {
  appliedAt: new Date().toISOString(),
  database: expectedDatabase,
  environment,
  beforePosts: before,
  beforeComments,
  afterPosts: after,
  resetPerformed: mode === "--reset-and-apply",
  inserted: records.length,
  uploaded,
  reusedFiles,
  verifiedPosts: records.length,
  verifiedFiles: plan.assets.length,
  records,
  payloadSha256: hash(await readFile(resolve(payload, "posts.json"))),
};
await writeFile(
  resolve(payload, `application-${environment}-${Date.now()}-${randomUUID()}.json`),
  JSON.stringify(report, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify({ ...report, records: undefined }));
