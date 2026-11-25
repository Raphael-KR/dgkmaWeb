import type { Express } from "express";
import { HERITAGE_ALBUMS_API_PATH, heritagePhotoHref } from "@shared/heritage/navigation";
import type { HeritageAlbumCatalog } from "@shared/heritage/types";
import { requireAuthenticated } from "../../middleware/auth";
import { logObjectStorageFailure } from "../../lib/safe-logging";
import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../../integrations/object-storage/objectStorage";
import { HeritageCatalogStore, heritageObjectPrefix } from "./catalog-store";
import type { StoredHeritageCatalog } from "./catalog-schema";
import { bandContainerId } from "../content/band-media-paths";
import { readableBandSourceIds } from "../content/storage";
import { storage } from "../../storage";

const bandAlbumPrefix = `band-${bandContainerId}-post-`;

// A linked album follows the current visibility of its post, including after moderation or deletion.
async function readableAlbums(catalog: StoredHeritageCatalog, userId: string, photoId?: string) {
  const candidates =
    photoId === undefined
      ? catalog.albums
      : catalog.albums.filter((album) => album.photoIds.includes(photoId));
  const ids = candidates
    .filter((album) => album.id.startsWith(bandAlbumPrefix))
    .map((album) => album.id.slice(bandAlbumPrefix.length));
  if (ids.length === 0) return candidates;
  const viewer = await storage.getUser(userId);
  if (!viewer?.isVerified) return [];
  const allowed = await readableBandSourceIds(ids, viewer);
  return candidates.filter(
    (album) =>
      !album.id.startsWith(bandAlbumPrefix) || allowed.has(album.id.slice(bandAlbumPrefix.length)),
  );
}

export function registerHeritageRoutes(app: Express) {
  const objects = new ObjectStorageService();
  const catalog = new HeritageCatalogStore(objects);

  // The global verified-session guard runs before these routes. Do not expose
  // catalogue data or storage paths through public assets or signed URLs.
  app.use(
    "/api/heritage",
    (_req, res, next) => {
      res.set({ "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex, nofollow" });
      next();
    },
    requireAuthenticated,
  );

  app.get(HERITAGE_ALBUMS_API_PATH, async (req, res) => {
    try {
      const contents = await catalog.read();
      const albums = await readableAlbums(contents, req.session.userId!);
      const photos = new Set(albums.flatMap((album) => album.photoIds));
      const response: HeritageAlbumCatalog = {
        albums,
        photos: contents.photos
          .filter((photo) => photos.has(photo.id))
          .map(({ id, caption, credit }) => ({
            id,
            caption,
            credit,
            src: heritagePhotoHref(id),
          })),
      };
      res.json(response);
    } catch (error) {
      logObjectStorageFailure("serve", error, { resource: "heritage-catalog" });
      res.status(500).json({ message: "사진첩을 불러오지 못했습니다." });
    }
  });

  app.get("/api/heritage/photos/:id", async (req, res) => {
    try {
      const contents = await catalog.read();
      const photo = contents.photos.find((item) => item.id === req.params.id);
      if (!photo || !(await readableAlbums(contents, req.session.userId!, photo.id)).length)
        return res.status(404).json({ message: "사진을 찾을 수 없습니다." });
      const file = await objects.getObjectEntityFile(
        `${heritageObjectPrefix()}/photos/${photo.file}`,
      );
      await objects.downloadObject(file, res);
    } catch (error) {
      if (error instanceof ObjectNotFoundError)
        return res.status(404).json({ message: "사진을 찾을 수 없습니다." });
      logObjectStorageFailure("serve", error, { resource: "heritage-photo" });
      res.status(500).json({ message: "사진을 불러오지 못했습니다." });
    }
  });
}
