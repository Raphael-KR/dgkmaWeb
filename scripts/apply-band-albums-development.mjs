import { readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { migrationTarget } from "../local-backups/community/tools/migration-target.mjs";
import { validateUploadContents } from "../server/integrations/object-storage/upload-file-validation.ts";
import { visitBandFiles } from "./lib/band-development-manifest.mjs";
import {
  albumPrefix,
  standaloneAlbumPrefix,
  photoPrefix,
  check,
  sha,
  parseCatalog,
  readCatalog,
  developmentHeritage,
  mergeCatalog,
} from "./lib/band-album-catalog.mjs";

async function run() {
  const [mode, folder, expected, prior] = process.argv.slice(2);
  check(
    folder &&
      /^[a-f0-9]{64}$/.test(expected) &&
      ((mode === "--preview" && !prior) ||
        (mode === "--apply" && /^(?:empty|[a-f0-9]{64})$/.test(prior))),
    "expected-mode-package-catalogSha256-[priorCatalogSha256]",
  );
  const target = migrationTarget(
    fileURLToPath(new URL("../", import.meta.url)),
    "development",
    "heliumdb",
  );
  const pool = await target.pool();
  try {
    await target.verifyDatabase(pool);
  } finally {
    await pool.end();
  }
  const bytes = await readFile(resolve(folder, "catalog.json"));
  check(sha(bytes) === expected, "source-catalog-digest");
  const input = parseCatalog(bytes);
  const fromBand = (id, prefix) =>
    id.startsWith(prefix) && /^[1-9]\d*$/.test(id.slice(prefix.length));
  const standaloneAlbum = (album) => {
    if (!album.id.startsWith(standaloneAlbumPrefix)) return false;
    const match = /^[1-9]\d*(?:-photo-([1-9]\d*))?$/.exec(
      album.id.slice(standaloneAlbumPrefix.length),
    );
    return match && (!match[1] || album.photoIds.includes(photoPrefix + match[1]));
  };
  check(
    input.albums.length > 0 &&
      input.albums.every((album) => fromBand(album.id, albumPrefix) || standaloneAlbum(album)) &&
      input.photos.every((p) => fromBand(p.id, photoPrefix)),
    "source-album-scope",
  );
  const names = new Set(input.photos.map((p) => p.file));
  const object = developmentHeritage(target.privateDir());
  const catalogFile = object("catalog.json");
  const before = await readCatalog(catalogFile);
  const known = new Set(before.value.photos.map((p) => p.id));
  const required = new Set(input.photos.filter((p) => !known.has(p.id)).map((p) => p.file));
  const listed = await readdir(resolve(folder, "photos"), { withFileTypes: true });
  const supplied = new Set(listed.map((f) => f.name));
  check(
    listed.every((f) => f.isFile() && names.has(f.name)) &&
      [...required].every((name) => supplied.has(name)),
    "source-photo-inventory",
  );
  const combined = mergeCatalog(before.value, input);
  const combinedBytes = Buffer.from(JSON.stringify(combined) + "\n");
  parseCatalog(combinedBytes);
  const summary = {
    additions: combined.albums.length - before.value.albums.length,
    sourcePhotos: input.photos.length,
    uniqueFiles: supplied.size,
    priorSha256: before.sha256,
    totalAlbums: combined.albums.length,
    totalPhotos: combined.photos.length,
  };
  console.log(JSON.stringify(summary));
  if (mode === "--apply") check(prior === before.sha256, "catalog-changed-since-preview");
  let verified = 0;
  await visitBandFiles([...supplied], async (name) => {
    const path = resolve(folder, "photos", name);
    const size = (await stat(path)).size;
    check(size > 0 && size <= 5 * 1024 * 1024, "album-photo-size");
    const bytes = await readFile(path);
    const [hash, ext] = name.split(".");
    const mime = { jpg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp" }[ext];
    check(sha(bytes) === hash, "album-photo-source-digest");
    await validateUploadContents(bytes, name, mime);
    if (mode !== "--apply") return;
    const file = object("photos/" + name);
    try {
      await file.save(bytes, {
        resumable: false,
        preconditionOpts: { ifGenerationMatch: 0 },
        metadata: { contentType: mime, cacheControl: "private, no-store" },
      });
    } catch (error) {
      if (Number(error.code) !== 412) throw error;
    }
    const [metadata] = await file.getMetadata();
    check(
      metadata.generation && metadata.contentType === mime && Number(metadata.size) === size,
      "stored-album-photo-metadata",
    );
    const [stored] = await file.bucket
      .file(file.name, { generation: metadata.generation })
      .download();
    check(sha(stored) === hash, "stored-album-photo-digest");
    if (++verified % 500 === 0) console.log(JSON.stringify({ verified, total: supplied.size }));
  });
  if (mode !== "--apply") return;
  if (summary.additions || combined.photos.length !== before.value.photos.length) {
    await catalogFile.save(combinedBytes, {
      resumable: false,
      preconditionOpts: { ifGenerationMatch: before.generation },
      metadata: { contentType: "application/json", cacheControl: "private, no-store" },
    });
  }
  const after = await readCatalog(catalogFile);
  check(
    sha(JSON.stringify(after.value)) === sha(JSON.stringify(combined)),
    "published-album-catalog-differs",
  );
  const receipt = {
    ...summary,
    environment: "development",
    database: "heliumdb",
    verifiedFiles: verified,
    sourceSha256: expected,
    catalogSha256: after.sha256,
    generation: after.generation,
    verifiedAt: new Date().toISOString(),
  };
  await writeFile(
    resolve(folder, `album-receipt-${Date.now()}.json`),
    JSON.stringify(receipt) + "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(JSON.stringify(receipt));
}

run().catch((error) => {
  console.error(
    JSON.stringify({ error: error.name, detail: error.importDetail, code: error.code }),
  );
  process.exitCode = 1;
});
