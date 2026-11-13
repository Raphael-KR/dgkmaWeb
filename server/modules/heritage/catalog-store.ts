import {
  ObjectNotFoundError,
  ObjectStorageService,
} from "../../integrations/object-storage/objectStorage";
import {
  HERITAGE_CATALOG_MAX_BYTES,
  heritageCatalogSchema,
  type StoredHeritageCatalog,
} from "./catalog-schema";
import { logObjectStorageFailure } from "../../lib/safe-logging";

export function heritageObjectPrefix() {
  const environment = process.env.REPLIT_DEPLOYMENT === "1" ? "production" : "development";
  return `/objects/heritage/${environment}`;
}

export class HeritageCatalogStore {
  private cached?: { expiresAt: number; value: StoredHeritageCatalog };
  private loading?: Promise<StoredHeritageCatalog>;

  constructor(private readonly objects: ObjectStorageService) {}

  async read(): Promise<StoredHeritageCatalog> {
    if (this.cached && this.cached.expiresAt > Date.now()) return this.cached.value;
    if (this.loading) return this.loading;
    this.loading = this.load();
    try {
      const value = await this.loading;
      this.cached = { expiresAt: Date.now() + 60_000, value };
      return value;
    } finally {
      this.loading = undefined;
    }
  }

  private async load(): Promise<StoredHeritageCatalog> {
    let file;
    try {
      file = await this.objects.getObjectEntityFile(`${heritageObjectPrefix()}/catalog.json`);
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return { schemaVersion: 1, albums: [], photos: [] };
      throw error;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of file.createReadStream()) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > HERITAGE_CATALOG_MAX_BYTES) {
        const error = new Error("Heritage catalog exceeds size limit");
        logObjectStorageFailure("download", error, {
          resource: "heritage-catalog",
          observedBytes: size,
          maximumBytes: HERITAGE_CATALOG_MAX_BYTES,
        });
        throw error;
      }
      chunks.push(buffer);
    }
    let value: unknown;
    try {
      value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch (error) {
      logObjectStorageFailure("download", error, {
        resource: "heritage-catalog",
        observedBytes: size,
        validJson: false,
      });
      throw error;
    }
    const result = heritageCatalogSchema.safeParse(value);
    if (!result.success) {
      logObjectStorageFailure("download", result.error, {
        resource: "heritage-catalog",
        observedBytes: size,
        schemaVersionExpected: 1,
        issueCount: result.error.issues.length,
        issueCodes: result.error.issues.map((issue) => issue.code).join(","),
      });
      throw result.error;
    }
    return result.data;
  }
}
