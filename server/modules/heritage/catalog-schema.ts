import { z } from "zod";

const id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(160);
const text = z.string().trim().min(1);
const date = z
  .string()
  .regex(/^\d{4}(?:-\d{2}){0,2}$/)
  .refine((value) => {
    const [year, month = 1, day = 1] = value.split("-").map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
      parsed.getUTCFullYear() === year &&
      parsed.getUTCMonth() + 1 === month &&
      parsed.getUTCDate() === day
    );
  }, "Invalid calendar date");

export const HERITAGE_CATALOG_MAX_BYTES = 2 * 1024 * 1024;

export const heritageCatalogSchema = z
  .object({
    schemaVersion: z.literal(1),
    albums: z.array(
      z
        .object({
          id,
          date,
          title: text.max(500),
          description: text.max(20_000).optional(),
          coverPhotoId: id,
          photoIds: z.array(id).min(1),
        })
        .strict(),
    ),
    photos: z.array(
      z
        .object({
          id,
          caption: text.max(1000),
          credit: text.max(500).optional(),
          file: z.string().regex(/^[a-f0-9]{64}\.(?:jpg|png|webp|gif)$/),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((catalog, context) => {
    const albumIds = new Set(catalog.albums.map((album) => album.id));
    const photoIds = new Set(catalog.photos.map((photo) => photo.id));
    const referencedPhotos = new Set(catalog.albums.flatMap((album) => album.photoIds));
    if (
      albumIds.size !== catalog.albums.length ||
      photoIds.size !== catalog.photos.length ||
      catalog.albums.some(
        (album) =>
          new Set(album.photoIds).size !== album.photoIds.length ||
          !album.photoIds.includes(album.coverPhotoId) ||
          album.photoIds.some((photoId) => !photoIds.has(photoId)),
      ) ||
      catalog.photos.some((photo) => !referencedPhotos.has(photo.id))
    ) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Invalid album/photo references" });
    }
  });

export type StoredHeritageCatalog = z.infer<typeof heritageCatalogSchema>;
