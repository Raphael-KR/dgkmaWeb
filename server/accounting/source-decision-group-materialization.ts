import type { GroupMultiBatchApplyPlan } from "./source-decision-group-plan";
import type { PoolClient } from "pg";

export type GroupMaterializationStep = {
  key: string;
  table: string;
  action: "create" | "approve" | "bind" | "select";
  rowMode: "insert" | "update";
  dependsOn: string[];
};
export type GroupReservationBlueprint = { businessRows: Array<{ stepKey: string; table: string }>; transitionAuditKeys: string[]; sequenceTables: string[] };

function fail(code: string): never { throw new Error(code); }
function compare(left: string, right: string): number { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }

export async function assertGroupClaimVersionContract(client: Pick<PoolClient, "query">): Promise<void> {
  const catalog = await client.query<{ constraint_names: string[]; unique_indexes: Array<{ name: string; predicate: string | null; columns: string[] }> }>(`
    SELECT
      COALESCE((
        SELECT jsonb_agg(c.conname ORDER BY c.conname)
        FROM pg_catalog.pg_constraint c
        WHERE c.conrelid='public.economic_event_claims'::regclass
          AND c.contype='u'
          AND c.conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=c.conrelid AND attname='coordinate_id')]::smallint[]
      ), '[]'::jsonb) AS constraint_names,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'name', ci.relname,
          'predicate', pg_catalog.pg_get_expr(i.indpred,i.indrelid),
          'columns', ARRAY(
            SELECT a.attname
            FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key(attnum,ordinality)
            JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.attnum
            WHERE key.ordinality<=i.indnkeyatts
            ORDER BY key.ordinality
          )
        ) ORDER BY ci.relname)
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid
        WHERE i.indrelid='public.economic_event_claims'::regclass AND i.indisunique
      ), '[]'::jsonb) AS unique_indexes
  `);
  if (catalog.rowCount !== 1) fail("source_decision_claim_version_contract_unreadable");
  const row = catalog.rows[0];
  const rootUnique = row.unique_indexes.some((index) => {
    const predicate = (index.predicate ?? "").replace(/[\s()]/g, "").replace(/::integer/g, "");
    return index.columns.length === 1 && index.columns[0] === "coordinate_id" && predicate === "version=1";
  });
  if (row.constraint_names.length !== 0 || !rootUnique) fail("source_decision_claim_version_contract_mismatch");
}

export function validateGroupMaterializationTopology(steps: GroupMaterializationStep[]): void {
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step.key || seen.has(step.key) || !["create","approve","bind","select"].includes(step.action) || !["insert","update"].includes(step.rowMode) || step.dependsOn.some((dependency) => !seen.has(dependency)) || step.rowMode === "update" && step.action === "create") fail("source_decision_group_materialization_topology_invalid");
    seen.add(step.key);
  }
}

export function buildGroupMaterializationTopology(plan: GroupMultiBatchApplyPlan): GroupMaterializationStep[] {
  if (!plan.resolvedBindings || plan.groups.length === 0 || plan.groups.some((group) => !group.primaryEvidence || group.allocations.some((allocation) => !allocation.evidence))) fail("source_decision_group_materialization_evidence_missing");
  const identities = new Set<string>();
  const claim = (kind: string, value: string) => { const key = `${kind}:${value}`; if (identities.has(key)) fail("source_decision_group_materialization_identity_collision"); identities.add(key); };
  const steps: GroupMaterializationStep[] = [];
  const add = (key: string, table: string, action: GroupMaterializationStep["action"], rowMode: GroupMaterializationStep["rowMode"], dependsOn: string[]) => steps.push({ key, table, action, rowMode, dependsOn });
  const groups = [...plan.groups].sort((left, right) => compare(left.primaryCoordinateKey, right.primaryCoordinateKey));
  for (const group of groups) {
    claim("party", group.eventPartyUid); claim("receipt", group.receiptUid);
    const categoryBindings = plan.resolvedBindings.categoryIdsByCoordinate[group.primaryCoordinateKey];
    if (!(group.eventPartyUid in plan.resolvedBindings.eventPartyIdsByUid) || group.allocations.some((allocation) => !plan.resolvedBindings!.memberIdsByUid[allocation.memberUid]) || !categoryBindings || group.categorySplits.some((split) => !categoryBindings[split.categoryCode]) || !plan.resolvedBindings.periodIdsByCoordinate[group.primaryCoordinateKey] || !plan.resolvedBindings.financialDigestsByCoordinate[group.primaryCoordinateKey]) fail("source_decision_group_materialization_binding_missing");
    const prefix = `group:${group.primaryCoordinateKey}`;
    const party = `${prefix}:party`; const alias = `${prefix}:alias`; const classification = `${prefix}:classification`; const openClaim = `${prefix}:claim-open`; const event = `${prefix}:event-create`; const boundClaim = `${prefix}:claim-bound`; const provenance = `${prefix}:provenance`; const authority = `${prefix}:authority`; const transaction = `${prefix}:bank-transaction`; const receipt = `${prefix}:receipt-create`; const paymentGroup = `${prefix}:payment-group-create`;
    if (plan.resolvedBindings.eventPartyIdsByUid[group.eventPartyUid] === null) add(party, "economic_event_parties", "create", "insert", []);
    const partyDependency = plan.resolvedBindings.eventPartyIdsByUid[group.eventPartyUid] === null ? [party] : [];
    add(alias, "economic_event_party_aliases", "create", "insert", partyDependency);
    add(classification, "source_row_classification_decisions", "approve", "insert", [alias]);
    add(openClaim, "economic_event_claims", "create", "insert", [classification]);
    add(event, "economic_events", "create", "insert", [openClaim]);
    add(boundClaim, "economic_event_claims", "bind", "insert", [event]);
    add(provenance, "economic_event_provenance", "create", "insert", [boundClaim]);
    add(authority, "economic_event_authority_decisions", "select", "insert", [provenance]);
    add(transaction, "bank_transactions", "create", "insert", [authority]);
    const cashbooks = [...group.categorySplits].sort((left, right) => compare(left.categoryCode, right.categoryCode)).map((split) => { const key = `${prefix}:cashbook:${split.categoryCode}:create`; add(key, "cashbook_entries", "create", "insert", [transaction]); return key; });
    add(receipt, "dues_receipts", "create", "insert", cashbooks);
    add(paymentGroup, "dues_payment_groups", "create", "insert", [receipt]);
    const allocationApprovals: string[] = [];
    for (const allocation of [...group.allocations].sort((left, right) => compare(left.coordinateKey, right.coordinateKey))) {
      claim("allocation", allocation.allocationRequestUid); claim("group-member", allocation.groupMemberUid); claim("match-case", allocation.caseUid);
      const memberPrefix = `${prefix}:member:${allocation.coordinateKey}`; const matchCase = `${memberPrefix}:match-case-create`; const matchCandidate = `${memberPrefix}:match-candidate-create`; const groupMember = `${memberPrefix}:group-member-create`; const candidateApproval = `${memberPrefix}:match-candidate-approve`; const caseApproval = `${memberPrefix}:match-case-approve`; const memberApproval = `${memberPrefix}:group-member-approve`; const allocationStep = `${memberPrefix}:allocation-create`; const allocationApproval = `${memberPrefix}:allocation-approve`;
      add(matchCase, "member_match_cases", "create", "insert", []);
      add(matchCandidate, "member_match_candidates", "create", "insert", [matchCase]);
      add(groupMember, "dues_group_members", "create", "insert", [paymentGroup, matchCandidate]);
      add(candidateApproval, "member_match_candidates", "approve", "update", [groupMember]);
      add(caseApproval, "member_match_cases", "approve", "insert", [candidateApproval]);
      add(memberApproval, "dues_group_members", "approve", "insert", [caseApproval]);
      add(allocationStep, "dues_allocations", "create", "insert", [memberApproval, receipt, event]);
      add(allocationApproval, "dues_allocations", "approve", "update", [allocationStep]);
      allocationApprovals.push(allocationApproval);
    }
    const cashbookApprovals = cashbooks.map((cashbook) => { const key = cashbook.replace(/:create$/, ":approve"); add(key, "cashbook_entries", "approve", "update", [cashbook]); return key; });
    const receiptApproval = `${prefix}:receipt-approve`; add(receiptApproval, "dues_receipts", "approve", "update", [...cashbookApprovals, ...allocationApprovals]);
    const groupApproval = `${prefix}:payment-group-approve`; add(groupApproval, "dues_payment_groups", "approve", "update", [receiptApproval, ...allocationApprovals]);
    add(`${prefix}:event-approve`, "economic_events", "approve", "update", [groupApproval]);
  }
  validateGroupMaterializationTopology(steps);
  return steps;
}

export function buildGroupReservationBlueprint(plan: GroupMultiBatchApplyPlan): GroupReservationBlueprint {
  const steps = buildGroupMaterializationTopology(plan);
  const transitionAuditKeys = [
    ...plan.orderedDecisionSetUids.map((uid) => `decision-set:${uid}:approve`),
    ...plan.orderedBatchUids.map((uid) => `batch:${uid}:apply`),
  ];
  const businessRows = steps.filter((step) => step.rowMode === "insert").map((step) => ({ stepKey: step.key, table: step.table }));
  const actionAuditCount = steps.length + transitionAuditKeys.length;
  const expectedSequenceTables = ["business_operation_receipts", ...businessRows.map((row) => row.table), ...Array.from({ length: actionAuditCount }, () => "accounting_audit_events")];
  if (new Set(transitionAuditKeys).size !== transitionAuditKeys.length || businessRows.some((row, index) => index > 0 && row.stepKey === businessRows[index - 1].stepKey)) fail("source_decision_group_reservation_blueprint_invalid");
  return { businessRows, transitionAuditKeys, sequenceTables: expectedSequenceTables };
}
