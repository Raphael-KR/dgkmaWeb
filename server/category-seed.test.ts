import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedCategories = [
  ["all", "전체", "#6b7280", "secondary", true, 0],
  ["notice", "공지", "#ef4444", "destructive", true, 1],
  ["free", "자유", "#3b82f6", "default", true, 2],
  ["event", "행사", "#22c55e", "secondary", true, 3],
  ["news", "소식", "#f59e0b", "outline", true, 4],
];

test("category seed defines the approved ordered idempotent set", async () => {
  const sql = await readFile(
    new URL("../scripts/seed-categories.sql", import.meta.url),
    "utf8",
  );
  const valuesSection = sql.match(/VALUES([\s\S]+?)ON CONFLICT/)?.[1] ?? "";
  const rows = Array.from(valuesSection.matchAll(
    /\('([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(true|false),\s*(\d+)\)/g,
  )).map((match) => [
    match[1],
    match[2],
    match[3],
    match[4],
    match[5] === "true",
    Number(match[6]),
  ]);

  assert.deepEqual(rows, expectedCategories);
  assert.equal((valuesSection.match(/\(/g) ?? []).length, expectedCategories.length);
  assert.match(sql, /ON CONFLICT \(name\) DO UPDATE/);
  assert.match(sql, /display_name = EXCLUDED\.display_name/);
  assert.match(sql, /color = EXCLUDED\.color/);
  assert.match(sql, /badge_variant = EXCLUDED\.badge_variant/);
  assert.match(sql, /is_active = true/);
  assert.match(sql, /sort_order = EXCLUDED\.sort_order/);
  assert.equal(sql.split(";").filter((statement) => statement.trim()).length, 1);
});
