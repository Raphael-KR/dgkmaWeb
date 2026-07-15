import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminPath = new URL("../client/src/pages/admin.tsx", import.meta.url);

test("admin alumni sync uses a PII-free preview before fingerprint apply", async () => {
  const source = await readFile(adminPath, "utf8");

  assert.match(source, /fetch\("\/api\/admin\/sync-alumni\/preview"/);
  assert.match(source, /fetch\("\/api\/admin\/sync-alumni"/);
  assert.match(source, /JSON\.stringify\(\{ fingerprint:/);
  assert.match(source, /변경 미리보기/);
  assert.match(source, /변경 적용/);
  assert.match(source, /useReducer/);
  assert.match(source, /alumniSyncReducer/);
  assert.match(source, /getAlumniSyncControls/);
  for (const field of [
    "sourceTotal",
    "databaseTotal",
    "insert",
    "update",
    "unchanged",
    "conflict",
    "invalid",
    "sourceOnly",
    "databaseOnly",
  ]) {
    assert.match(source, new RegExp(`report\\.${field}`));
  }
  for (const action of [
    "preview-started",
    "preview-succeeded",
    "preview-failed",
    "apply-started",
    "apply-succeeded",
    "apply-failed",
  ]) {
    assert.match(source, new RegExp(action));
  }
});

test("admin alumni sync keeps no raw alumni or synthetic progress state", async () => {
  const source = await readFile(adminPath, "utf8");

  assert.doesNotMatch(source, /\/api\/admin\/sync-progress/);
  assert.doesNotMatch(source, /syncProgress|isPolling|setInterval|<Progress/);
  assert.doesNotMatch(source, /data\.stats\?\.synced|새로운 동문 데이터가 추가되었습니다/);
  assert.doesNotMatch(source, /console\.(?:log|error)\([^\n]*data/);
});

test("admin statistics show no fabricated member or payment totals", async () => {
  const source = await readFile(adminPath, "utf8");

  assert.doesNotMatch(source, /1,247|856|42,800,000/);
  assert.match(source, /통계 집계 준비 중/);
});
