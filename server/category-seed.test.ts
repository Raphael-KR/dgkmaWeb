import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { pool } from "./db";

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
});

test("category seed is executable and idempotent in an isolated table", async (t) => {
  const sql = await readFile(
    new URL("../scripts/seed-categories.sql", import.meta.url),
    "utf8",
  );
  const client = await pool.connect();
  t.after(async () => {
    client.release();
    await pool.end();
  });
  await client.query(`
    CREATE TEMP TABLE categories (
      id serial PRIMARY KEY,
      name text NOT NULL UNIQUE,
      display_name text NOT NULL,
      color text,
      badge_variant text,
      is_active boolean,
      sort_order integer,
      created_at timestamp DEFAULT now(),
      updated_at timestamp DEFAULT now()
    )
  `);

  await client.query(sql);
  const first = await client.query(`
    SELECT id, name, display_name, color, badge_variant, is_active, sort_order
    FROM categories
    ORDER BY sort_order
  `);
  await client.query(sql);
  const second = await client.query(`
    SELECT id, name, display_name, color, badge_variant, is_active, sort_order
    FROM categories
    ORDER BY sort_order
  `);

  assert.deepEqual(
    second.rows.map(({ id: _id, ...row }) => Object.values(row)),
    expectedCategories,
  );
  assert.deepEqual(
    second.rows.map((row) => row.id),
    first.rows.map((row) => row.id),
  );
});
