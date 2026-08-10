import assert from "node:assert/strict";
import test from "node:test";
import { buildGroupMaterializationTopology, validateGroupMaterializationTopology } from "./source-decision-group-materialization";
import type { GroupMultiBatchApplyPlan } from "./source-decision-group-plan";

const plan: GroupMultiBatchApplyPlan = {
  orderedBatchUids: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
  orderedDecisionSetUids: ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"],
  resolvedBindings: { bankAccountId: "1", bankAccountCode: "TOSS_OFFICER_2026", eventPartyIdsByUid: { "55555555-5555-4555-8555-555555555555": null }, memberIdsByUid: { "66666666-6666-4666-8666-666666666666": "9" } },
  groups: [{
    primaryCoordinateKey: "bank:toss:1", eventPartyUid: "55555555-5555-4555-8555-555555555555", receiptUid: "77777777-7777-4777-8777-777777777777", rosterBatchUid: "22222222-2222-4222-8222-222222222222", duesAmount: "50000", approvedAllocationAmount: "50000", categorySplits: [{ categoryCode: "DUES_INCOME", amount: "50000" }],
    primaryEvidence: { decisionItemId: "10", coordinateId: "11", sourceRowVersionId: "12", normalizedPayload: { amount: "50000" } },
    allocations: [{ coordinateKey: "roster:1", allocationRequestUid: "88888888-8888-4888-8888-888888888888", groupMemberUid: "99999999-9999-4999-8999-999999999999", memberUid: "66666666-6666-4666-8666-666666666666", caseUid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", amount: "50000", duesYear: 2025, allocationKind: "dues", evidence: { allocationDecisionItemId: "20", memberMatchDecisionItemId: "21", coordinateId: "22", sourceRowVersionId: "23", normalizedPayload: { proposed_amount: "50000" } } }],
  }],
};

test("builds the exact dependency-ordered group materialization topology", () => {
  const steps = buildGroupMaterializationTopology(plan); const repeated = buildGroupMaterializationTopology(plan); const index = (key: string) => steps.findIndex((step) => step.key.endsWith(key));
  assert.deepEqual(repeated, steps);
  assert.ok(index(":party") < index(":alias")); assert.ok(index(":alias") < index(":classification")); assert.ok(index(":claim-open") < index(":event")); assert.ok(index(":event") < index(":claim-bound")); assert.ok(index(":claim-bound") < index(":provenance")); assert.ok(index(":provenance") < index(":authority")); assert.ok(index(":authority") < index(":bank-transaction")); assert.ok(index(":receipt") < index(":payment-group")); assert.ok(index(":match-case") < index(":match-candidate")); assert.ok(index(":match-candidate") < index(":group-member")); assert.ok(index(":group-member") < index(":allocation"));
});

test("fails closed when a dependency is moved after its consumer", () => {
  const steps = buildGroupMaterializationTopology(plan); const reversed = [...steps]; const eventIndex = reversed.findIndex((step) => step.key.endsWith(":event")); const [event] = reversed.splice(eventIndex, 1); reversed.push(event);
  assert.throws(() => validateGroupMaterializationTopology(reversed), /materialization_topology_invalid/);
});

test("rejects stable identity reuse before reservations", () => {
  const duplicate = structuredClone(plan); duplicate.groups.push(structuredClone(duplicate.groups[0])); duplicate.groups[1].primaryCoordinateKey = "bank:toss:2";
  assert.throws(() => buildGroupMaterializationTopology(duplicate), /materialization_identity_collision/);
});
