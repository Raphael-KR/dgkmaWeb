import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const homePath = new URL("../client/src/pages/home.tsx", import.meta.url);

test("community home administrator badge links only administrators to the admin panel", async () => {
  const source = await readFile(homePath, "utf8");
  const adminOnlyBlock = source.match(/\{user\.isAdmin && \([\s\S]*?\n\s*\)\}/)?.[0] ?? "";

  assert.match(adminOnlyBlock, /<Link/);
  assert.match(adminOnlyBlock, /href="\/admin"/);
  assert.match(adminOnlyBlock, /aria-label="관리자 화면으로 이동"/);
  assert.match(adminOnlyBlock, />\s*관리자\s*</);
});
