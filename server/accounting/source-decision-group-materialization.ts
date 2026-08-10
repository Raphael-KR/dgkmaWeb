import type { GroupMultiBatchApplyPlan } from "./source-decision-group-plan";

export type GroupMaterializationStep = {
  key: string;
  table: string;
  action: "create";
  dependsOn: string[];
};

function fail(code: string): never { throw new Error(code); }
function compare(left: string, right: string): number { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }

export function validateGroupMaterializationTopology(steps: GroupMaterializationStep[]): void {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.key || seen.has(step.key) || step.action !== "create" || step.dependsOn.some((dependency) => !seen.has(dependency))) fail("source_decision_group_materialization_topology_invalid");
    seen.add(step.key);
  }
}

export function buildGroupMaterializationTopology(plan: GroupMultiBatchApplyPlan): GroupMaterializationStep[] {
  if (!plan.resolvedBindings || plan.groups.length === 0 || plan.groups.some((group) => !group.primaryEvidence || group.allocations.some((allocation) => !allocation.evidence))) fail("source_decision_group_materialization_evidence_missing");
  const identities = new Set<string>();
  const claim = (kind: string, value: string) => { const key = `${kind}:${value}`; if (identities.has(key)) fail("source_decision_group_materialization_identity_collision"); identities.add(key); };
  const steps: GroupMaterializationStep[] = [];
  const add = (key: string, table: string, dependsOn: string[]) => steps.push({ key, table, action: "create", dependsOn });
  const groups = [...plan.groups].sort((left, right) => compare(left.primaryCoordinateKey, right.primaryCoordinateKey));
  for (const group of groups) {
    if (!(group.eventPartyUid in plan.resolvedBindings.eventPartyIdsByUid) || group.allocations.some((allocation) => !plan.resolvedBindings!.memberIdsByUid[allocation.memberUid])) fail("source_decision_group_materialization_binding_missing");
    claim("party", group.eventPartyUid); claim("receipt", group.receiptUid);
    const prefix = `group:${group.primaryCoordinateKey}`;
    const party = `${prefix}:party`; const alias = `${prefix}:alias`; const classification = `${prefix}:classification`; const openClaim = `${prefix}:claim-open`; const event = `${prefix}:event`; const boundClaim = `${prefix}:claim-bound`; const provenance = `${prefix}:provenance`; const authority = `${prefix}:authority`; const transaction = `${prefix}:bank-transaction`; const receipt = `${prefix}:receipt`; const paymentGroup = `${prefix}:payment-group`;
    if (plan.resolvedBindings.eventPartyIdsByUid[group.eventPartyUid] === null) add(party, "economic_event_parties", []);
    const partyDependency = plan.resolvedBindings.eventPartyIdsByUid[group.eventPartyUid] === null ? [party] : [];
    add(alias, "economic_event_party_aliases", partyDependency);
    add(classification, "source_row_classification_decisions", [alias]);
    add(openClaim, "economic_event_claims", [classification]);
    add(event, "economic_events", [openClaim]);
    add(boundClaim, "economic_event_claims", [event]);
    add(provenance, "economic_event_provenance", [boundClaim]);
    add(authority, "economic_event_authority_decisions", [provenance]);
    add(transaction, "bank_transactions", [authority]);
    const cashbooks = [...group.categorySplits].sort((left, right) => compare(left.categoryCode, right.categoryCode)).map((split) => { const key = `${prefix}:cashbook:${split.categoryCode}`; add(key, "cashbook_entries", [transaction]); return key; });
    add(receipt, "dues_receipts", cashbooks);
    add(paymentGroup, "dues_payment_groups", [receipt]);
    for (const allocation of [...group.allocations].sort((left, right) => compare(left.coordinateKey, right.coordinateKey))) {
      claim("allocation", allocation.allocationRequestUid); claim("group-member", allocation.groupMemberUid); claim("match-case", allocation.caseUid);
      const memberPrefix = `${prefix}:member:${allocation.coordinateKey}`; const matchCase = `${memberPrefix}:match-case`; const matchCandidate = `${memberPrefix}:match-candidate`; const groupMember = `${memberPrefix}:group-member`; const allocationStep = `${memberPrefix}:allocation`;
      add(matchCase, "member_match_cases", []);
      add(matchCandidate, "member_match_candidates", [matchCase]);
      add(groupMember, "dues_group_members", [paymentGroup, matchCandidate]);
      add(allocationStep, "dues_allocations", [groupMember, receipt, event]);
    }
  }
  validateGroupMaterializationTopology(steps);
  return steps;
}
