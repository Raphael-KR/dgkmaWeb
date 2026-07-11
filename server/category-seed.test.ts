import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("category seed defines the approved ordered idempotent set", async () => {
  const sql = await readFile(
    new URL("../scripts/seed-categories.sql", import.meta.url),
    "utf8",
  );
  const names = Array.from(
    sql.matchAll(/\('(all|notice|free|event|news)'/g),
  ).map((match) => match[1]);

  assert.deepEqual(names, ["all", "notice", "free", "event", "news"]);
  assert.match(sql, /ON CONFLICT \(name\) DO UPDATE/);
  assert.match(sql, /is_active = true/);
});
