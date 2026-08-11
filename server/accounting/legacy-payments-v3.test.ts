import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { normalizeLegacyPaymentV3, type LegacyPaymentSourceRowV3 } from "./adapters/legacy-payments-v3";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

function source(overrides: Partial<LegacyPaymentSourceRowV3> = {}): LegacyPaymentSourceRowV3 {
  return { paymentId: 7, userId: 315, amountRaw: "50000", year: 2026, type: "연회비", status: "completed", createdAt: "2026-03-16T12:00:00", sourceTimezone: "Asia/Seoul", ...overrides };
}

test("v3 keeps signed value separate from its strict parse envelope", () => {
  const result = normalizeLegacyPaymentV3(source());
  assert.equal(result.envelope.coordinate_key, "payments:7");
  assert.equal(result.envelope.normalized_payload.source_amount_signed, "50000");
  assert.deepEqual(result.envelope.normalized_payload.amount_parse, {
    status: "valid_signed",
    raw_digest: sha256("50000"),
    source_amount_signed_or_null: "50000",
  });
  assert.equal(result.contentDigest, sha256(canonicalJson(result.envelope as unknown as CanonicalValue)));
});

test("v3 preserves zero and negative signed evidence without making it unsigned", () => {
  assert.equal(normalizeLegacyPaymentV3(source({ amountRaw: "0" })).envelope.normalized_payload.source_amount_signed, "0");
  assert.equal(normalizeLegacyPaymentV3(source({ amountRaw: "-50000" })).envelope.normalized_payload.source_amount_signed, "-50000");
});

test("v3 carries only a digest for invalid signed evidence", () => {
  const result = normalizeLegacyPaymentV3(source({ amountRaw: "+50000" }));
  assert.equal(result.envelope.normalized_payload.source_amount_signed, null);
  assert.deepEqual(result.envelope.normalized_payload.amount_parse, {
    status: "invalid",
    raw_digest: sha256("+50000"),
    source_amount_signed_or_null: null,
  });
  assert.doesNotMatch(canonicalJson(result.envelope as unknown as CanonicalValue), /receipt_url|receiptUrl/);
});

test("v3 rejects a non-KST batch instead of inferring timezone", () => {
  assert.throws(() => normalizeLegacyPaymentV3(source({ sourceTimezone: "UTC" })), /legacy_payment_v3_timezone_invalid/);
});

test("v3 schema closes the signed envelope and excludes receipt URLs", () => {
  const schema = JSON.parse(readFileSync("docs/source-contracts/schemas/legacy-payment-normalized-row-v3.schema.json", "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.equal(schema.properties.normalized_payload.additionalProperties, false);
  assert.equal(schema.properties.normalized_payload.properties.amount_parse.additionalProperties, false);
  assert.doesNotMatch(JSON.stringify(schema), /receipt_url|receiptUrl/);
});
