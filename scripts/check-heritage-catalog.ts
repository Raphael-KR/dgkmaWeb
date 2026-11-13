import { readFileSync } from "node:fs";
import {
  HERITAGE_CATALOG_MAX_BYTES,
  heritageCatalogSchema,
} from "../server/modules/heritage/catalog-schema";

// File-only check for the selected private catalogue. Never import the store or app.
const file = process.argv[2];
if (!file) throw new Error("Usage: check-heritage-catalog.ts <catalog.json>");
const bytes = readFileSync(file);
if (bytes.length > HERITAGE_CATALOG_MAX_BYTES) throw new Error("Catalog exceeds size limit");
const catalog = heritageCatalogSchema.parse(JSON.parse(bytes.toString("utf8")));
const albumIds = new Set(catalog.albums.map((album) => album.id));
for (const name of ["timeline", "awards"]) {
  const records = JSON.parse(
    readFileSync(new URL(`../shared/heritage/${name}.json`, import.meta.url), "utf8"),
  ) as { albumIds?: string[] }[];
  if (records.some((record) => record.albumIds?.some((id) => !albumIds.has(id)))) {
    throw new Error(`Unresolved album reference in ${name}`);
  }
}
console.log("Heritage catalog static checks passed:", {
  albums: catalog.albums.length,
  photos: catalog.photos.length,
});
