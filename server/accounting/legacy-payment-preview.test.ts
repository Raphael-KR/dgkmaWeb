import assert from "node:assert/strict";
import test from "node:test";
import { buildLegacyPaymentPreviewIdentity, buildLegacyPaymentPreviewRows } from "./legacy-payment-preview";

const rows = [{ id: 7, user_id: 11, amount_raw: "50000", year: 2026, type: "연회비", status: "completed", created_at_local: "2026-03-01T12:00:00.000000+09:00", has_open_data_exception: false }];

test("legacy preview freezes signed evidence and emits a decision-only row", () => {
  const preview = buildLegacyPaymentPreviewRows(rows);
  assert.equal(preview[0].sourceRow.coordinate_key, "payments:7");
  assert.deepEqual(preview[0].sourceRow.decisions, []);
  assert.equal(preview[0].frozenRow.amountParse.sourceAmountSignedOrNull, "50000");
  assert.equal(preview[0].frozenRow.sourceContentDigest.length, 64);
});

test("legacy preview identity changes with source bytes and remains deterministic", () => {
  const base = { sourceUid: "d2106328-682b-5276-81d9-d06fcbc70592", releaseUid: "a95d2cfa-ce6d-487b-9335-4252f93d2fb9", sourceRevision: "fixture:1", coverageFrom: "2026-03-01T00:00:00+09:00", coverageThrough: "2026-03-02T00:00:00+09:00" };
  const first = buildLegacyPaymentPreviewIdentity({ ...base, rows: buildLegacyPaymentPreviewRows(rows) });
  const second = buildLegacyPaymentPreviewIdentity({ ...base, rows: buildLegacyPaymentPreviewRows(rows) });
  assert.deepEqual(first, second);
  const changed = buildLegacyPaymentPreviewIdentity({ ...base, rows: buildLegacyPaymentPreviewRows([{ ...rows[0], amount_raw: "50001" }]) });
  assert.notEqual(changed.sourceFingerprint, first.sourceFingerprint);
  assert.notEqual(changed.previewManifestSha256, first.previewManifestSha256);
});
