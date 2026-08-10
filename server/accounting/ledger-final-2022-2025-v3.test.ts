import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { ledgerPeriodRowV3, normalizeLedgerFinalRowV3, parseLedgerDateV3 } from "./adapters/ledger-final-2022-2025-v3";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, CanonicalValue>;

test("ledger v3 binds profile, mapping, delegated receipt, descriptor and plan", () => {
  const profilePath = "docs/source-contracts/profiles/ledger-final-2022-2025-v3.json"; const profile = read(profilePath); const profilePreimage = { ...profile }; delete profilePreimage.profile_sha256;
  const mappingBytes = readFileSync("docs/source-contracts/mappings/ledger-final-2022-2025-v3.json"); const approval = read("docs/source-contracts/approvals/ledger-final-2022-2025-v3.json"); const approvalPreimage = { ...approval }; delete approvalPreimage.receipt_sha256;
  const descriptorBytes = readFileSync("docs/source-contracts/releases/ledger-final-2022-2025-v3.json"); const descriptor = JSON.parse(descriptorBytes.toString("utf8")) as Record<string, CanonicalValue>;
  const plan = read("docs/source-contracts/releases/ledger-final-development-release-plan-v3.json"); const planPreimage = { ...plan }; delete planPreimage.plan_sha256;
  assert.equal(profile.profile_sha256, sha256(canonicalJson(profilePreimage))); assert.equal(approval.mapping_sha256, sha256(mappingBytes)); assert.equal(approval.receipt_sha256, sha256(canonicalJson(approvalPreimage)));
  assert.equal(descriptor.source_profile_file_sha256, sha256(readFileSync(profilePath))); assert.equal(descriptor.normalized_schema_sha256, sha256(readFileSync("docs/source-contracts/schemas/deferred-source-normalized-row-v2.schema.json")));
  assert.equal(plan.release_uid, "6ec542d2-61e4-41ed-8813-946297185a99"); assert.equal(plan.descriptor_sha256, sha256(descriptorBytes)); assert.equal(plan.plan_sha256, sha256(canonicalJson(planPreimage)));
});

test("ledger v3 normalizes serial and dotted KST dates", () => {
  assert.deepEqual(parseLedgerDateV3(45292.5), { occurred_at: "2024-01-01T12:00:00+09:00", occurred_date: "2024-01-01", year: 2024 });
  assert.deepEqual(parseLedgerDateV3("2023. 2. 28. 오후 3:04"), { occurred_at: "2023-02-28T15:04:00+09:00", occurred_date: "2023-02-28", year: 2023 });
});

test("ledger v3 retains readable snapshots and secretless digests", () => {
  const payload = normalizeLedgerFinalRowV3({ coordinateKey: "sheet:x:row:4", values: { 거래일시: 45292, 거래금액: -50000, 구분: "", 내용: "입금자", 거래구분: "분개", 메모: "메모" } });
  assert.equal(payload.direction, "debit");
  assert.equal(payload.amount, "50000");
  assert.equal(payload.description_snapshot, "입금자 · 분개 · 메모");
  assert.equal(payload.payer_name_snapshot, "입금자 · 메모");
  assert.match(String(payload.description_digest), /^[0-9a-f]{64}$/);
  assert.equal(payload.period_code, "CALENDAR_2024");
});

test("ledger v3 creates deterministic adjacent calendar boundaries", () => {
  const row = ledgerPeriodRowV3(2025);
  assert.equal(row.starts_at, "2025-01-01T00:00:00+09:00");
  assert.equal(row.ends_at, "2026-01-01T00:00:00+09:00");
  assert.match(row.boundary_content_digest, /^[0-9a-f]{64}$/);
});

test("ledger v3 fails closed on zero money, invalid dates, and missing descriptions", () => {
  assert.throws(() => normalizeLedgerFinalRowV3({ coordinateKey: "x", values: { 거래일시: 45292, 거래금액: 0, 내용: "x" } }), /ledger_v3_money_invalid/);
  assert.throws(() => parseLedgerDateV3("not-a-date"), /ledger_v3_datetime_invalid/);
  assert.throws(() => normalizeLedgerFinalRowV3({ coordinateKey: "x", values: { 거래일시: 45292, 거래금액: 1 } }), /ledger_v3_description_missing/);
});
