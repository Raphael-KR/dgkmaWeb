import { canonicalJson, sha256, type CanonicalValue } from "../source-contracts";
import { parseLegacySignedAmount } from "../legacy-payment-contract";

export type LegacyPaymentSourceRowV3 = {
  paymentId: number;
  userId: number | null;
  amountRaw: string;
  year: number;
  type: string;
  status: string;
  createdAt: string | null;
  sourceTimezone: string;
};

function fail(code: string): never { throw new Error(code); }

export function normalizeLegacyPaymentV3(row: LegacyPaymentSourceRowV3) {
  if (!Number.isSafeInteger(row.paymentId) || row.paymentId <= 0) fail("legacy_payment_v3_payment_id_invalid");
  if (row.userId !== null && (!Number.isSafeInteger(row.userId) || row.userId <= 0)) fail("legacy_payment_v3_user_id_invalid");
  if (!Number.isSafeInteger(row.year)) fail("legacy_payment_v3_year_invalid");
  if (row.sourceTimezone !== "Asia/Seoul") fail("legacy_payment_v3_timezone_invalid");
  const parsed = parseLegacySignedAmount(row.amountRaw);
  const normalizedPayload = {
    amount_parse: {
      status: parsed.status,
      raw_digest: parsed.rawDigest,
      source_amount_signed_or_null: parsed.sourceAmountSignedOrNull,
    },
    created_at: row.createdAt,
    payment_id: row.paymentId,
    source_amount_signed: parsed.sourceAmountSignedOrNull,
    source_timezone: row.sourceTimezone,
    status: row.status.normalize("NFC").trim(),
    type: row.type.normalize("NFC").trim(),
    user_id: row.userId,
    year: row.year,
  };
  const envelope = {
    schema_version: "legacy-payment-normalized-row-v3",
    source_code: "LEGACY_PAYMENTS",
    output_family: "legacy-payment-row-v1",
    record_kind: "legacy_payment",
    coordinate_key: `payments:${row.paymentId}`,
    normalized_payload: normalizedPayload,
  };
  return { envelope, contentDigest: sha256(canonicalJson(envelope as CanonicalValue)) };
}
