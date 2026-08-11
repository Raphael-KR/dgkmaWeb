import assert from "node:assert/strict";
import test from "node:test";
import { assertLegacyCutoverTransition, buildLegacyCutoverComparison, type FrozenLegacyCutoverRow, type NewLegacyCutoverRow } from "./legacy-cutover-contract";

const memberA = "11111111-1111-4111-8111-111111111111";
const memberB = "22222222-2222-4222-8222-222222222222";
const eventA = "33333333-3333-4333-8333-333333333333";
const eventB = "44444444-4444-4444-8444-444444444444";

const frozen: FrozenLegacyCutoverRow[] = [
  { paymentId: 1, memberUidOrNull: memberA, duesYearOrNull: 2025, sourceAmountSignedOrNull: "50000", sourceStatus: "completed", sourceContentDigest: "1".repeat(64), decision: "cross_link", reasonCode: "LEGACY_CROSS_LINK_MATCHED" },
  { paymentId: 3, memberUidOrNull: memberB, duesYearOrNull: 2026, sourceAmountSignedOrNull: "30000", sourceStatus: "completed", sourceContentDigest: "2".repeat(64), decision: "new_compatibility_event", reasonCode: "LEGACY_COMPATIBILITY_EVENT_CREATED" },
  { paymentId: 5, memberUidOrNull: null, duesYearOrNull: null, sourceAmountSignedOrNull: "0", sourceStatus: "completed", sourceContentDigest: "3".repeat(64), decision: "ineligible", reasonCode: "LEGACY_AMOUNT_NONPOSITIVE" },
];

const materialized: NewLegacyCutoverRow[] = [
  { paymentId: 1, decision: "cross_link", currentEventUid: eventA, memberUid: memberA, duesYear: 2025, netApprovedAllocationAmount: "50000", sourceContentDigest: "1".repeat(64) },
  { paymentId: 3, decision: "new_compatibility_event", currentEventUid: eventB, memberUid: memberB, duesYear: 2026, netApprovedAllocationAmount: "30000", sourceContentDigest: "2".repeat(64) },
];

test("cutover phases allow only fence, cutover, read rollback and re-cutover", () => {
  for (const pair of [["legacy", "fenced"], ["fenced", "new"], ["new", "read_rollback"], ["read_rollback", "new"]] as const) assert.doesNotThrow(() => assertLegacyCutoverTransition(...pair));
  for (const pair of [["legacy", "new"], ["fenced", "read_rollback"], ["read_rollback", "legacy"], ["new", "fenced"]] as const) assert.throws(() => assertLegacyCutoverTransition(...pair), /legacy_cutover_transition_forbidden/);
});

test("comparison partitions excluded rows and binds exact eligible totals", () => {
  const result = buildLegacyCutoverComparison(5, frozen, materialized);
  assert.deepEqual(result.excludedPaymentIds, [5]);
  assert.equal(result.eligibleRows.length, 2);
  assert.equal(result.globalTotal, "80000");
  assert.deepEqual(result.groupedTotals, [
    { memberUid: memberA, duesYear: 2025, amount: "50000" },
    { memberUid: memberB, duesYear: 2026, amount: "30000" },
  ]);
  assert.match(result.comparisonDigest, /^[0-9a-f]{64}$/);
  assert.equal(result.comparisonDigest, buildLegacyCutoverComparison(5, [...frozen].reverse(), [...materialized].reverse()).comparisonDigest);
});

test("unresolved or wrongly excluded decisions block cutover", () => {
  assert.throws(() => buildLegacyCutoverComparison(5, frozen.map((row) => row.paymentId === 1 ? { ...row, decision: "review", reasonCode: "LEGACY_EVIDENCE_AMBIGUOUS" } : row), materialized), /legacy_cutover_unresolved_decision/);
  assert.throws(() => buildLegacyCutoverComparison(5, frozen.map((row) => row.paymentId === 5 ? { ...row, reasonCode: "LEGACY_EVIDENCE_AMBIGUOUS" } : row), materialized), /legacy_cutover_ineligible_reason_invalid/);
});

test("missing, duplicate or mismatched new contributions block cutover", () => {
  assert.throws(() => buildLegacyCutoverComparison(5, frozen, materialized.slice(0, 1)), /legacy_cutover_coverage_mismatch/);
  assert.throws(() => buildLegacyCutoverComparison(5, frozen, [materialized[0], materialized[0]]), /legacy_cutover_duplicate_new_payment/);
  assert.throws(() => buildLegacyCutoverComparison(5, frozen, materialized.map((row) => row.paymentId === 1 ? { ...row, netApprovedAllocationAmount: "50001" } : row)), /legacy_cutover_projection_mismatch/);
  assert.throws(() => buildLegacyCutoverComparison(5, frozen, materialized.map((row) => row.paymentId === 1 ? { ...row, currentEventUid: eventB } : row)), /legacy_cutover_duplicate_event_contribution/);
});

test("equal legitimate payments remain distinct by payment identity", () => {
  const extraFrozen: FrozenLegacyCutoverRow = { ...frozen[0], paymentId: 2, sourceContentDigest: "4".repeat(64) };
  const extraNew: NewLegacyCutoverRow = { ...materialized[0], paymentId: 2, currentEventUid: "55555555-5555-4555-8555-555555555555", sourceContentDigest: "4".repeat(64) };
  const result = buildLegacyCutoverComparison(5, [...frozen, extraFrozen], [...materialized, extraNew]);
  assert.equal(result.eligibleRows.length, 3);
  assert.equal(result.globalTotal, "130000");
});
