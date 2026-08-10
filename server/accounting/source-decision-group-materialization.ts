import { createHash } from "node:crypto";
import type { GroupMultiBatchApplyPlan } from "./source-decision-group-plan";
import type { PoolClient } from "pg";

export type GroupMaterializationStep = {
  key: string;
  table: string;
  action: "create" | "approve" | "bind" | "select";
  rowMode: "insert" | "update";
  targetStepKey: string | null;
  groupCoordinateKey: string;
  allocationCoordinateKey: string | null;
  categoryCode: string | null;
  dependsOn: string[];
};
export type GroupReservationSlot = { phase: 0 | 10 | 30; resultOrdinal: number; slotKind: "receipt" | "business" | "audit"; table: string; actionKey: string | null };
export type GroupReservationBlueprint = { businessRows: Array<{ stepKey: string; table: string; resultOrdinal: number }>; transitionAuditKeys: string[]; sequenceSlots: GroupReservationSlot[]; sequenceTables: string[] };
export type GroupExecutionReservation = {
  operationReceiptId: string;
  transitionAudits: GroupBoundAction[];
  steps: Array<GroupMaterializationStep & GroupBoundAction & { rowId: string; targetRowId: string | null }>;
  reservationSlots?: Array<GroupReservationSlot & { reservedId: string; sequenceName: string }>;
};
export type GroupBoundAction = { key: string; entityType: string; entityKey: string; action: string; auditId: string; correlationUid: string; executionOrdinal: number; resultOrdinal: number };
export type GroupOperationProjection = {
  expectedResults: Array<{ ordinal: number; entityType: string; entityKey: string; entityAction: string; actionCorrelationUid: string }>;
  reservationSlots: Array<{ slotOrdinal: number; phase: 0 | 10 | 30; resultOrdinal: number; slotKind: "receipt" | "business" | "audit"; slotKindOrder: 0 | 10 | 30; qualifiedTableName: string; localOrdinal: 1; sequenceName: string; reservedId: string }>;
};

function fail(code: string): never { throw new Error(code); }
function compare(left: string, right: string): number { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }
function deterministicUuidV4(seed: string): string { const bytes=createHash("sha256").update(seed).digest().subarray(0,16);bytes[6]=(bytes[6]&0x0f)|0x40;bytes[8]=(bytes[8]&0x3f)|0x80;const hex=bytes.toString("hex");return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
const ENTITY_TYPE_BY_TABLE: Record<string,string>={economic_event_parties:"event_party",economic_event_party_aliases:"event_party_alias",source_row_classification_decisions:"source_row_classification",economic_event_claims:"event_claim",economic_events:"economic_event",economic_event_provenance:"event_provenance",economic_event_authority_decisions:"event_authority_decision",bank_transactions:"bank_transaction",cashbook_entries:"cashbook_entry",dues_receipts:"receipt",dues_payment_groups:"group",member_match_cases:"match_case",member_match_candidates:"match_candidate",dues_group_members:"group_member",dues_allocations:"allocation"};
function resultSortKey(action:{entityType:string;entityKey:string;action:string}):string{return `${action.entityType}\u0000${action.entityKey}\u0000${action.action}`;}

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

export async function assertGroupMemberVersionContract(client:Pick<PoolClient,"query">):Promise<void>{
  const catalog=await client.query<{constraint_names:string[];unique_indexes:Array<{name:string;predicate:string|null;columns:string[]}>}>(`
    SELECT COALESCE((SELECT jsonb_agg(c.conname ORDER BY c.conname) FROM pg_catalog.pg_constraint c WHERE c.conrelid='public.dues_group_members'::regclass AND c.contype='u' AND c.conkey=ARRAY[(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=c.conrelid AND attname='group_id'),(SELECT attnum FROM pg_catalog.pg_attribute WHERE attrelid=c.conrelid AND attname='source_row_version_id')]::smallint[]),'[]'::jsonb) AS constraint_names,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('name',ci.relname,'predicate',pg_catalog.pg_get_expr(i.indpred,i.indrelid),'columns',ARRAY(SELECT a.attname FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS key(attnum,ordinality) JOIN pg_catalog.pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=key.attnum WHERE key.ordinality<=i.indnkeyatts ORDER BY key.ordinality)) ORDER BY ci.relname) FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class ci ON ci.oid=i.indexrelid WHERE i.indrelid='public.dues_group_members'::regclass AND i.indisunique),'[]'::jsonb) AS unique_indexes`);
  if(catalog.rowCount!==1)fail("source_decision_group_member_version_contract_unreadable");const row=catalog.rows[0];const rootUnique=row.unique_indexes.some((index)=>{const predicate=(index.predicate??"").replace(/[\s()]/g,"").replace(/::integer/g,"");return index.columns.length===2&&index.columns[0]==="group_id"&&index.columns[1]==="source_row_version_id"&&predicate==="version=1";});if(row.constraint_names.length!==0||!rootUnique)fail("source_decision_group_member_version_contract_mismatch");
}

export function validateGroupMaterializationTopology(steps: GroupMaterializationStep[]): void {
  const seen = new Set<string>();
  for (const step of steps) {
    const allocationTable=["member_match_cases","member_match_candidates","dues_group_members","dues_allocations"].includes(step.table);const cashbook=step.table==="cashbook_entries";
    if (!step.key || !step.groupCoordinateKey || seen.has(step.key) || !["create","approve","bind","select"].includes(step.action) || !["insert","update"].includes(step.rowMode) || step.dependsOn.some((dependency) => !seen.has(dependency)) || step.rowMode === "update" && step.action === "create" || step.rowMode === "update" && (!step.targetStepKey || !step.dependsOn.includes(step.targetStepKey)) || step.targetStepKey !== null && !seen.has(step.targetStepKey) || allocationTable !== (step.allocationCoordinateKey !== null) || cashbook !== (step.categoryCode !== null)) fail("source_decision_group_materialization_topology_invalid");
    seen.add(step.key);
  }
}

export function buildGroupMaterializationTopology(plan: GroupMultiBatchApplyPlan): GroupMaterializationStep[] {
  if(!plan.resolvedBindings||plan.groups.length===0)fail("source_decision_group_materialization_evidence_missing");
  for(const group of plan.groups){if(!group.primaryEvidence?.normalizationVersion||!/^[0-9a-f]{64}$/.test(group.classificationDecisionPayloadSha256)||!["dues","mixed"].includes(group.classificationKind)||!Number.isInteger(group.duesYear)||group.duesYear<=0)fail("source_decision_group_materialization_primary_evidence_missing");for(const allocation of group.allocations){const normalized=allocation.evidence?.normalizedPayload;if(!allocation.evidence?.normalizationVersion)fail("source_decision_group_materialization_allocation_version_missing");if(typeof normalized?.member_name_key_digest!=="string"||!/^[0-9a-f]{64}$/.test(normalized.member_name_key_digest))fail("source_decision_group_materialization_member_digest_missing");if(!Number.isInteger(normalized.generation))fail("source_decision_group_materialization_generation_missing");if(!allocation.evidenceKind||!/^[0-9a-f]{64}$/.test(allocation.evidenceDigest)||!allocation.scoreBasis)fail("source_decision_group_materialization_match_evidence_missing");}}
  const identities = new Set<string>();
  const claim = (kind: string, value: string) => { const key = `${kind}:${value}`; if (identities.has(key)) fail("source_decision_group_materialization_identity_collision"); identities.add(key); };
  const steps: GroupMaterializationStep[] = [];
  const groups = [...plan.groups].sort((left, right) => compare(left.primaryCoordinateKey, right.primaryCoordinateKey));
  for (const group of groups) {
    claim("party", group.eventPartyUid); claim("receipt", group.receiptUid);
    const categoryBindings = plan.resolvedBindings.categoriesByCoordinate[group.primaryCoordinateKey];
    if (!(group.eventPartyUid in plan.resolvedBindings.eventPartyIdsByUid) || !plan.resolvedBindings.rosterBatchIdsByUid[group.rosterBatchUid] || group.allocations.some((allocation) => !plan.resolvedBindings!.memberIdsByUid[allocation.memberUid]) || !categoryBindings || group.categorySplits.some((split) => !categoryBindings[split.categoryCode]) || !plan.resolvedBindings.periodIdsByCoordinate[group.primaryCoordinateKey] || !plan.resolvedBindings.financialDigestsByCoordinate[group.primaryCoordinateKey]) fail("source_decision_group_materialization_binding_missing");
    const prefix = `group:${group.primaryCoordinateKey}`;
    const add = (key: string, table: string, action: GroupMaterializationStep["action"], rowMode: GroupMaterializationStep["rowMode"], dependsOn: string[], targetStepKey: string | null = null, allocationCoordinateKey: string | null = null, categoryCode: string | null = null) => steps.push({ key, table, action, rowMode, targetStepKey, groupCoordinateKey:group.primaryCoordinateKey, allocationCoordinateKey, categoryCode, dependsOn });
    const party = `${prefix}:party`; const alias = `${prefix}:alias`; const classification = `${prefix}:classification`; const openClaim = `${prefix}:claim-open`; const event = `${prefix}:event-create`; const boundClaim = `${prefix}:claim-bound`; const provenance = `${prefix}:provenance`; const authority = `${prefix}:authority`; const transaction = `${prefix}:bank-transaction`; const receipt = `${prefix}:receipt-create`; const paymentGroup = `${prefix}:payment-group-create`;
    if (plan.resolvedBindings.eventPartyIdsByUid[group.eventPartyUid] === null) add(party, "economic_event_parties", "create", "insert", []);
    const partyDependency = plan.resolvedBindings.eventPartyIdsByUid[group.eventPartyUid] === null ? [party] : [];
    add(alias, "economic_event_party_aliases", "create", "insert", partyDependency);
    add(classification, "source_row_classification_decisions", "approve", "insert", [alias]);
    add(openClaim, "economic_event_claims", "create", "insert", [classification]);
    add(event, "economic_events", "create", "insert", [openClaim]);
    add(boundClaim, "economic_event_claims", "bind", "insert", [event, openClaim], openClaim);
    add(provenance, "economic_event_provenance", "create", "insert", [boundClaim]);
    add(authority, "economic_event_authority_decisions", "select", "insert", [provenance]);
    add(transaction, "bank_transactions", "create", "insert", [authority]);
    const cashbooks = [...group.categorySplits].sort((left, right) => compare(left.categoryCode, right.categoryCode)).map((split) => { const key = `${prefix}:cashbook:${split.categoryCode}:create`; add(key, "cashbook_entries", "create", "insert", [transaction],null,null,split.categoryCode); return key; });
    add(receipt, "dues_receipts", "create", "insert", cashbooks);
    add(paymentGroup, "dues_payment_groups", "create", "insert", [receipt]);
    const allocationApprovals: string[] = [];
    for (const allocation of [...group.allocations].sort((left, right) => compare(left.coordinateKey, right.coordinateKey))) {
      claim("allocation", allocation.allocationRequestUid); claim("group-member", allocation.groupMemberUid); claim("match-case", allocation.caseUid);
      const memberPrefix = `${prefix}:member:${allocation.coordinateKey}`; const matchCase = `${memberPrefix}:match-case-create`; const matchCandidate = `${memberPrefix}:match-candidate-create`; const groupMember = `${memberPrefix}:group-member-create`; const candidateApproval = `${memberPrefix}:match-candidate-approve`; const caseApproval = `${memberPrefix}:match-case-approve`; const memberApproval = `${memberPrefix}:group-member-approve`; const allocationStep = `${memberPrefix}:allocation-create`; const allocationApproval = `${memberPrefix}:allocation-approve`;
      add(matchCase, "member_match_cases", "create", "insert", [],null,allocation.coordinateKey);
      add(matchCandidate, "member_match_candidates", "create", "insert", [matchCase],null,allocation.coordinateKey);
      add(groupMember, "dues_group_members", "create", "insert", [paymentGroup, matchCandidate],null,allocation.coordinateKey);
      add(candidateApproval, "member_match_candidates", "approve", "update", [groupMember, matchCandidate],matchCandidate,allocation.coordinateKey);
      add(caseApproval, "member_match_cases", "approve", "insert", [candidateApproval, matchCase],matchCase,allocation.coordinateKey);
      add(memberApproval, "dues_group_members", "approve", "insert", [caseApproval, groupMember],groupMember,allocation.coordinateKey);
      add(allocationStep, "dues_allocations", "create", "insert", [memberApproval, receipt, event],null,allocation.coordinateKey);
      add(allocationApproval, "dues_allocations", "approve", "update", [allocationStep],allocationStep,allocation.coordinateKey);
      allocationApprovals.push(allocationApproval);
    }
    const cashbookApprovals = cashbooks.map((cashbook) => { const key = cashbook.replace(/:create$/, ":approve"); const categoryCode=key.slice(key.lastIndexOf(":cashbook:")+10,key.lastIndexOf(":approve"));add(key, "cashbook_entries", "approve", "update", [cashbook],cashbook,null,categoryCode); return key; });
    const receiptApproval = `${prefix}:receipt-approve`; add(receiptApproval, "dues_receipts", "approve", "update", [...cashbookApprovals, ...allocationApprovals, receipt], receipt);
    const groupApproval = `${prefix}:payment-group-approve`; add(groupApproval, "dues_payment_groups", "approve", "update", [receiptApproval, ...allocationApprovals, paymentGroup], paymentGroup);
    add(`${prefix}:event-approve`, "economic_events", "approve", "update", [groupApproval, event], event);
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
  const resultKeys = [
    ...transitionAuditKeys.map((key) => ({ actionKey: key, entityType: key.startsWith("decision-set:") ? "source_decision_set" : "import_batch", entityKey: key.slice(0, key.lastIndexOf(":")), action: key.startsWith("decision-set:") ? "approve" : "apply" })),
    ...steps.map((step) => ({ actionKey: step.key, entityType: ENTITY_TYPE_BY_TABLE[step.table], entityKey: step.key, action: step.action })),
  ].sort((left,right)=>compare(resultSortKey(left),resultSortKey(right)));
  if (resultKeys.some((result) => !result.entityType) || new Set(resultKeys.map((result) => result.actionKey)).size !== resultKeys.length) fail("source_decision_group_reservation_blueprint_invalid");
  const resultOrdinalByActionKey=Object.fromEntries(resultKeys.map((result,index)=>[result.actionKey,index+1]));
  const businessRows = steps.filter((step) => step.rowMode === "insert").map((step) => ({ stepKey: step.key, table: step.table, resultOrdinal: resultOrdinalByActionKey[step.key] })).sort((left,right)=>left.resultOrdinal-right.resultOrdinal||compare(left.table,right.table)||compare(left.stepKey,right.stepKey));
  const sequenceSlots:GroupReservationSlot[]=[
    {phase:0,resultOrdinal:0,slotKind:"receipt",table:"business_operation_receipts",actionKey:null},
    ...businessRows.map((row)=>({phase:10 as const,resultOrdinal:row.resultOrdinal,slotKind:"business" as const,table:row.table,actionKey:row.stepKey})),
    ...resultKeys.map((result,index)=>({phase:30 as const,resultOrdinal:index+1,slotKind:"audit" as const,table:"accounting_audit_events",actionKey:result.actionKey})),
  ];
  const expectedSequenceTables = sequenceSlots.map((slot)=>slot.table);
  if (new Set(transitionAuditKeys).size !== transitionAuditKeys.length || businessRows.some((row, index) => index > 0 && row.stepKey === businessRows[index - 1].stepKey)) fail("source_decision_group_reservation_blueprint_invalid");
  return { businessRows, transitionAuditKeys, sequenceSlots, sequenceTables: expectedSequenceTables };
}

export function bindGroupExecutionReservation(plan: GroupMultiBatchApplyPlan, operationUid: string, reservedIds: string[]): GroupExecutionReservation {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(operationUid)) fail("source_decision_group_operation_uid_invalid");
  const topology=buildGroupMaterializationTopology(plan);const blueprint=buildGroupReservationBlueprint(plan);
  if(reservedIds.length!==blueprint.sequenceTables.length||reservedIds.some((id)=>!/^[1-9][0-9]*$/.test(id))||new Set(reservedIds.map((id,index)=>`${blueprint.sequenceTables[index]}:${id}`)).size!==reservedIds.length)fail("source_decision_group_reservation_count_mismatch");
  const operationReceiptId=reservedIds[0];const rowIdsByStep:Record<string,string>={};const auditIdsByAction:Record<string,string>={};
  blueprint.sequenceSlots.forEach((slot,index)=>{if(slot.slotKind==="business"&&slot.actionKey)rowIdsByStep[slot.actionKey]=reservedIds[index];if(slot.slotKind==="audit"&&slot.actionKey)auditIdsByAction[slot.actionKey]=reservedIds[index];});
  const transitionAudits=blueprint.transitionAuditKeys.map((key,index)=>{const decision=key.startsWith("decision-set:");const value=key.slice(decision?"decision-set:".length:"batch:".length,key.lastIndexOf(":"));const auditId=auditIdsByAction[key];if(!auditId)fail("source_decision_group_reservation_target_missing");return {key,entityType:decision?"source_decision_set":"import_batch",entityKey:`${decision?"decision-set":"batch"}:${value}`,action:decision?"approve":"apply",auditId,correlationUid:deterministicUuidV4(`${operationUid}\ngroup-transition\n${key}`),executionOrdinal:index+1,resultOrdinal:0};});
  const steps=topology.map((step,index)=>{const own=rowIdsByStep[step.key];const target=step.targetStepKey?rowIdsByStep[step.targetStepKey]:null;const rowId=step.rowMode==="insert"?own:target;const entityType=ENTITY_TYPE_BY_TABLE[step.table];if(!rowId||step.targetStepKey&&!target||!entityType||!auditIdsByAction[step.key])fail("source_decision_group_reservation_target_missing");return {...step,rowId,targetRowId:target,entityType,entityKey:step.key,action:step.action,auditId:auditIdsByAction[step.key],correlationUid:deterministicUuidV4(`${operationUid}\ngroup-step\n${step.key}\n${step.action}`),executionOrdinal:transitionAudits.length+index+1,resultOrdinal:0};});
  const actions:GroupBoundAction[]=[...transitionAudits,...steps];const sorted=[...actions].sort((left,right)=>compare(resultSortKey(left),resultSortKey(right)));sorted.forEach((action,index)=>{action.resultOrdinal=index+1;});
  if(new Set(actions.map((action)=>action.correlationUid)).size!==actions.length||new Set(actions.map((action)=>action.resultOrdinal)).size!==actions.length)fail("source_decision_group_result_bijection_invalid");
  return {operationReceiptId,transitionAudits,steps};
}

export async function reserveGroupExecutionReservation(plan: GroupMultiBatchApplyPlan, operationUid: string, reserveId: (table: string) => Promise<{ id: string; sequenceName: string }>): Promise<GroupExecutionReservation> {
  const blueprint=buildGroupReservationBlueprint(plan);const reserved:Array<{id:string;sequenceName:string}>=[];
  for(const table of blueprint.sequenceTables)reserved.push(await reserveId(table));
  if(reserved.some((item)=>!/^[1-9][0-9]*$/.test(item.id)||!/^public\.[a-z0-9_]+$/.test(item.sequenceName)))fail("source_decision_group_reservation_catalog_invalid");
  const bound=bindGroupExecutionReservation(plan,operationUid,reserved.map((item)=>item.id));
  return {...bound,reservationSlots:blueprint.sequenceSlots.map((slot,index)=>({...slot,reservedId:reserved[index].id,sequenceName:reserved[index].sequenceName}))};
}

export async function reserveGroupExecutionReservationFromDatabase(client: Pick<PoolClient,"query">, plan: GroupMultiBatchApplyPlan, operationUid: string): Promise<GroupExecutionReservation> {
  return reserveGroupExecutionReservation(plan,operationUid,async(table)=>{
    if(!/^[a-z0-9_]+$/.test(table))fail("source_decision_group_reservation_table_invalid");
    const result=await client.query<{id:string;sequence_name:string}>(`SELECT nextval(sequence_name::regclass)::text AS id,sequence_name FROM (SELECT pg_get_serial_sequence($1,'id') AS sequence_name) catalog WHERE sequence_name IS NOT NULL`,[`public.${table}`]);
    if(result.rowCount!==1)fail("source_decision_group_reservation_catalog_invalid");
    return {id:result.rows[0].id,sequenceName:result.rows[0].sequence_name};
  });
}

export function buildGroupOperationProjection(reservation: GroupExecutionReservation): GroupOperationProjection {
  if(!reservation.reservationSlots)fail("source_decision_group_reservation_slots_missing");
  const actions=[...reservation.transitionAudits,...reservation.steps];const byKey=new Map(actions.map((action)=>[action.key,action]));
  const expectedResults=[...actions].sort((left,right)=>left.resultOrdinal-right.resultOrdinal).map((action,index)=>{if(action.resultOrdinal!==index+1)fail("source_decision_group_result_bijection_invalid");return {ordinal:action.resultOrdinal,entityType:action.entityType,entityKey:action.entityKey,entityAction:action.action,actionCorrelationUid:action.correlationUid};});
  const reservationSlots=reservation.reservationSlots.map((slot,index)=>{const action=slot.actionKey===null?null:byKey.get(slot.actionKey);if(slot.resultOrdinal!==0&&!action||action&&action.resultOrdinal!==slot.resultOrdinal)fail("source_decision_group_reservation_slot_result_mismatch");const slotKindOrder=slot.slotKind==="receipt"?0:slot.slotKind==="business"?10:30;return {slotOrdinal:index+1,phase:slot.phase,resultOrdinal:slot.resultOrdinal,slotKind:slot.slotKind,slotKindOrder:slotKindOrder as 0|10|30,qualifiedTableName:`public.${slot.table}`,localOrdinal:1 as const,sequenceName:slot.sequenceName,reservedId:slot.reservedId};});
  if(reservationSlots[0]?.slotKind!=="receipt"||reservationSlots.some((slot,index)=>index>0&&(slot.phase<reservationSlots[index-1].phase||slot.phase===reservationSlots[index-1].phase&&slot.resultOrdinal<reservationSlots[index-1].resultOrdinal)))fail("source_decision_group_reservation_slot_order_invalid");
  return {expectedResults,reservationSlots};
}
