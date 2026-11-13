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

  app.get(HERITAGE_ALBUMS_API_PATH, async (_req, res) => {
    try {
      const { albums, photos } = await catalog.read();
      const response: HeritageAlbumCatalog = {
        albums,
        photos: photos.map(({ id, caption, credit }) => ({
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
      const { photos } = await catalog.read();
      const photo = photos.find((item) => item.id === req.params.id);
      if (!photo) return res.status(404).json({ message: "사진을 찾을 수 없습니다." });
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
