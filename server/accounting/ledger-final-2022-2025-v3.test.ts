import assert from "node:assert/strict";
import test from "node:test";
import { ledgerPeriodRowV3, normalizeLedgerFinalRowV3, parseLedgerDateV3 } from "./adapters/ledger-final-2022-2025-v3";

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
