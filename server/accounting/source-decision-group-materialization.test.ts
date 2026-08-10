import assert from "node:assert/strict";
import test from "node:test";
import { assertGroupClaimVersionContract, bindGroupExecutionReservation, buildGroupMaterializationTopology, buildGroupOperationProjection, buildGroupReservationBlueprint, reserveGroupExecutionReservation, validateGroupMaterializationTopology } from "./source-decision-group-materialization";
import type { GroupMultiBatchApplyPlan } from "./source-decision-group-plan";

const plan: GroupMultiBatchApplyPlan = {
  orderedBatchUids: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
  orderedDecisionSetUids: ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"],
  resolvedBindings: { bankAccountId: "1", bankAccountCode: "TOSS_OFFICER_2026", rosterBatchIdsByUid: { "22222222-2222-4222-8222-222222222222": "6" }, eventPartyIdsByUid: { "55555555-5555-4555-8555-555555555555": null }, memberIdsByUid: { "66666666-6666-4666-8666-666666666666": "9" }, categoriesByCoordinate: { "bank:toss:1": { DUES_INCOME: { id: "7", displayName: "회비 수입" } } }, periodIdsByCoordinate: { "bank:toss:1": "8" }, financialDigestsByCoordinate: { "bank:toss:1": { rowFingerprint: "a".repeat(64), snapshotDigest: "b".repeat(64), payerDigest: "c".repeat(64), descriptionDigest: "d".repeat(64) } } },
  groups: [{
    primaryCoordinateKey: "bank:toss:1", eventPartyUid: "55555555-5555-4555-8555-555555555555", receiptUid: "77777777-7777-4777-8777-777777777777", rosterBatchUid: "22222222-2222-4222-8222-222222222222", duesAmount: "50000", approvedAllocationAmount: "50000", categorySplits: [{ categoryCode: "DUES_INCOME", amount: "50000" }], eventAmount: "50000", occurredAt: "2026-01-01T00:00:00+09:00", postedDate: "2026-01-01",
    primaryEvidence: { decisionItemId: "10", coordinateId: "11", sourceRowVersionId: "12", contentDigest: "e".repeat(64), normalizationVersion: "bank-row-v1@1.0.0", normalizedPayload: { amount: "50000" } },
    allocations: [{ coordinateKey: "roster:1", allocationRequestUid: "88888888-8888-4888-8888-888888888888", groupMemberUid: "99999999-9999-4999-8999-999999999999", memberUid: "66666666-6666-4666-8666-666666666666", caseUid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", amount: "50000", duesYear: 2025, allocationKind: "dues", evidenceKind: "roster_member_uid", evidenceDigest: "1".repeat(64), scoreBasis: "exact_roster_member_uid", evidence: { allocationDecisionItemId: "20", memberMatchDecisionItemId: "21", coordinateId: "22", sourceRowVersionId: "23", contentDigest: "f".repeat(64), normalizationVersion: "allocation-roster-row-v1@1.0.0", normalizedPayload: { member_name_key_digest: "2".repeat(64), proposed_amount: "50000" } } }],
  }],
};

test("builds the exact dependency-ordered group materialization topology", () => {
  const steps = buildGroupMaterializationTopology(plan); const repeated = buildGroupMaterializationTopology(plan); const index = (key: string) => steps.findIndex((step) => step.key.endsWith(key));
  assert.deepEqual(repeated, steps);
  assert.ok(index(":party") < index(":alias")); assert.ok(index(":alias") < index(":classification")); assert.ok(index(":claim-open") < index(":event-create")); assert.ok(index(":event-create") < index(":claim-bound")); assert.ok(index(":claim-bound") < index(":provenance")); assert.ok(index(":provenance") < index(":authority")); assert.ok(index(":authority") < index(":bank-transaction")); assert.ok(index(":receipt-create") < index(":payment-group-create"));
  assert.ok(index(":match-case-create") < index(":match-candidate-create")); assert.ok(index(":match-candidate-create") < index(":group-member-create")); assert.ok(index(":group-member-create") < index(":match-candidate-approve")); assert.ok(index(":match-candidate-approve") < index(":match-case-approve")); assert.ok(index(":match-case-approve") < index(":group-member-approve")); assert.ok(index(":group-member-approve") < index(":allocation-create")); assert.ok(index(":allocation-create") < index(":allocation-approve")); assert.ok(index(":allocation-approve") < index(":receipt-approve")); assert.ok(index(":receipt-approve") < index(":payment-group-approve")); assert.ok(index(":payment-group-approve") < index(":event-approve"));
  for (const step of steps.filter((candidate) => candidate.rowMode === "update")) { assert.ok(step.targetStepKey); assert.ok(step.dependsOn.includes(step.targetStepKey!)); assert.ok(steps.findIndex((candidate) => candidate.key === step.targetStepKey) < steps.indexOf(step)); }
  assert.equal(steps.find((step) => step.key.endsWith(":claim-bound"))?.targetStepKey, steps.find((step) => step.key.endsWith(":claim-open"))?.key);
  assert.ok(steps.every((step) => step.groupCoordinateKey === "bank:toss:1"));
  assert.ok(steps.filter((step) => ["member_match_cases", "member_match_candidates", "dues_group_members", "dues_allocations"].includes(step.table)).every((step) => step.allocationCoordinateKey === "roster:1"));
  assert.ok(steps.filter((step) => !["member_match_cases", "member_match_candidates", "dues_group_members", "dues_allocations"].includes(step.table)).every((step) => step.allocationCoordinateKey === null));
  assert.ok(steps.filter((step) => step.table === "cashbook_entries").every((step) => step.categoryCode === "DUES_INCOME"));
  assert.ok(steps.filter((step) => step.table !== "cashbook_entries").every((step) => step.categoryCode === null));
});

test("fails closed when a dependency is moved after its consumer", () => {
  const steps = buildGroupMaterializationTopology(plan); const reversed = [...steps]; const eventIndex = reversed.findIndex((step) => step.key.endsWith(":event-create")); const [event] = reversed.splice(eventIndex, 1); reversed.push(event);
  assert.throws(() => validateGroupMaterializationTopology(reversed), /materialization_topology_invalid/);
});

test("fails closed when an update loses its reserved target", () => {
  const steps = buildGroupMaterializationTopology(plan); const broken = structuredClone(steps); const update = broken.find((step) => step.rowMode === "update")!; update.targetStepKey = null;
  assert.throws(() => validateGroupMaterializationTopology(broken), /materialization_topology_invalid/);
});

test("fails closed when explicit source metadata does not match the target table", () => {
  const steps = buildGroupMaterializationTopology(plan); const broken = structuredClone(steps);
  broken.find((step) => step.table === "cashbook_entries")!.categoryCode = null;
  assert.throws(() => validateGroupMaterializationTopology(broken), /materialization_topology_invalid/);
  const allocationBroken = structuredClone(steps);
  allocationBroken.find((step) => step.table === "dues_allocations")!.allocationCoordinateKey = null;
  assert.throws(() => validateGroupMaterializationTopology(allocationBroken), /materialization_topology_invalid/);
});

test("builds one deterministic reservation for every new row and audit", () => {
  const blueprint = buildGroupReservationBlueprint(plan); const steps = buildGroupMaterializationTopology(plan);
  assert.equal(blueprint.businessRows.length, steps.filter((step) => step.rowMode === "insert").length); assert.ok(blueprint.businessRows.length < steps.length); assert.equal(blueprint.transitionAuditKeys.length, 4); assert.equal(blueprint.sequenceTables[0], "business_operation_receipts"); assert.equal(blueprint.sequenceTables.filter((table) => table === "accounting_audit_events").length, steps.length + 4); assert.equal(blueprint.sequenceTables.length, 1 + blueprint.businessRows.length + steps.length + 4); assert.deepEqual(buildGroupReservationBlueprint(plan), blueprint);
  assert.deepEqual(blueprint.sequenceSlots.map((slot) => slot.phase), [0, ...Array(blueprint.businessRows.length).fill(10), ...Array(steps.length + 4).fill(30)]);
  assert.deepEqual(blueprint.businessRows.map((row) => row.resultOrdinal), [...blueprint.businessRows.map((row) => row.resultOrdinal)].sort((left, right) => left - right));
  assert.deepEqual(blueprint.sequenceSlots.filter((slot) => slot.slotKind === "audit").map((slot) => slot.resultOrdinal), Array.from({ length: steps.length + 4 }, (_, index) => index + 1));
  assert.equal(new Set(blueprint.sequenceSlots.filter((slot) => slot.actionKey !== null).map((slot) => `${slot.slotKind}:${slot.actionKey}`)).size, blueprint.sequenceSlots.length - 1);
});

test("binds every insert, update target, audit, and correlation without ambiguity", () => {
  const blueprint=buildGroupReservationBlueprint(plan);const reserved=blueprint.sequenceTables.map((_,index)=>String(index+1));const operationUid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";const bound=bindGroupExecutionReservation(plan,operationUid,reserved);const repeated=bindGroupExecutionReservation(plan,operationUid,reserved);
  assert.deepEqual(repeated,bound);assert.equal(bound.operationReceiptId,"1");assert.equal(bound.transitionAudits.length,4);assert.equal(bound.steps.length,buildGroupMaterializationTopology(plan).length);assert.equal(new Set(bound.steps.map((step)=>step.auditId)).size,bound.steps.length);
  const actions=[...bound.transitionAudits,...bound.steps];assert.deepEqual(actions.map((action)=>action.executionOrdinal),actions.map((_,index)=>index+1));assert.deepEqual([...actions].sort((left,right)=>left.resultOrdinal-right.resultOrdinal).map((action)=>`${action.entityType}\u0000${action.entityKey}\u0000${action.action}`),[...actions].map((action)=>`${action.entityType}\u0000${action.entityKey}\u0000${action.action}`).sort((left,right)=>Buffer.compare(Buffer.from(left),Buffer.from(right))));
  assert.deepEqual(bound.transitionAudits.map((action)=>[action.entityType,action.action]),[["source_decision_set","approve"],["source_decision_set","approve"],["import_batch","apply"],["import_batch","apply"]]);
  for(const step of bound.steps.filter((candidate)=>candidate.rowMode==="update")){assert.equal(step.rowId,step.targetRowId);assert.ok(bound.steps.some((candidate)=>candidate.key===step.targetStepKey&&candidate.rowMode==="insert"&&candidate.rowId===step.rowId));}
  const open=bound.steps.find((step)=>step.key.endsWith(":claim-open"))!;const boundClaim=bound.steps.find((step)=>step.key.endsWith(":claim-bound"))!;assert.notEqual(boundClaim.rowId,open.rowId);assert.equal(boundClaim.targetRowId,open.rowId);
});

test("rejects missing, duplicate, and malformed reservations before DML", () => {
  const blueprint=buildGroupReservationBlueprint(plan);const ids=blueprint.sequenceTables.map((_,index)=>String(index+1));const operationUid="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  assert.throws(()=>bindGroupExecutionReservation(plan,operationUid,ids.slice(1)),/reservation_count_mismatch/);const duplicate=[...ids];duplicate[1]=duplicate[0];assert.throws(()=>bindGroupExecutionReservation(plan,operationUid,duplicate),/reservation_count_mismatch/);const malformed=[...ids];malformed[1]="0";assert.throws(()=>bindGroupExecutionReservation(plan,operationUid,malformed),/reservation_count_mismatch/);
});

test("reserves the exact closed sequence-table order once", async () => {
  const blueprint=buildGroupReservationBlueprint(plan);const observed:string[]=[];const bound=await reserveGroupExecutionReservation(plan,"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",async(table)=>{observed.push(table);return {id:String(observed.length),sequenceName:`public.${table}_id_seq`};});
  assert.deepEqual(observed,blueprint.sequenceTables);assert.equal(bound.operationReceiptId,"1");assert.equal(new Set([...bound.transitionAudits,...bound.steps].map((action)=>action.auditId)).size,bound.transitionAudits.length+bound.steps.length);
  const projection=buildGroupOperationProjection(bound);assert.deepEqual(projection.expectedResults.map((result)=>result.ordinal),Array.from({length:projection.expectedResults.length},(_,index)=>index+1));assert.deepEqual(projection.reservationSlots.map((slot)=>slot.slotOrdinal),Array.from({length:projection.reservationSlots.length},(_,index)=>index+1));assert.equal(projection.reservationSlots[0].resultOrdinal,0);assert.ok(projection.reservationSlots.slice(1).every((slot)=>slot.resultOrdinal>0));assert.ok(projection.reservationSlots.every((slot)=>slot.reservedId===String(slot.slotOrdinal)));
});

test("refuses to project missing or malformed catalog-bound reservation slots", async () => {
  const blueprint=buildGroupReservationBlueprint(plan);const ids=blueprint.sequenceTables.map((_,index)=>String(index+1));const bound=bindGroupExecutionReservation(plan,"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",ids);
  assert.throws(()=>buildGroupOperationProjection(bound),/reservation_slots_missing/);
  let ordinal=0;await assert.rejects(()=>reserveGroupExecutionReservation(plan,"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",async()=>({id:String(++ordinal),sequenceName:"not-qualified"})),/reservation_catalog_invalid/);
});

test("rejects stable identity reuse before reservations", () => {
  const duplicate = structuredClone(plan); duplicate.groups.push(structuredClone(duplicate.groups[0])); duplicate.groups[1].primaryCoordinateKey = "bank:toss:2"; duplicate.resolvedBindings!.categoriesByCoordinate["bank:toss:2"] = { DUES_INCOME: { id: "7", displayName: "회비 수입" } }; duplicate.resolvedBindings!.periodIdsByCoordinate["bank:toss:2"] = "8";
  assert.throws(() => buildGroupMaterializationTopology(duplicate), /materialization_identity_collision/);
});

test("requires root-only coordinate uniqueness for append-only claim successors", async () => {
  const accepted = { query: async () => ({ rowCount: 1, rows: [{ constraint_names: [], unique_indexes: [{ name: "claims_coordinate_root", predicate: "(version = 1)", columns: ["coordinate_id"] }] }] }) };
  await assert.doesNotReject(() => assertGroupClaimVersionContract(accepted as never));
  const allVersionsUnique = { query: async () => ({ rowCount: 1, rows: [{ constraint_names: ["economic_event_claims__coordinate_id__key"], unique_indexes: [{ name: "economic_event_claims__coordinate_id__key", predicate: null, columns: ["coordinate_id"] }] }] }) };
  await assert.rejects(() => assertGroupClaimVersionContract(allVersionsUnique as never), /claim_version_contract_mismatch/);
});
