import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("legacy obituary migration is explicit and idempotent", async () => {
  const sql = await readFile(
    new URL("../scripts/migrate-obituaries-to-community-events.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /INSERT INTO community_events/);
  assert.match(sql, /'obituary'/);
  assert.match(sql, /'published'/);
  assert.match(sql, /jsonb_build_object/);
  assert.match(sql, /ON CONFLICT \(legacy_obituary_id\) DO NOTHING/);
  assert.match(sql, /FROM obituaries/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});
