import { isDeepStrictEqual } from "node:util";
import {
  HERITAGE_CATALOG_MAX_BYTES,
  heritageCatalogSchema,
} from "../../server/modules/heritage/catalog-schema.ts";
import { objectStorageClient } from "../../server/integrations/object-storage/objectStorage.ts";
import { heritageAlbumHref } from "../../shared/heritage/navigation.ts";
import { bandContainerId } from "../../server/modules/content/band-media-paths.ts";
import { createHash } from "node:crypto";

export const albumPrefix = `band-${bandContainerId}-post-`;
export const standaloneAlbumPrefix = `band-${bandContainerId}-album-`;
export const photoPrefix = `band-${bandContainerId}-photo-`;
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export function check(ok, message) {
  if (!ok) throw Object.assign(new Error(message), { importDetail: message });
}

export function parseCatalog(bytes) {
  check(bytes.length <= HERITAGE_CATALOG_MAX_BYTES, "album-catalog-too-large");
  return heritageCatalogSchema.parse(JSON.parse(bytes.toString("utf8")));
}

export function developmentHeritage(privateDir) {
  const [bucket, ...parts] = privateDir.replace(/^\//, "").split("/");
  const prefix = [...parts, "heritage", "development"].join("/");
  return (key) => objectStorageClient.bucket(bucket).file(`${prefix}/${key}`);
}

export async function readCatalog(file) {
  let meta;
  try {
    [meta] = await file.getMetadata();
  } catch (error) {
    if (Number(error.code) !== 404) throw error;
    return { value: { schemaVersion: 1, albums: [], photos: [] }, generation: 0, sha256: "empty" };
  }
  check(
    meta.generation && Number(meta.size) <= HERITAGE_CATALOG_MAX_BYTES,
    "invalid-stored-album-catalog",
  );
  const [bytes] = await file.bucket.file(file.name, { generation: meta.generation }).download();
  return { value: parseCatalog(bytes), generation: meta.generation, sha256: sha(bytes) };
}

export function mergeCatalog(before, added) {
  function extendAlbum(before, after) {
    const { photoIds: priorPhotos, ...priorInfo } = before;
    const { photoIds: nextPhotos, ...nextInfo } = after;
    return (
      isDeepStrictEqual(priorInfo, nextInfo) &&
      isDeepStrictEqual(priorPhotos, nextPhotos.slice(0, priorPhotos.length))
    );
  }
  function append(existing, entries, compatible = isDeepStrictEqual) {
    const known = new Map(existing.map((row) => [row.id, row]));
    for (const row of entries) {
      const old = known.get(row.id);
      check(!old || compatible(old, row), `existing-album-or-photo-conflicts:${row.id}`);
      known.set(row.id, row);
    }
    return Array.from(known.values());
  }
  return heritageCatalogSchema.parse({
    schemaVersion: 1,
    albums: append(before.albums, added.albums, extendAlbum),
    photos: append(before.photos, added.photos),
  });
}

export async function verifyLinkedAlbums(posts, privateDir) {
  const linked = posts.filter((p) => p.albumSha256);
  if (!linked.length) return;
  const { value } = await readCatalog(developmentHeritage(privateDir)("catalog.json"));
  const albums = new Map(value.albums.map((a) => [a.id, a]));
  const photos = new Map(value.photos.map((p) => [p.id, p]));
  for (const post of linked) {
    const album = albums.get(albumPrefix + (post.linkedAlbumSourceId ?? post.sourceId));
    check(album && post.imageUrls.length === 0, "linked-post-album-missing-or-inline-photos");
    const href = heritageAlbumHref(album.id);
    const marks = post.content.content.flatMap((p) =>
      (p.content ?? []).flatMap((n) => n.marks ?? []),
    );
    check(
      marks.filter((m) => m.type === "link" && m.attrs.href === href).length === 1,
      "incorrect-album-link-count",
    );
    const entries = album.photoIds.map((id) => {
      const p = photos.get(id);
      return [p.id, p.caption, p.file];
    });
    const proof = [album.id, album.date, album.title, album.coverPhotoId, entries];
    check(sha(JSON.stringify(proof)) === post.albumSha256, "linked-album-contents-differ");
  }
}
