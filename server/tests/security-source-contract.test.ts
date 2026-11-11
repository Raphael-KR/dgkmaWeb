import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Drizzle excludes the runtime-owned session table", async () => {
  const config = await readFile(new URL("../../drizzle.config.ts", import.meta.url), "utf8");
  assert.match(config, /tablesFilter:\s*\["!session"\]/);
});

test("account deletion anonymizes payment ownership without deleting payment records", async () => {
  // The DB deletion fixture has no payment rows; retain this narrow source check.
  const source = await readFile(
    new URL("../modules/identity/registration-support.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /\.update\(payments\)\s*\.set\(\{\s*userId:\s*null\s*\}\)/);
  assert.doesNotMatch(source, /\.delete\(payments\)/);
});
