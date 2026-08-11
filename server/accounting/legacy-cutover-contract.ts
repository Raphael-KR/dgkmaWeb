import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import type { LegacyPaymentDecision, LegacyPaymentReason } from "./legacy-payment-contract";

export type LegacyCutoverPhase = "legacy" | "fenced" | "new" | "read_rollback";

export type FrozenLegacyCutoverRow = {
  paymentId: number;
  memberUidOrNull: string | null;
  duesYearOrNull: number | null;
  sourceAmountSignedOrNull: string | null;
  sourceStatus: string;
  sourceContentDigest: string;
  decision: LegacyPaymentDecision;
  reasonCode: LegacyPaymentReason;
};

export type NewLegacyCutoverRow = {
  paymentId: number;
  decision: "cross_link" | "new_compatibility_event";
  currentEventUid: string;
  memberUid: string;
  duesYear: number;
  netApprovedAllocationAmount: string;
  sourceContentDigest: string;
};

export type LegacyCutoverComparison = {
  watermarkPaymentId: number;
  eligibleRows: Array<{
    paymentId: number;
    memberUid: string;
    duesYear: number;
    amount: string;
    sourceContentDigest: string;
  }>;
  excludedPaymentIds: number[];
  groupedTotals: Array<{ memberUid: string; duesYear: number; amount: string }>;
  globalTotal: string;
  comparisonDigest: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const MONEY = /^[1-9][0-9]*$/;
const INELIGIBLE_REASONS = new Set<LegacyPaymentReason>([
  "LEGACY_USER_NULL", "LEGACY_AMOUNT_INVALID", "LEGACY_AMOUNT_NONPOSITIVE", "LEGACY_YEAR_OUT_OF_RANGE",
  "LEGACY_TYPE_NOT_ANNUAL_DUES", "LEGACY_STATUS_NOT_COMPLETED", "LEGACY_CREATED_AT_NULL", "LEGACY_DATA_EXCEPTION_OPEN",
]);

function fail(code: string): never { throw new Error(code); }

export function assertLegacyCutoverTransition(from: LegacyCutoverPhase, to: LegacyCutoverPhase): void {
  const allowed = from === "legacy" && to === "fenced"
    || from === "fenced" && to === "new"
    || from === "new" && to === "read_rollback"
    || from === "read_rollback" && to === "new";
  if (!allowed) fail("legacy_cutover_transition_forbidden");
}

export function buildLegacyCutoverComparison(
  watermarkPaymentId: number,
  frozenRows: FrozenLegacyCutoverRow[],
  newRows: NewLegacyCutoverRow[],
): LegacyCutoverComparison {
  if (!Number.isSafeInteger(watermarkPaymentId) || watermarkPaymentId < 0) fail("legacy_cutover_watermark_invalid");
  const sortedFrozen = [...frozenRows].sort((left, right) => left.paymentId - right.paymentId);
  if (new Set(sortedFrozen.map((row) => row.paymentId)).size !== sortedFrozen.length) fail("legacy_cutover_duplicate_frozen_payment");
  if (sortedFrozen.some((row) => !Number.isSafeInteger(row.paymentId) || row.paymentId <= 0 || row.paymentId > watermarkPaymentId || !SHA256.test(row.sourceContentDigest))) fail("legacy_cutover_frozen_row_invalid");
  const eligibleRows: LegacyCutoverComparison["eligibleRows"] = [];
  const excludedPaymentIds: number[] = [];
  for (const row of sortedFrozen) {
    if (row.decision === "review" || row.decision === "quarantine") fail("legacy_cutover_unresolved_decision");
    if (row.decision === "ineligible") {
      if (!INELIGIBLE_REASONS.has(row.reasonCode)) fail("legacy_cutover_ineligible_reason_invalid");
      excludedPaymentIds.push(row.paymentId);
      continue;
    }
    if (row.decision !== "cross_link" && row.decision !== "new_compatibility_event") fail("legacy_cutover_decision_invalid");
    if (!row.memberUidOrNull || !UUID.test(row.memberUidOrNull) || row.duesYearOrNull === null || !Number.isSafeInteger(row.duesYearOrNull) || row.duesYearOrNull < 2024 || row.duesYearOrNull > 2026 || !row.sourceAmountSignedOrNull || !MONEY.test(row.sourceAmountSignedOrNull) || row.sourceStatus !== "completed") fail("legacy_cutover_eligible_shape_invalid");
    eligibleRows.push({ paymentId: row.paymentId, memberUid: row.memberUidOrNull, duesYear: row.duesYearOrNull, amount: row.sourceAmountSignedOrNull, sourceContentDigest: row.sourceContentDigest });
  }

  const sortedNew = [...newRows].sort((left, right) => left.paymentId - right.paymentId);
  if (new Set(sortedNew.map((row) => row.paymentId)).size !== sortedNew.length) fail("legacy_cutover_duplicate_new_payment");
  if (new Set(sortedNew.map((row) => row.currentEventUid)).size !== sortedNew.length) fail("legacy_cutover_duplicate_event_contribution");
  if (sortedNew.length !== eligibleRows.length) fail("legacy_cutover_coverage_mismatch");
  for (let index = 0; index < eligibleRows.length; index += 1) {
    const oldRow = eligibleRows[index]; const newRow = sortedNew[index];
    if (!newRow || newRow.paymentId !== oldRow.paymentId || !UUID.test(newRow.currentEventUid) || newRow.memberUid !== oldRow.memberUid || newRow.duesYear !== oldRow.duesYear || newRow.netApprovedAllocationAmount !== oldRow.amount || newRow.sourceContentDigest !== oldRow.sourceContentDigest || !["cross_link", "new_compatibility_event"].includes(newRow.decision)) fail("legacy_cutover_projection_mismatch");
    const frozenDecision = sortedFrozen.find((row) => row.paymentId === oldRow.paymentId)?.decision;
    if (newRow.decision !== frozenDecision) fail("legacy_cutover_projection_mismatch");
  }

  const grouped = new Map<string, bigint>();
  for (const row of eligibleRows) {
    const key = `${row.memberUid}\u0000${row.duesYear}`;
    grouped.set(key, (grouped.get(key) ?? 0n) + BigInt(row.amount));
  }
  const groupedTotals = [...grouped].map(([key, amount]) => {
    const [memberUid, duesYear] = key.split("\u0000");
    return { memberUid, duesYear: Number(duesYear), amount: amount.toString() };
  }).sort((left, right) => left.memberUid.localeCompare(right.memberUid) || left.duesYear - right.duesYear);
  const globalTotal = eligibleRows.reduce((sum, row) => sum + BigInt(row.amount), 0n).toString();
  const comparisonDigest = sha256(canonicalJson({
    digest_version: "legacy-cutover-comparison-v1",
    watermark_payment_id: watermarkPaymentId,
    rows: eligibleRows.map((row) => ({ payment_id: row.paymentId, member_uid: row.memberUid, dues_year: row.duesYear, amount: row.amount, source_content_digest: row.sourceContentDigest })),
  } as CanonicalValue));
  return { watermarkPaymentId, eligibleRows, excludedPaymentIds, groupedTotals, globalTotal, comparisonDigest };
}
