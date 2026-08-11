import assert from "node:assert/strict";
import test from "node:test";
import { AtomicActivationFixture, planAnnualPolicyActivation, planReceiptRefund } from "./refund-activation-contract";

const baseRefund = {
  observedAt: "2026-08-31T23:59:59+09:00", originalEffectiveAt: "2026-03-02T09:00:00+09:00",
  correctionReasonCode: null, correctionEvidenceSha256: null, originalReceiptBound: true,
  originalAllocationBound: true, boundClaim: true, bankTransactionBound: true, reversesOriginalEvent: true,
} as const;

test("ordinary and both coded refunds bind exact effective-time and stored correction columns", () => {
  const ordinary = planReceiptRefund(baseRefund);
  assert.equal(ordinary.effectiveAt, "2026-09-01T00:00:00+09:00");
  assert.equal(ordinary.rightsEffectMode, "next_month_negative");
  assert.equal(ordinary.correctionReasonCode, null);
  for (const reason of ["source_error", "false_transaction"] as const) {
    const correction = planReceiptRefund({ ...baseRefund, correctionReasonCode: reason, correctionEvidenceSha256: "a".repeat(64) });
    assert.equal(correction.effectiveAt, baseRefund.originalEffectiveAt);
    assert.equal(correction.rightsEffectMode, "retroactive_error");
    assert.equal(correction.correctionReasonCode, reason);
  }
  assert.deepEqual(ordinary.steps, [
    "event_claim:open", "economic_event:create", "event_claim:bind", "event_provenance:create",
    "authority_decision:select", "bank_transaction:create", "receipt_reversal:propose",
    "original_allocation:lock", "new_allocation:refund", "receipt_reversal:approve", "audit:append",
  ]);
});

test("mixed correction fields, retroactive ordinary refund and unbound bank evidence fail closed", () => {
  assert.throws(() => planReceiptRefund({ ...baseRefund, correctionEvidenceSha256: "a".repeat(64) }), /negative_effect_correction_binding_invalid/);
  assert.throws(() => planReceiptRefund({ ...baseRefund, correctionReasonCode: "source_error", correctionEvidenceSha256: null }), /negative_effect_correction_binding_invalid/);
  assert.throws(() => planReceiptRefund({ ...baseRefund, correctionReasonCode: "source_error", correctionEvidenceSha256: "a".repeat(64), originalEffectiveAt: "2026-03-02T00:00:00Z" }), /negative_effect_correction_binding_invalid/);
  assert.throws(() => planReceiptRefund({ ...baseRefund, bankTransactionBound: false }), /refund_bank_evidence_missing/);
});

const policies = ["president", "senior_vice_president", "vice_president_auditor_chair", "director", "member", "honorary"].map((tierCode, index) => ({ tierCode, successorUid: `policy-${index + 1}` }));
const mappings = [{ mappingUid: "mapping-1", tierCode: "member", policySuccessorUid: "policy-5" }, { mappingUid: "mapping-2", tierCode: "director", policySuccessorUid: "policy-4" }];

test("annual activation orders all six policy successors before every mapping successor", () => {
  const plan = planAnnualPolicyActivation({ policySuccessors: policies, mappingSuccessors: mappings });
  assert.deepEqual(plan.steps.map((step) => step.kind), ["policy_successor", "policy_successor", "policy_successor", "policy_successor", "policy_successor", "policy_successor", "mapping_successor", "mapping_successor"]);
  const fixture = new AtomicActivationFixture(); fixture.apply(plan, null);
  assert.equal(fixture.committed.length, 8);
});

test("mapping-before-policy binding and separately committed partial activation leave zero residue", () => {
  assert.throws(() => planAnnualPolicyActivation({ policySuccessors: policies, mappingSuccessors: [{ ...mappings[0], policySuccessorUid: "old-policy" }] }), /mapping_policy_binding_invalid/);
  const plan = planAnnualPolicyActivation({ policySuccessors: policies, mappingSuccessors: mappings });
  const fixture = new AtomicActivationFixture();
  assert.throws(() => fixture.apply(plan, 7), /synthetic_failure/);
  assert.deepEqual(fixture.committed, []);
});
