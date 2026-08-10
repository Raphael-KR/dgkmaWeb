import type { PoolClient } from "pg";
import { canonicalJson } from "./source-contracts";
import { deterministicRoleUuid, type RoleApplyPlan } from "./source-decision-role-plan";

export type RoleMaterializationActor = { userId: number; userUid: string; name: string; authorizationVersion: string };
type RoleAction = {
  key: string;
  table: string;
  entityType: string;
  entityKey: string;
  action: "create" | "approve" | "apply";
  rowMode: "insert" | "update";
  targetKey: string | null;
  coordinateKey: string | null;
  resultOrdinal: number;
  executionOrdinal: number;
  rowId: string;
  auditId: string;
  correlationUid: string;
};
export type RoleExecutionReservation = {
  operationReceiptId: string;
  actions: RoleAction[];
  reservationSlots: Array<{ slotOrdinal: number; phase: 0 | 10 | 30; resultOrdinal: number; slotKind: "receipt" | "business" | "audit"; slotKindOrder: 0 | 10 | 30; qualifiedTableName: string; localOrdinal: 1; sequenceName: string; reservedId: string }>;
};

function fail(code: string): never { throw new Error(code); }
function compare(left: string, right: string): number { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }
function resultKey(action: Pick<RoleAction, "entityType" | "entityKey" | "action">): string { return `${action.entityType}\u0000${action.entityKey}\u0000${action.action}`; }

function blueprint(plans: RoleApplyPlan[], decisionSetUid: string, batchUid: string) {
  const actions: Array<Omit<RoleAction, "resultOrdinal" | "rowId" | "auditId" | "correlationUid"> & { existingRowId?: string }> = [
    { key: `decision-set:${decisionSetUid}:approve`, table: "source_decision_sets", entityType: "source_decision_set", entityKey: `decision-set:${decisionSetUid}`, action: "approve", rowMode: "update", targetKey: null, coordinateKey: null, executionOrdinal: 1 },
    { key: `batch:${batchUid}:apply`, table: "accounting_import_batches", entityType: "import_batch", entityKey: `batch:${batchUid}`, action: "apply", rowMode: "update", targetKey: null, coordinateKey: null, executionOrdinal: 2 },
  ];
  for (const plan of plans) {
    const prefix = `role:${plan.coordinateKey}`;
    actions.push(
      { key: `${prefix}:match-case-create`, table: "member_match_cases", entityType: "match_case", entityKey: `${prefix}:match-case:v1`, action: "create", rowMode: "insert", targetKey: null, coordinateKey: plan.coordinateKey, executionOrdinal: actions.length + 1 },
      { key: `${prefix}:match-candidate-create`, table: "member_match_candidates", entityType: "match_candidate", entityKey: `${prefix}:match-candidate`, action: "create", rowMode: "insert", targetKey: null, coordinateKey: plan.coordinateKey, executionOrdinal: actions.length + 2 },
      { key: `${prefix}:match-candidate-approve`, table: "member_match_candidates", entityType: "match_candidate", entityKey: `${prefix}:match-candidate`, action: "approve", rowMode: "update", targetKey: `${prefix}:match-candidate-create`, coordinateKey: plan.coordinateKey, executionOrdinal: actions.length + 3 },
      { key: `${prefix}:match-case-approve`, table: "member_match_cases", entityType: "match_case", entityKey: `${prefix}:match-case:v2`, action: "approve", rowMode: "insert", targetKey: `${prefix}:match-case-create`, coordinateKey: plan.coordinateKey, executionOrdinal: actions.length + 4 },
      { key: `${prefix}:position-create`, table: "member_position_assignments", entityType: "position", entityKey: `${prefix}:position`, action: "create", rowMode: "insert", targetKey: `${prefix}:match-case-approve`, coordinateKey: plan.coordinateKey, executionOrdinal: actions.length + 5 },
    );
  }
  const sorted = [...actions].sort((left, right) => compare(resultKey(left), resultKey(right)));
  const ordinalByKey = Object.fromEntries(sorted.map((action, index) => [action.key, index + 1]));
  return actions.map((action) => ({ ...action, resultOrdinal: ordinalByKey[action.key] }));
}

async function reserveId(client: Pick<PoolClient, "query">, table: string): Promise<{ id: string; sequenceName: string }> {
  if (!/^[a-z0-9_]+$/.test(table)) fail("source_decision_role_reservation_table_invalid");
  const result = await client.query<{ id: string; sequence_name: string }>(`SELECT nextval(sequence_name::regclass)::text AS id,sequence_name FROM (SELECT pg_get_serial_sequence($1,'id') AS sequence_name) catalog WHERE sequence_name IS NOT NULL`, [`public.${table}`]);
  if (result.rowCount !== 1 || !/^[1-9][0-9]*$/.test(result.rows[0].id) || !/^public\.[a-z0-9_]+$/.test(result.rows[0].sequence_name)) fail("source_decision_role_reservation_catalog_invalid");
  return { id: result.rows[0].id, sequenceName: result.rows[0].sequence_name };
}

export async function reserveRoleExecution(
  client: Pick<PoolClient, "query">,
  plans: RoleApplyPlan[],
  operationUid: string,
  decisionSetUid: string,
  batchUid: string,
  decisionSetId: string,
  batchId: string,
): Promise<RoleExecutionReservation> {
  if (plans.length === 0) fail("source_decision_role_plan_empty");
  const definitions = blueprint(plans, decisionSetUid, batchUid);
  const receipt = await reserveId(client, "business_operation_receipts");
  const rowByKey: Record<string, { id: string; sequenceName: string }> = {
    [`decision-set:${decisionSetUid}:approve`]: { id: decisionSetId, sequenceName: "public.source_decision_sets_id_seq" },
    [`batch:${batchUid}:apply`]: { id: batchId, sequenceName: "public.accounting_import_batches_id_seq" },
  };
  for (const definition of [...definitions].filter((action) => action.rowMode === "insert").sort((left, right) => left.resultOrdinal - right.resultOrdinal)) rowByKey[definition.key] = await reserveId(client, definition.table);
  const auditByKey: Record<string, { id: string; sequenceName: string }> = {};
  for (const definition of [...definitions].sort((left, right) => left.resultOrdinal - right.resultOrdinal)) auditByKey[definition.key] = await reserveId(client, "accounting_audit_events");
  const actions = definitions.map((definition) => {
    const row = definition.rowMode === "insert" ? rowByKey[definition.key] : definition.targetKey ? rowByKey[definition.targetKey] : rowByKey[definition.key];
    if (!row || !auditByKey[definition.key]) fail("source_decision_role_reservation_target_missing");
    return { ...definition, rowId: row.id, auditId: auditByKey[definition.key].id, correlationUid: deterministicRoleUuid(`${operationUid}\nrole-action\n${definition.key}`) };
  });
  const business = [...definitions].filter((action) => action.rowMode === "insert").sort((left, right) => left.resultOrdinal - right.resultOrdinal).map((action) => ({ definition: action, reservation: rowByKey[action.key] }));
  const audits = [...definitions].sort((left, right) => left.resultOrdinal - right.resultOrdinal).map((action) => ({ definition: action, reservation: auditByKey[action.key] }));
  const rawSlots = [
    { phase: 0 as const, resultOrdinal: 0, slotKind: "receipt" as const, slotKindOrder: 0 as const, table: "business_operation_receipts", reservation: receipt },
    ...business.map(({ definition, reservation }) => ({ phase: 10 as const, resultOrdinal: definition.resultOrdinal, slotKind: "business" as const, slotKindOrder: 10 as const, table: definition.table, reservation })),
    ...audits.map(({ definition, reservation }) => ({ phase: 30 as const, resultOrdinal: definition.resultOrdinal, slotKind: "audit" as const, slotKindOrder: 30 as const, table: "accounting_audit_events", reservation })),
  ];
  const reservationSlots = rawSlots.map((slot, index) => ({ slotOrdinal: index + 1, phase: slot.phase, resultOrdinal: slot.resultOrdinal, slotKind: slot.slotKind, slotKindOrder: slot.slotKindOrder, qualifiedTableName: `public.${slot.table}`, localOrdinal: 1 as const, sequenceName: slot.reservation.sequenceName, reservedId: slot.reservation.id }));
  return { operationReceiptId: receipt.id, actions, reservationSlots };
}

function action(reservation: RoleExecutionReservation, key: string): RoleAction { const found = reservation.actions.find((candidate) => candidate.key === key); if (!found) fail("source_decision_role_action_missing"); return found; }
function actorArgs(actor: RoleMaterializationActor, at: string, correlationUid: string): unknown[] { return [at, actor.authorizationVersion, correlationUid, actor.name, actor.userUid, actor.userId]; }

export async function executeRoleMaterialization(
  client: Pick<PoolClient, "query">,
  plans: RoleApplyPlan[],
  reservation: RoleExecutionReservation,
  actor: RoleMaterializationActor,
  decidedAt: string,
  decisionSetUid: string,
  batchUid: string,
): Promise<void> {
  const setAction = action(reservation, `decision-set:${decisionSetUid}:approve`);
  const batchAction = action(reservation, `batch:${batchUid}:apply`);
  await client.query(`UPDATE public.source_decision_sets SET status='approved',approval_actor_at=$1::timestamptz,approval_actor_authorization_version=$2,approval_actor_correlation_uid=$3::uuid,approval_actor_name_snapshot=$4,approval_actor_scope='admin',approval_actor_uid_snapshot=$5::uuid,approval_actor_user_id=$6 WHERE id=$7`, [...actorArgs(actor, decidedAt, setAction.correlationUid), setAction.rowId]);
  await client.query(`UPDATE public.accounting_import_batches SET status='applied',applied_at=$1::timestamptz,apply_actor_at=$1::timestamptz,apply_actor_authorization_version=$2,apply_actor_correlation_uid=$3::uuid,apply_actor_name_snapshot=$4,apply_actor_scope='admin',apply_actor_uid_snapshot=$5::uuid,apply_actor_user_id=$6 WHERE id=$7`, [...actorArgs(actor, decidedAt, batchAction.correlationUid), batchAction.rowId]);
  for (const plan of plans) {
    const prefix = `role:${plan.coordinateKey}`;
    const caseCreate = action(reservation, `${prefix}:match-case-create`);
    const candidateCreate = action(reservation, `${prefix}:match-candidate-create`);
    const candidateApprove = action(reservation, `${prefix}:match-candidate-approve`);
    const caseApprove = action(reservation, `${prefix}:match-case-approve`);
    const positionCreate = action(reservation, `${prefix}:position-create`);
    await client.query(`INSERT INTO public.member_match_cases (id,case_uid,decision_item_id,effective_at,opened_at,reason_code,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,source_row_version_id,status,subject_generation_snapshot,subject_kind,subject_name_digest,supersedes_id,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4::timestamptz,$4::timestamptz,'SOURCE_MATCH_REQUIRED',$4::timestamptz,$5,$6::uuid,$7,'admin',$8::uuid,$9,$10,'candidate',$11,'role_roster',$12,NULL,1)`, [caseCreate.rowId, plan.caseUid, plan.evidence.decisionItemId, ...actorArgs(actor, decidedAt, caseCreate.correlationUid), plan.evidence.sourceRowVersionId, plan.subjectGeneration, plan.subjectNameDigest]);
    await client.query(`INSERT INTO public.member_match_candidates (id,case_uid_snapshot,decision_item_id,evidence_digest,evidence_kind,member_id,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,root_case_id,score_basis,status) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,$6,$7::timestamptz,$8,$9::uuid,$10,'admin',$11::uuid,$12,$13,$14,'candidate')`, [candidateCreate.rowId, plan.caseUid, plan.evidence.decisionItemId, plan.evidenceDigest, plan.evidenceKind, plan.memberId, ...actorArgs(actor, decidedAt, candidateCreate.correlationUid), caseCreate.rowId, plan.scoreBasis]);
    await client.query(`UPDATE public.member_match_candidates SET status='approved',decision_actor_at=$1::timestamptz,decision_actor_authorization_version=$2,decision_actor_correlation_uid=$3::uuid,decision_actor_name_snapshot=$4,decision_actor_scope='admin',decision_actor_uid_snapshot=$5::uuid,decision_actor_user_id=$6 WHERE id=$7`, [...actorArgs(actor, decidedAt, candidateApprove.correlationUid), candidateCreate.rowId]);
    await client.query(`INSERT INTO public.member_match_cases (id,case_uid,decision_actor_at,decision_actor_authorization_version,decision_actor_correlation_uid,decision_actor_name_snapshot,decision_actor_scope,decision_actor_uid_snapshot,decision_actor_user_id,decision_item_id,effective_at,opened_at,reason_code,source_row_version_id,status,subject_generation_snapshot,subject_kind,subject_name_digest,supersedes_id,version) OVERRIDING SYSTEM VALUE SELECT $1,case_uid,$2::timestamptz,$3,$4::uuid,$5,'admin',$6::uuid,$7,decision_item_id,$2::timestamptz,opened_at,'MATCH_APPROVED',source_row_version_id,'approved',subject_generation_snapshot,subject_kind,subject_name_digest,id,2 FROM public.member_match_cases WHERE id=$8`, [caseApprove.rowId, ...actorArgs(actor, decidedAt, caseApprove.correlationUid), caseCreate.rowId]);
    await client.query(`INSERT INTO public.member_position_assignments (id,administration_no,appointment_basis,assignment_uid,date_precision,decision_item_id,display_position,effective_at,effective_from,effective_to,match_candidate_id,match_case_id,member_id,override_reason,position_code,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,source_appointment_date,source_date_text,source_row_version_id,supersedes_id,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4::uuid,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::timestamptz,$11,$12,$13,NULL,$14,$8::timestamptz,$15,$16::uuid,$17,'admin',$18::uuid,$19,$20::date,$21,$22,NULL,1)`, [positionCreate.rowId, plan.administrationNo, plan.appointmentBasis, plan.assignmentUid, plan.datePrecision, plan.evidence.decisionItemId, plan.displayPosition, decidedAt, plan.effectiveFrom, plan.effectiveTo, candidateCreate.rowId, caseApprove.rowId, plan.memberId, plan.positionCode, actor.authorizationVersion, positionCreate.correlationUid, actor.name, actor.userUid, actor.userId, plan.sourceAppointmentDate, plan.sourceDateText, plan.evidence.sourceRowVersionId]);
  }
  for (const item of [...reservation.actions].sort((left, right) => left.executionOrdinal - right.executionOrdinal)) {
    await client.query(`INSERT INTO public.accounting_audit_events (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,gen_random_uuid(),$2,$3,$4,NULL,$5::jsonb,$6::timestamptz,$6::timestamptz,$7,$8,$9::uuid,$10,'admin',$6::timestamptz,$11::uuid,$12)`, [item.auditId, item.entityType, item.entityKey, item.action, canonicalJson({ id: item.rowId }), decidedAt, `audit/${item.entityType}/${item.action}`, actor.userId, actor.userUid, actor.name, item.correlationUid, actor.authorizationVersion]);
  }
}

export function projectRoleOperation(reservation: RoleExecutionReservation) {
  const expectedResults = [...reservation.actions].sort((left, right) => left.resultOrdinal - right.resultOrdinal).map((item, index) => {
    if (item.resultOrdinal !== index + 1) fail("source_decision_role_result_bijection_invalid");
    return { ordinal: item.resultOrdinal, entity_type: item.entityType, entity_key: item.entityKey, entity_action: item.action, action_correlation_uid: item.correlationUid };
  });
  return { expectedResults, reservationSlots: reservation.reservationSlots.map((slot) => ({ slot_ordinal: slot.slotOrdinal, phase: slot.phase, result_ordinal: slot.resultOrdinal, slot_kind: slot.slotKind, slot_kind_order: slot.slotKindOrder, qualified_table_name: slot.qualifiedTableName, local_ordinal: slot.localOrdinal, sequence_name: slot.sequenceName, reserved_id: slot.reservedId })) };
}
