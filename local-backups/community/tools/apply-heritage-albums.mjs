import { migrationTarget } from "./migration-target.mjs";
// One-time whole-catalogue import. Source archive and SQLite stay local.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const fail = (error) => {
  console.error(
    JSON.stringify({
      status: "failed",
      reason: error?.reason,
      errorType: error?.constructor?.name ?? "UnknownError",
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
if (!workspace || !payload || !["--validate", "--preview", "--apply"].includes(mode))
  throw new Error("Invalid arguments");
const selected = migrationTarget(workspace, environment, expectedDatabase);
const { heritageCatalogSchema, HERITAGE_CATALOG_MAX_BYTES } = await import(
  pathToFileURL(resolve(workspace, "server/modules/heritage/catalog-schema.ts"))
);
const { objectStorageClient } = await import(
  pathToFileURL(resolve(workspace, "server/integrations/object-storage/objectStorage.ts"))
);
const { validateUploadContents } = await import(
  pathToFileURL(resolve(workspace, "server/integrations/object-storage/upload-file-validation.ts"))
);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const catalogBytes = await readFile(resolve(payload, "catalog.json"));
if (catalogBytes.length > HERITAGE_CATALOG_MAX_BYTES) throw new Error("Catalog too large");
const catalog = heritageCatalogSchema.parse(JSON.parse(catalogBytes.toString("utf8")));
const files = [...new Set(catalog.photos.map((photo) => photo.file))];
const inventory = await readdir(resolve(payload, "photos"));
if (inventory.length !== files.length || inventory.some((file) => !files.includes(file)))
  throw new Error("Payload file mismatch");
const photoType = (file) =>
  ({
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
  })[file.split(".").pop().toLowerCase()];
const data = new Map();
for (const file of files) {
  const bytes = await readFile(resolve(payload, "photos", file));
  if (digest(bytes) !== file.split(".")[0] || bytes.length > 5 * 1024 * 1024)
    throw new Error("Invalid photo data");
  await validateUploadContents(bytes, file, photoType(file));
  data.set(file, bytes);
}
console.log(
  JSON.stringify({
    mode,
    environment,
    albums: catalog.albums.length,
    photoEntries: catalog.photos.length,
    uniqueFiles: files.length,
  }),
);
if (mode === "--validate") process.exit(0);
const pool = await selected.pool();
const connection = await pool.connect();
await selected.verifyDatabase(connection);
connection.release();
await pool.end();
const privateDir = selected.privateDir();
const [bucketName, ...directory] = privateDir.replace(/^\//, "").split("/");
if (!bucketName || !directory.length) throw new Error("Invalid private object directory");
const prefix = `${directory.join("/")}/heritage/${environment}`;
const bucket = objectStorageClient.bucket(bucketName);
const target = bucket.file(`${prefix}/catalog.json`);
const [exists] = await target.exists();
const generation = exists ? (await target.getMetadata())[0].generation : 0;
console.log(
  JSON.stringify({
    mode,
    environment,
    albums: catalog.albums.length,
    photoEntries: catalog.photos.length,
    uniqueFiles: files.length,
    replacesCatalog: exists,
  }),
);
if (mode === "--preview") process.exit(0);
let added = 0,
  reused = 0,
  verified = 0;
for (const file of files) {
  const object = bucket.file(`${prefix}/photos/${file}`);
  const [present] = await object.exists();
  if (!present) {
    await object.save(data.get(file), {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: 0 },
      metadata: { contentType: photoType(file), cacheControl: "private, no-store" },
    });
    added++;
  } else reused++;
  const [stored] = await object.download();
  if (digest(stored) !== file.split(".")[0]) throw new Error("Stored photo verification failed");
  verified++;
  if (verified % 50 === 0)
    console.log(JSON.stringify({ verified, total: files.length, added, reused }));
}
await target.save(catalogBytes, {
  resumable: false,
  preconditionOpts: { ifGenerationMatch: generation },
  metadata: { contentType: "application/json", cacheControl: "private, no-store" },
});
const [storedCatalog] = await target.download();
if (digest(storedCatalog) !== digest(catalogBytes))
  throw new Error("Stored catalog verification failed");
const receipt = {
  appliedAt: new Date().toISOString(),
  environment,
  albums: catalog.albums.length,
  photoEntries: catalog.photos.length,
  uniqueFiles: files.length,
  added,
  reused,
  verified,
  catalogSha256: digest(storedCatalog),
  catalogVerified: true,
  databaseWrites: 0,
  database: expectedDatabase,
  catalogReplaced: exists,
  orphanFilesDeleted: 0,
};
await writeFile(
  resolve(payload, `application-${environment}-${Date.now()}-${randomUUID()}.json`),
  JSON.stringify(receipt, null, 2) + "\n",
  { mode: 0o600 },
);
console.log(JSON.stringify(receipt));
