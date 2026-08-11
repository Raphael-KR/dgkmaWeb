import assert from "node:assert/strict";
import test from "node:test";
import { parseLegacySignedAmount, type FrozenLegacyPayment, type LegacyDecisionEvidence } from "./legacy-payment-contract";
import { assertLegacyMaterializationReady, buildLegacyMaterializationRows, legacyMaterializationCounts } from "./legacy-payment-materialization";

const MEMBER = "11111111-1111-4111-8111-111111111111";
const EXISTING_EVENT = "22222222-2222-4222-8222-222222222222";
const CREATED_EVENT = "33333333-3333-4333-8333-333333333333";

function row(paymentId: number, amountRaw: string): FrozenLegacyPayment {
  return { paymentId, sourceContentDigest: paymentId.toString(16).padStart(64, "0"), userId: 10, amountParse: parseLegacySignedAmount(amountRaw), year: 2026, type: "연회비", status: "completed", createdAt: "2026-03-01T00:00:00+09:00", hasOpenDataException: false };
}
function evidence(candidateEventUids: string[] = []): LegacyDecisionEvidence {
  return { timezoneSnapshot: "Asia/Seoul", memberUid: MEMBER, candidateEventUids, uniqueCandidateHasExactApprovedDuesTopology: candidateEventUids.length === 1 };
}

test("eligible cross-link and new compatibility rows have the exact dependency order", () => {
  const rows = buildLegacyMaterializationRows([
    { row: row(2, "50000"), evidence: evidence([]), createdEventUid: CREATED_EVENT },
    { row: row(1, "50000"), evidence: evidence([EXISTING_EVENT]) },
  ]);
  assert.doesNotThrow(() => assertLegacyMaterializationReady(rows));
  assert.deepEqual(rows.map((item) => item.projection.decision), ["cross_link", "new_compatibility_event"]);
  assert.deepEqual(rows[0].steps.map((step) => step.kind), ["claim:open", "claim:bind", "provenance:create", "decision:terminal"]);
  assert.deepEqual(rows[1].steps.map((step) => step.kind), ["claim:open", "event:create", "claim:bind", "provenance:create", "authority:select", "decision:terminal", "cashbook:create", "receipt:create", "allocation:create", "cashbook:approve", "receipt:approve", "allocation:approve", "event:approve"]);
});

test("zero, negative and invalid signed evidence create only terminal ineligible decisions", () => {
  const rows = buildLegacyMaterializationRows([
    { row: row(1, "0"), evidence: evidence() },
    { row: row(2, "-50000"), evidence: evidence() },
    { row: row(3, "not-money"), evidence: evidence() },
  ]);
  assert.doesNotThrow(() => assertLegacyMaterializationReady(rows));
  assert.deepEqual(rows.map((item) => item.projection.reasonCode), ["LEGACY_AMOUNT_NONPOSITIVE", "LEGACY_AMOUNT_NONPOSITIVE", "LEGACY_AMOUNT_INVALID"]);
  const counts = legacyMaterializationCounts(rows);
  assert.equal(counts["decision:terminal"], 3);
  for (const [kind, count] of Object.entries(counts)) if (kind !== "decision:terminal") assert.equal(count, 0, kind);
});

test("ambiguous candidates block cutover and topology reordering is rejected", () => {
  const rows = buildLegacyMaterializationRows([{ row: row(1, "50000"), evidence: evidence([EXISTING_EVENT, CREATED_EVENT]) }]);
  assert.throws(() => assertLegacyMaterializationReady(rows), /legacy_materialization_unresolved_decision/);
  const valid = buildLegacyMaterializationRows([{ row: row(2, "50000"), evidence: evidence(), createdEventUid: CREATED_EVENT }]);
  [valid[0].steps[0], valid[0].steps[1]] = [valid[0].steps[1], valid[0].steps[0]];
  assert.throws(() => assertLegacyMaterializationReady(valid), /legacy_materialization_topology_invalid/);
});
