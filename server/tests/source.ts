import { readFile } from "node:fs/promises";

const serverRoot = new URL("../", import.meta.url);

// Source contracts inspect the implementations rather than compatibility facades.
export async function readStorageSource(): Promise<string> {
  const sources = await Promise.all([
    "modules/identity/storage-contract.ts",
    "modules/registry/storage-contract.ts",
    "modules/content/storage-contract.ts",
    "modules/events/storage-contract.ts",
    "modules/dues/storage-contract.ts",
    "modules/identity/registration-support.ts",
    "modules/identity/storage.ts",
    "modules/registry/storage.ts",
    "modules/content/storage.ts",
    "modules/events/storage.ts",
    "modules/dues/storage.ts",
  ].map((path) => readFile(new URL(path, serverRoot), "utf8")));
  return sources.join("\n");
}

export async function readRouteSource(): Promise<string> {
  const sources = await Promise.all([
    "modules/identity/routes.ts",
    "modules/content/routes.ts",
    "modules/events/routes.ts",
    "modules/dues/routes.ts",
    "modules/registry/routes.ts",
  ].map((path) => readFile(new URL(path, serverRoot), "utf8")));
  return sources.join("\n");
}
