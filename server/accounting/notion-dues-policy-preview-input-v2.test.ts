import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Notion policy materializer accepts only a profile-bound mode-0600 observation", async () => {
  const source = await readFile(new URL("../../scripts/materialize-notion-dues-policy-preview-input-v2.ts", import.meta.url), "utf8");
  assert.match(source, /notion-last-edited:/);
  assert.match(source, /observation\.page_id !== PAGE_ID/);
  assert.match(source, /statSync\(observationPath\)\.mode & 0o077/);
  assert.match(source, /policies\.length !== 6/);
  assert.match(source, /decisions: \[\]/);
  assert.match(source, /source_fingerprint = sourceFingerprint/);
  assert.doesNotMatch(source, /notion_(create|update|delete)|fetch\(|https:/);
});
