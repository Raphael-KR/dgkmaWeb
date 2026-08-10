import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import { validateSourceDecisionCommand, type ApprovalContext } from "./source-decision-api";
import { loadGroupMultiBatchApplyPlan, type GroupMultiBatchApplyPlan } from "./source-decision-group-plan";
import { assertGroupClaimVersionContract, assertGroupMemberVersionContract, buildGroupOperationProjection, reserveGroupExecutionReservationFromDatabase } from "./source-decision-group-materialization";
import { executeGroupBatchTransitions } from "./source-decision-group-transitions";
import { executeGroupSourceSpines } from "./source-decision-group-source-spine";
import { executeGroupFinancialGraphs } from "./source-decision-group-financial";
import { insertGroupMaterializationAudits } from "./source-decision-group-audit";
import { loadRoleApplyPlans } from "./source-decision-role-plan";
import { executeRoleMaterialization, projectRoleOperation, reserveRoleExecution } from "./source-decision-role-materialization";
import { loadIndividualApplyPlans } from "./source-decision-individual-plan";
import { executeIndividualMaterialization, projectIndividualOperation, reserveIndividualExecution } from "./source-decision-individual-materialization";

type JsonObject = Record<string, CanonicalValue>;
export type SourceDecisionActor = {
  userId: number;
  userUid: string;
  name: string;
  authorizationVersion: string;
  targetFingerprint: string;
};
export type SourceDecisionApprovalReceipt = {
  schema_version: "dgkma-source-decision-approval-v2";
  operation_uid: string;
  primary_decision_set_uid: string;
  primary_batch_uid: string;
  applied_batch_uids: string[];
  approved_decision_set_uids: string[];
  manifest_sha256: string;
  source_fingerprint: string;
  decision: "approve" | "reject" | "repreview" | "supersede";
  replacement_decision_set_uid: string | null;
  replacement_manifest_sha256: string | null;
  actor_user_id: number;
  actor_user_uid: string;
  authorization_version: string;
  target_fingerprint: string;
  decided_at: string;
  operation_payload_sha256: string;
  receipt_sha256: string;
};

type LockedItem = {
  id: string;
  ordinal: number;
  coordinate_id: string;
  coordinate_key: string;
  source_row_version_id: string;
  content_digest: string;
  normalization_version: string;
  decision_kind: string;
  decision_payload: JsonObject;
  decision_payload_sha256: string;
  normalized_payload: JsonObject;
};
type PeriodPlan = { itemId: string; evidenceRowVersionId: string; boundaryRowVersionId: string; periodCode: string; startsAt: string; endsAt: string | null };

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
function fail(code: string): never { throw new Error(code); }
function deterministicUuidV4(seed: string): string {
  const bytes = createHash("sha256").update(seed).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function reserve(client: PoolClient, table: string): Promise<string> {
  const result = await client.query<{ id: string }>("SELECT nextval(pg_get_serial_sequence($1,'id'))::text AS id", [`public.${table}`]);
  return result.rows[0].id;
}
function receiptWithoutHash(input: Omit<SourceDecisionApprovalReceipt, "receipt_sha256">): SourceDecisionApprovalReceipt {
  return { ...input, receipt_sha256: sha256(canonicalJson(input as unknown as CanonicalValue)) };
}
function strictStoredReceipt(value: unknown): SourceDecisionApprovalReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("source_decision_stored_receipt_invalid");
  const receipt = value as SourceDecisionApprovalReceipt; const preimage = { ...receipt } as Partial<SourceDecisionApprovalReceipt>; delete preimage.receipt_sha256;
  if (receipt.schema_version !== "dgkma-source-decision-approval-v2" || receipt.receipt_sha256 !== sha256(canonicalJson(preimage as unknown as CanonicalValue))) fail("source_decision_stored_receipt_invalid");
  return receipt;
}

async function existingReceipt(client: PoolClient, operationUid: string, operationPayloadSha256: string, actor: SourceDecisionActor): Promise<SourceDecisionApprovalReceipt | undefined> {
  const existing = await client.query<{ canonical_payload: { inputs?: { approval_receipt?: unknown; operation_payload_sha256?: string } }; target_fingerprint: string }>("SELECT canonical_payload,target_fingerprint FROM public.business_operation_receipts WHERE operation_uid=$1::uuid FOR UPDATE", [operationUid]);
  if (existing.rowCount === 0) return undefined;
  if (existing.rowCount !== 1 || existing.rows[0].canonical_payload?.inputs?.operation_payload_sha256 !== operationPayloadSha256) fail("source_decision_operation_uid_reuse");
  const receipt = strictStoredReceipt(existing.rows[0].canonical_payload?.inputs?.approval_receipt);
  if (receipt.target_fingerprint !== existing.rows[0].target_fingerprint) fail("source_decision_stored_receipt_target_mismatch");
  if (receipt.target_fingerprint !== actor.targetFingerprint || receipt.actor_user_id !== actor.userId || receipt.actor_user_uid !== actor.userUid || receipt.authorization_version !== actor.authorizationVersion) fail("source_decision_stored_receipt_actor_mismatch");
  return receipt;
}

async function insertOperation(
  client: PoolClient,
  command: Record<string, unknown>,
  actor: SourceDecisionActor,
  receipt: SourceDecisionApprovalReceipt,
  results: JsonObject[],
  slots: JsonObject[],
  receiptId: string,
): Promise<void> {
  const payload = { command: `source_decision:${receipt.decision}`, expected_results: results, inputs: { approval_receipt: receipt as unknown as CanonicalValue, operation_payload_sha256: receipt.operation_payload_sha256, primary_decision_set_uid: receipt.primary_decision_set_uid }, reservation_slots: slots, schema_version: "business-operation-payload-v2" };
  const rootCorrelation = deterministicUuidV4(`${command.operationUid}\nroot-correlation`);
  await client.query(`INSERT INTO public.business_operation_receipts (id,action,actor_name_snapshot,actor_scope,actor_target_user_id,actor_target_user_id_snapshot,actor_uid_snapshot,actor_user_id,actor_user_id_snapshot,authorization_version,canonical_payload,entity_type,operation_uid,payload_sha256,recorded_at,result_entity_keys,root_correlation_uid,target_fingerprint) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,'admin',NULL,NULL,$4::uuid,$5,$5,$6,$7::jsonb,'source_decision',$8::uuid,$9,$10::timestamptz,$11::jsonb,$12::uuid,$13)`, [receiptId, receipt.decision, actor.name, actor.userUid, actor.userId, actor.authorizationVersion, canonicalJson(payload as unknown as CanonicalValue), command.operationUid, sha256(canonicalJson(payload as unknown as CanonicalValue)), receipt.decided_at, canonicalJson(results as unknown as CanonicalValue), rootCorrelation, actor.targetFingerprint]);
  for (const result of results) await client.query("INSERT INTO public.business_operation_entities (operation_uid,ordinal,entity_type,entity_key,entity_action,action_correlation_uid) VALUES ($1::uuid,$2,$3,$4,$5,$6::uuid)", [command.operationUid, result.ordinal, result.entity_type, result.entity_key, result.entity_action, result.action_correlation_uid]);
}

export async function decideSourcePreview(
  pool: Pick<Pool, "connect">,
  decisionSetUid: string,
  command: Record<string, unknown>,
  actor: SourceDecisionActor,
): Promise<SourceDecisionApprovalReceipt> {
  if (!UUID_V4.test(decisionSetUid) || !["approve", "reject", "repreview", "supersede"].includes(String(command.decision))) fail("source_decision_service_operation_unsupported");
  if (typeof command.operationUid !== "string" || !UUID_V4.test(command.operationUid)) fail("source_decision_operation_uid_invalid");
  const operationPayloadSha256 = sha256(canonicalJson(command as unknown as CanonicalValue));
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const liveActor = await client.query<{ id: number; user_uid: string; is_admin: boolean; name: string }>("SELECT id,user_uid::text,is_admin,name FROM public.users WHERE id=$1 FOR UPDATE", [actor.userId]);
    if (liveActor.rowCount !== 1 || !liveActor.rows[0].is_admin || liveActor.rows[0].user_uid !== actor.userUid) fail("source_decision_admin_required");
    const replay = await existingReceipt(client, String(command.operationUid), operationPayloadSha256, actor);
    if (replay) { await client.query("COMMIT"); return replay; }
    const primary = await client.query<{ id: string; decision_set_uid: string; batch_id: string; batch_uid: string; batch_preview_manifest: CanonicalValue; batch_preview_manifest_sha256: string; row_count: number; manifest: CanonicalValue; manifest_sha256: string; source_fingerprint: string; status: string; source_code: string }>(`SELECT ds.id::text,ds.decision_set_uid::text,ds.batch_id::text,b.batch_uid::text,b.preview_manifest batch_preview_manifest,b.preview_manifest_sha256 batch_preview_manifest_sha256,b.row_count,ds.manifest,ds.manifest_sha256,b.source_fingerprint,ds.status,ls.source_code FROM public.source_decision_sets ds JOIN public.accounting_import_batches b ON b.id=ds.batch_id JOIN public.accounting_source_releases r ON r.id=b.source_release_id JOIN public.accounting_logical_sources ls ON ls.id=r.logical_source_id WHERE ds.decision_set_uid=$1::uuid FOR UPDATE OF ds,b,r,ls`, [decisionSetUid]);
    if (primary.rowCount !== 1) fail("source_decision_primary_set_missing");
    const row = primary.rows[0];
    const batchRows = await client.query<{ ordinal: number; coordinate_key: string; content_digest: string; issue_status: string }>(`SELECT br.ordinal,c.coordinate_key,rv.content_digest,rv.issue_status FROM public.accounting_import_batch_rows br JOIN public.accounting_import_coordinates c ON c.id=br.coordinate_id JOIN public.accounting_import_row_versions rv ON rv.id=br.row_version_id WHERE br.batch_id=$1 ORDER BY br.ordinal FOR UPDATE OF br,c,rv`, [row.batch_id]);
    const expectedBatchManifest = batchRows.rows.map((item, index) => {
      if (item.ordinal !== index + 1 || !["accepted", "warning", "blocked"].includes(item.issue_status)) fail("source_decision_primary_batch_row_drift");
      if (index > 0 && Buffer.compare(Buffer.from(batchRows.rows[index - 1].coordinate_key), Buffer.from(item.coordinate_key)) >= 0) fail("source_decision_primary_batch_row_order_mismatch");
      return { coordinate_key: item.coordinate_key, content_digest: item.content_digest, issue_status: item.issue_status };
    });
    if (row.row_count !== batchRows.rowCount || row.batch_preview_manifest_sha256 !== sha256(canonicalJson(expectedBatchManifest)) || canonicalJson(row.batch_preview_manifest) !== canonicalJson(expectedBatchManifest)) fail("source_decision_primary_batch_manifest_drift");
    const itemResult = await client.query<LockedItem>(`SELECT i.id::text,i.ordinal,i.coordinate_id::text,c.coordinate_key,i.source_row_version_id::text,rv.content_digest,rv.normalization_version,rv.normalized_payload,i.decision_kind,i.decision_payload,i.decision_payload_sha256 FROM public.source_decision_items i JOIN public.accounting_import_coordinates c ON c.id=i.coordinate_id JOIN public.accounting_import_row_versions rv ON rv.id=i.source_row_version_id WHERE i.decision_set_id=$1 ORDER BY i.ordinal FOR UPDATE OF i,c,rv`, [row.id]);
    const manifestItems = itemResult.rows.map((item, index) => {
      if (item.ordinal !== index + 1 || item.decision_payload_sha256 !== sha256(canonicalJson(item.decision_payload))) fail("source_decision_primary_item_drift");
      if (index > 0 && Buffer.compare(Buffer.from(`${itemResult.rows[index - 1].coordinate_key}\u0000${itemResult.rows[index - 1].decision_kind}`), Buffer.from(`${item.coordinate_key}\u0000${item.decision_kind}`)) >= 0) fail("source_decision_primary_item_order_mismatch");
      return { ordinal: item.ordinal, coordinate_key: item.coordinate_key, source_content_digest: item.content_digest, decision_kind: item.decision_kind, decision_payload_sha256: item.decision_payload_sha256 };
    });
    const expectedManifest = { schema_version: "source-decision-preview-v1", batch_uid: row.batch_uid, source_fingerprint: row.source_fingerprint, items: manifestItems };
    if (row.manifest_sha256 !== sha256(canonicalJson(expectedManifest)) || canonicalJson(row.manifest) !== canonicalJson(expectedManifest)) fail("source_decision_primary_manifest_drift");
    const expectedItems = itemResult.rows.map((item) => ({ ordinal: item.ordinal, coordinateKey: item.coordinate_key, sourceContentDigest: item.content_digest, decisionKind: item.decision_kind }));
    const context: ApprovalContext = { sessionUserId: actor.userId, liveUserId: actor.userId, liveUserUid: actor.userUid, liveIsAdmin: true, frozenAdminId: actor.userId, frozenAdminUid: actor.userUid, origin: "service://same-origin", hostOrigin: "service://same-origin", fetchSite: "same-origin", expectedDecisionSetUid: decisionSetUid, expectedBatchUid: row.batch_uid, expectedManifestSha256: row.manifest_sha256, expectedSourceFingerprint: row.source_fingerprint, expectedItems };
    validateSourceDecisionCommand(command, context);
    if (command.decision === "approve" && row.status !== "previewed") fail("source_decision_approve_state_invalid");
    if (command.decision === "reject" && row.status !== "previewed") fail("source_decision_reject_state_invalid");
    if (command.decision === "repreview" && row.status !== "rejected") fail("source_decision_repreview_state_invalid");
    if (command.decision === "supersede" && row.status !== "approved") fail("source_decision_supersede_state_invalid");
    if (command.decision === "supersede") {
      const replacements = command.replacementItems as Array<{ decisionPayload: JsonObject }>;
      if (itemResult.rows.some((item) => item.decision_payload.outcome !== "quarantine") || replacements.some((item) => item.decisionPayload.outcome !== "quarantine")) fail("source_decision_supersede_nonquarantine_not_implemented");
      const itemIds = itemResult.rows.map((item) => item.id);
      const descendants = await client.query<{ descendant_count: number }>(`SELECT (
        (SELECT count(*) FROM public.source_row_classification_decisions WHERE decision_item_id=ANY($1::bigint[]) OR member_match_decision_item_id=ANY($1::bigint[])) +
        (SELECT count(*) FROM public.member_match_cases WHERE decision_item_id=ANY($1::bigint[])) +
        (SELECT count(*) FROM public.member_match_candidates WHERE decision_item_id=ANY($1::bigint[])) +
        (SELECT count(*) FROM public.member_position_assignments WHERE decision_item_id=ANY($1::bigint[])) +
        (SELECT count(*) FROM public.economic_event_party_aliases WHERE decision_item_id=ANY($1::bigint[])) +
        (SELECT count(*) FROM public.accounting_periods WHERE decision_item_id=ANY($1::bigint[])) +
        (SELECT count(*) FROM public.dues_receipts WHERE decision_item_id=ANY($1::bigint[])) +
        (SELECT count(*) FROM public.dues_group_members WHERE decision_item_id=ANY($1::bigint[])) +
        (SELECT count(*) FROM public.dues_allocations WHERE decision_item_id=ANY($1::bigint[]))
      )::int AS descendant_count`, [itemIds]);
      if (descendants.rowCount !== 1 || descendants.rows[0].descendant_count !== 0) fail("source_decision_supersede_descendants_exist");
    }
    let groupPlan:GroupMultiBatchApplyPlan|undefined;
    if (command.decision === "approve") {
      groupPlan = await loadGroupMultiBatchApplyPlan(client, { sourceCode: row.source_code, batchUid: row.batch_uid, decisionSetUid: row.decision_set_uid, batchId:row.batch_id, decisionSetId:row.id, items: itemResult.rows.map((item) => ({ coordinateKey: item.coordinate_key, decisionKind: item.decision_kind, decisionPayload: item.decision_payload, evidence: { decisionItemId: item.id, coordinateId: item.coordinate_id, sourceRowVersionId: item.source_row_version_id, contentDigest: item.content_digest, normalizationVersion: item.normalization_version, normalizedPayload: item.normalized_payload } })) });
      if (groupPlan){await assertGroupClaimVersionContract(client);await assertGroupMemberVersionContract(client);}
    }
    const individualPlans=command.decision==="approve"&&!groupPlan?await loadIndividualApplyPlans(client,row.source_code,itemResult.rows.map((item)=>({decisionItemId:item.id,coordinateId:item.coordinate_id,coordinateKey:item.coordinate_key,sourceRowVersionId:item.source_row_version_id,contentDigest:item.content_digest,normalizationVersion:item.normalization_version,normalizedPayload:item.normalized_payload,decisionKind:item.decision_kind,decisionPayload:item.decision_payload}))):[];
    if(individualPlans.length>0)await assertGroupClaimVersionContract(client);
    const individualCoordinates=new Set(individualPlans.map((plan)=>plan.coordinateKey));
    const rolePlans = command.decision === "approve" && !groupPlan
      ? await loadRoleApplyPlans(client, row.source_code, String(command.operationUid), itemResult.rows.filter((item) => item.decision_kind === "member_match").map((item) => ({ decisionItemId:item.id, coordinateId:item.coordinate_id, coordinateKey:item.coordinate_key, sourceRowVersionId:item.source_row_version_id, contentDigest:item.content_digest, normalizedPayload:item.normalized_payload, decisionPayload:item.decision_payload })))
      : [];
    const roleCoordinates = new Set(rolePlans.map((plan) => plan.coordinateKey));
    const periodPlans: PeriodPlan[] = [];
    if (command.decision === "approve" && !groupPlan) for (const item of itemResult.rows) {
      if (item.decision_payload.outcome === "quarantine" || item.decision_payload.outcome === "reject" || roleCoordinates.has(item.coordinate_key) && item.decision_kind === "member_match" || individualCoordinates.has(item.coordinate_key) && ["classification","member_match"].includes(item.decision_kind)) continue;
      if (item.decision_kind !== "period_materialization" || item.decision_payload.outcome !== "approve") fail("source_decision_nonquarantine_apply_not_implemented");
      if (!['AGM36_PERIOD_BOUNDARY','LEDGER_FINAL_2022_2025'].includes(row.source_code)) fail("source_decision_period_source_family_mismatch");
      const payload = item.decision_payload; const periodCode = payload.period_code; const startsAt = payload.starts_at; const endsAt = payload.ends_at; const boundarySourceCode = payload.boundary_source_code; const boundaryCoordinateKey = payload.boundary_coordinate_key; const boundaryContentDigest = payload.boundary_content_digest;
      if (typeof periodCode !== "string" || !periodCode || typeof startsAt !== "string" || !Number.isFinite(Date.parse(startsAt)) || endsAt !== null && (typeof endsAt !== "string" || !Number.isFinite(Date.parse(endsAt))) || typeof boundarySourceCode !== "string" || typeof boundaryCoordinateKey !== "string" || typeof boundaryContentDigest !== "string" || !/^[0-9a-f]{64}$/.test(boundaryContentDigest) || item.normalized_payload.boundary_content_digest !== boundaryContentDigest || endsAt !== null && Date.parse(startsAt) >= Date.parse(endsAt)) fail("source_decision_period_payload_invalid");
      const boundary = await client.query<{ id: string }>(`SELECT rv.id::text FROM public.accounting_import_row_versions rv JOIN public.accounting_import_coordinates c ON c.id=rv.coordinate_id JOIN public.accounting_logical_sources ls ON ls.id=c.logical_source_id WHERE ls.source_code=$1 AND c.coordinate_key=$2 ORDER BY rv.version DESC LIMIT 1 FOR UPDATE OF rv,c,ls`, [boundarySourceCode,boundaryCoordinateKey]);
      if (boundary.rowCount !== 1) fail("source_decision_period_boundary_mismatch");
      const collision = await client.query("SELECT 1 FROM public.accounting_periods WHERE period_code=$1", [periodCode]); if (collision.rowCount !== 0 || periodPlans.some((period) => period.periodCode === periodCode)) fail("source_decision_period_code_collision");
      periodPlans.push({ itemId:item.id,evidenceRowVersionId:item.source_row_version_id,boundaryRowVersionId:boundary.rows[0].id,periodCode,startsAt,endsAt:endsAt as string|null });
    }
    const decidedAt = new Date().toISOString();
    const replacementDecision = ["repreview", "supersede"].includes(String(command.decision));
    const approvalReceipt = receiptWithoutHash({ schema_version: "dgkma-source-decision-approval-v2", operation_uid: String(command.operationUid), primary_decision_set_uid: decisionSetUid, primary_batch_uid: row.batch_uid, applied_batch_uids: command.decision === "approve" ? groupPlan?.orderedBatchUids ?? [row.batch_uid] : [], approved_decision_set_uids: command.decision === "approve" ? groupPlan?.orderedDecisionSetUids ?? [decisionSetUid] : command.decision === "supersede" ? [String(command.replacementDecisionSetUid)] : [], manifest_sha256: row.manifest_sha256, source_fingerprint: row.source_fingerprint, decision: command.decision as "approve" | "reject" | "repreview" | "supersede", replacement_decision_set_uid: replacementDecision ? String(command.replacementDecisionSetUid) : null, replacement_manifest_sha256: replacementDecision ? String(command.replacementManifestSha256) : null, actor_user_id: actor.userId, actor_user_uid: actor.userUid, authorization_version: actor.authorizationVersion, target_fingerprint: actor.targetFingerprint, decided_at: decidedAt, operation_payload_sha256: operationPayloadSha256 });
    if(groupPlan){
      const reservation=await reserveGroupExecutionReservationFromDatabase(client,groupPlan,String(command.operationUid));const projection=buildGroupOperationProjection(reservation);const results=projection.expectedResults.map((result)=>({ordinal:result.ordinal,entity_type:result.entityType,entity_key:result.entityKey,entity_action:result.entityAction,action_correlation_uid:result.actionCorrelationUid}));const slots=projection.reservationSlots.map((slot)=>({slot_ordinal:slot.slotOrdinal,phase:slot.phase,result_ordinal:slot.resultOrdinal,slot_kind:slot.slotKind,slot_kind_order:slot.slotKindOrder,qualified_table_name:slot.qualifiedTableName,local_ordinal:slot.localOrdinal,sequence_name:slot.sequenceName,reserved_id:slot.reservedId}));const materializationActor={userId:actor.userId,userUid:actor.userUid,name:liveActor.rows[0].name,authorizationVersion:actor.authorizationVersion};
      await insertOperation(client,command,actor,approvalReceipt,results,slots,reservation.operationReceiptId);await executeGroupBatchTransitions(client,groupPlan,reservation,materializationActor,decidedAt);const spines=await executeGroupSourceSpines(client,groupPlan,reservation,materializationActor,decidedAt);await executeGroupFinancialGraphs(client,groupPlan,reservation,spines,materializationActor,decidedAt);await insertGroupMaterializationAudits(client,groupPlan,reservation,materializationActor,decidedAt);await client.query("COMMIT");return approvalReceipt;
    }
    if(individualPlans.length>0){const reservation=await reserveIndividualExecution(client,individualPlans,String(command.operationUid),decisionSetUid,row.batch_uid,row.id,row.batch_id);const projection=projectIndividualOperation(reservation);const materializationActor={userId:actor.userId,userUid:actor.userUid,name:liveActor.rows[0].name,authorizationVersion:actor.authorizationVersion};await insertOperation(client,command,actor,approvalReceipt,projection.expectedResults,projection.reservationSlots,reservation.operationReceiptId);await executeIndividualMaterialization(client,individualPlans,reservation,materializationActor,decidedAt,decisionSetUid,row.batch_uid);await client.query("COMMIT");return approvalReceipt;}
    if(rolePlans.length>0){
      const reservation=await reserveRoleExecution(client,rolePlans,String(command.operationUid),decisionSetUid,row.batch_uid,row.id,row.batch_id);const projection=projectRoleOperation(reservation);const materializationActor={userId:actor.userId,userUid:actor.userUid,name:liveActor.rows[0].name,authorizationVersion:actor.authorizationVersion};
      await insertOperation(client,command,actor,approvalReceipt,projection.expectedResults,projection.reservationSlots,reservation.operationReceiptId);await executeRoleMaterialization(client,rolePlans,reservation,materializationActor,decidedAt,decisionSetUid,row.batch_uid);await client.query("COMMIT");return approvalReceipt;
    }
    const receiptId = await reserve(client, "business_operation_receipts"); const plans: Array<{ id: string; table: string; entityType: string; entityKey: string; action: string; correlationUid: string; auditId: string; auditEventUid: string; after: JsonObject }> = [];
    if (command.decision === "approve") {
      plans.push({ id: row.id, table: "source_decision_sets", entityType: "source_decision_set", entityKey: `decision-set:${decisionSetUid}`, action: "approve", correlationUid: deterministicUuidV4(`${command.operationUid}\napprove\n${decisionSetUid}`), auditId: await reserve(client, "accounting_audit_events"), auditEventUid: randomUUID(), after: { decision_set_uid: decisionSetUid, status: "approved" } });
      plans.push({ id: row.batch_id, table: "accounting_import_batches", entityType: "import_batch", entityKey: `batch:${row.batch_uid}`, action: "apply", correlationUid: deterministicUuidV4(`${command.operationUid}\napply\n${row.batch_uid}`), auditId: await reserve(client, "accounting_audit_events"), auditEventUid: randomUUID(), after: { batch_uid: row.batch_uid, status: "applied" } });
      for (const period of periodPlans) plans.push({ id: await reserve(client,"accounting_periods"), table:"accounting_periods", entityType:"accounting_period", entityKey:`period:${period.periodCode}`, action:"create", correlationUid:deterministicUuidV4(`${command.operationUid}\nperiod\n${period.periodCode}`), auditId:await reserve(client,"accounting_audit_events"), auditEventUid:randomUUID(), after:{period_code:period.periodCode,starts_at:period.startsAt,ends_at:period.endsAt,status:"open"} });
    } else if (command.decision === "reject") {
      plans.push({ id: row.id, table: "source_decision_sets", entityType: "source_decision_set", entityKey: `decision-set:${decisionSetUid}`, action: "reject", correlationUid: deterministicUuidV4(`${command.operationUid}\nreject\n${decisionSetUid}`), auditId: await reserve(client, "accounting_audit_events"), auditEventUid: randomUUID(), after: { decision_set_uid: decisionSetUid, status: "rejected" } });
    } else if (command.decision === "repreview") {
      const replacementUid = String(command.replacementDecisionSetUid); const collision = await client.query("SELECT 1 FROM public.source_decision_sets WHERE decision_set_uid=$1::uuid", [replacementUid]); if (collision.rowCount !== 0) fail("source_decision_replacement_uid_collision");
      plans.push({ id: await reserve(client, "source_decision_sets"), table: "source_decision_sets", entityType: "source_decision_set", entityKey: `decision-set:${replacementUid}`, action: "preview", correlationUid: deterministicUuidV4(`${command.operationUid}\npreview\n${replacementUid}`), auditId: await reserve(client, "accounting_audit_events"), auditEventUid: randomUUID(), after: { decision_set_uid: replacementUid, status: "previewed" } });
      for (const item of itemResult.rows) plans.push({ id: await reserve(client, "source_decision_items"), table: "source_decision_items", entityType: "source_decision_item", entityKey: `decision-item:${replacementUid}:${item.ordinal}`, action: "create", correlationUid: deterministicUuidV4(`${command.operationUid}\nitem\n${item.ordinal}`), auditId: await reserve(client, "accounting_audit_events"), auditEventUid: randomUUID(), after: { decision_kind: item.decision_kind, ordinal: item.ordinal } });
    } else {
      const replacementUid = String(command.replacementDecisionSetUid); const collision = await client.query("SELECT 1 FROM public.source_decision_sets WHERE decision_set_uid=$1::uuid", [replacementUid]); if (collision.rowCount !== 0) fail("source_decision_replacement_uid_collision");
      const replacementSetId = await reserve(client, "source_decision_sets");
      plans.push({ id: row.id, table: "source_decision_sets", entityType: "source_decision_set", entityKey: `decision-set:${decisionSetUid}`, action: "supersede", correlationUid: deterministicUuidV4(`${command.operationUid}\nsupersede\n${decisionSetUid}`), auditId: await reserve(client, "accounting_audit_events"), auditEventUid: randomUUID(), after: { decision_set_uid: decisionSetUid, status: "superseded" } });
      plans.push({ id: replacementSetId, table: "source_decision_sets", entityType: "source_decision_set", entityKey: `decision-set:${replacementUid}`, action: "preview", correlationUid: deterministicUuidV4(`${command.operationUid}\npreview\n${replacementUid}`), auditId: await reserve(client, "accounting_audit_events"), auditEventUid: randomUUID(), after: { decision_set_uid: replacementUid, status: "previewed" } });
      for (const item of itemResult.rows) plans.push({ id: await reserve(client, "source_decision_items"), table: "source_decision_items", entityType: "source_decision_item", entityKey: `decision-item:${replacementUid}:${item.ordinal}`, action: "create", correlationUid: deterministicUuidV4(`${command.operationUid}\nitem\n${item.ordinal}`), auditId: await reserve(client, "accounting_audit_events"), auditEventUid: randomUUID(), after: { decision_kind: item.decision_kind, ordinal: item.ordinal } });
      plans.push({ id: replacementSetId, table: "source_decision_sets", entityType: "source_decision_set", entityKey: `decision-set:${replacementUid}`, action: "approve", correlationUid: deterministicUuidV4(`${command.operationUid}\napprove\n${replacementUid}`), auditId: await reserve(client, "accounting_audit_events"), auditEventUid: randomUUID(), after: { decision_set_uid: replacementUid, status: "approved" } });
    }
    const results = plans.map((plan, index) => ({ action_correlation_uid: plan.correlationUid, entity_action: plan.action, entity_key: plan.entityKey, entity_type: plan.entityType, ordinal: index + 1 }));
    const slots: JsonObject[] = [{ local_ordinal: 1, phase: 0, qualified_table_name: "public.business_operation_receipts", reserved_id: receiptId, result_ordinal: 0, slot_kind: "operation_receipt", slot_kind_order: 0 }];
    plans.forEach((plan, index) => { slots.push({ local_ordinal: 1, phase: 1, qualified_table_name: `public.${plan.table}`, reserved_id: plan.id, result_ordinal: index + 1, slot_kind: "business_row", slot_kind_order: 1 }); slots.push({ local_ordinal: 1, phase: 2, qualified_table_name: "public.accounting_audit_events", reserved_id: plan.auditId, result_ordinal: index + 1, slot_kind: "audit_row", slot_kind_order: 2 }); });
    await insertOperation(client, command, actor, approvalReceipt, results, slots, receiptId);
    if (command.decision === "approve") {
      const setPlan = plans[0]; const batchPlan = plans[1];
      await client.query(`UPDATE public.source_decision_sets SET status='approved',approval_actor_at=$1::timestamptz,approval_actor_authorization_version=$2,approval_actor_correlation_uid=$3::uuid,approval_actor_name_snapshot=$4,approval_actor_scope='admin',approval_actor_uid_snapshot=$5::uuid,approval_actor_user_id=$6 WHERE id=$7`, [decidedAt, actor.authorizationVersion, setPlan.correlationUid, liveActor.rows[0].name, actor.userUid, actor.userId, row.id]);
      await client.query(`UPDATE public.accounting_import_batches SET status='applied',applied_at=$1::timestamptz,apply_actor_at=$1::timestamptz,apply_actor_authorization_version=$2,apply_actor_correlation_uid=$3::uuid,apply_actor_name_snapshot=$4,apply_actor_scope='admin',apply_actor_uid_snapshot=$5::uuid,apply_actor_user_id=$6 WHERE id=$7`, [decidedAt, actor.authorizationVersion, batchPlan.correlationUid, liveActor.rows[0].name, actor.userUid, actor.userId, row.batch_id]);
      for(let index=0;index<periodPlans.length;index+=1){const period=periodPlans[index];const plan=plans[index+2];await client.query(`INSERT INTO public.accounting_periods (id,boundary_evidence_row_version_id,boundary_source_row_version_id,decision_item_id,ends_at,period_code,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,starts_at,status) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7::timestamptz,$8,$9::uuid,$10,'admin',$11::uuid,$12,$13::timestamptz,'open')`,[plan.id,period.evidenceRowVersionId,period.boundaryRowVersionId,period.itemId,period.endsAt,period.periodCode,decidedAt,actor.authorizationVersion,plan.correlationUid,liveActor.rows[0].name,actor.userUid,actor.userId,period.startsAt]);}
    } else if (command.decision === "reject") {
      const plan = plans[0]; await client.query(`UPDATE public.source_decision_sets SET status='rejected',rejection_actor_at=$1::timestamptz,rejection_actor_authorization_version=$2,rejection_actor_correlation_uid=$3::uuid,rejection_actor_name_snapshot=$4,rejection_actor_scope='admin',rejection_actor_uid_snapshot=$5::uuid,rejection_actor_user_id=$6 WHERE id=$7`, [decidedAt, actor.authorizationVersion, plan.correlationUid, liveActor.rows[0].name, actor.userUid, actor.userId, row.id]);
    } else if (command.decision === "repreview") {
      const setPlan = plans[0]; const replacementUid = String(command.replacementDecisionSetUid);
      await client.query(`INSERT INTO public.source_decision_sets (id,batch_id,decision_set_uid,manifest,manifest_sha256,preview_actor_at,preview_actor_authorization_version,preview_actor_correlation_uid,preview_actor_name_snapshot,preview_actor_scope,preview_actor_uid_snapshot,preview_actor_user_id,status) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3::uuid,$4::jsonb,$5,$6::timestamptz,$7,$8::uuid,$9,'admin',$10::uuid,$11,'previewed')`, [setPlan.id, row.batch_id, replacementUid, canonicalJson(command.replacementManifest as CanonicalValue), command.replacementManifestSha256, decidedAt, actor.authorizationVersion, setPlan.correlationUid, liveActor.rows[0].name, actor.userUid, actor.userId]);
      const replacements = command.replacementItems as Array<{ decisionPayload: CanonicalValue; decisionPayloadSha256: string; ordinal: number }>;
      for (let index = 0; index < itemResult.rows.length; index += 1) { const original = itemResult.rows[index]; const replacement = replacements[index]; const plan = plans[index + 1]; await client.query(`INSERT INTO public.source_decision_items (id,coordinate_id,decision_kind,decision_payload,decision_payload_sha256,decision_set_id,ordinal,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,source_row_version_id) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8::timestamptz,$9,$10::uuid,$11,'admin',$12::uuid,$13,$14)`, [plan.id, original.coordinate_id, original.decision_kind, canonicalJson(replacement.decisionPayload), replacement.decisionPayloadSha256, setPlan.id, original.ordinal, decidedAt, actor.authorizationVersion, plan.correlationUid, liveActor.rows[0].name, actor.userUid, actor.userId, original.source_row_version_id]); }
    } else {
      const oldPlan = plans[0]; const replacementSetPlan = plans[1]; const replacementUid = String(command.replacementDecisionSetUid); const approvalPlan = plans[plans.length - 1];
      await client.query(`UPDATE public.source_decision_sets SET status='superseded',supersede_actor_at=$1::timestamptz,supersede_actor_authorization_version=$2,supersede_actor_correlation_uid=$3::uuid,supersede_actor_name_snapshot=$4,supersede_actor_scope='admin',supersede_actor_uid_snapshot=$5::uuid,supersede_actor_user_id=$6 WHERE id=$7`, [decidedAt, actor.authorizationVersion, oldPlan.correlationUid, liveActor.rows[0].name, actor.userUid, actor.userId, row.id]);
      await client.query(`INSERT INTO public.source_decision_sets (id,batch_id,decision_set_uid,manifest,manifest_sha256,preview_actor_at,preview_actor_authorization_version,preview_actor_correlation_uid,preview_actor_name_snapshot,preview_actor_scope,preview_actor_uid_snapshot,preview_actor_user_id,status) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3::uuid,$4::jsonb,$5,$6::timestamptz,$7,$8::uuid,$9,'admin',$10::uuid,$11,'previewed')`, [replacementSetPlan.id, row.batch_id, replacementUid, canonicalJson(command.replacementManifest as CanonicalValue), command.replacementManifestSha256, decidedAt, actor.authorizationVersion, replacementSetPlan.correlationUid, liveActor.rows[0].name, actor.userUid, actor.userId]);
      const replacements = command.replacementItems as Array<{ decisionPayload: CanonicalValue; decisionPayloadSha256: string; ordinal: number }>;
      for (let index = 0; index < itemResult.rows.length; index += 1) { const original = itemResult.rows[index]; const replacement = replacements[index]; const plan = plans[index + 2]; await client.query(`INSERT INTO public.source_decision_items (id,coordinate_id,decision_kind,decision_payload,decision_payload_sha256,decision_set_id,ordinal,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,source_row_version_id) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8::timestamptz,$9,$10::uuid,$11,'admin',$12::uuid,$13,$14)`, [plan.id, original.coordinate_id, original.decision_kind, canonicalJson(replacement.decisionPayload), replacement.decisionPayloadSha256, replacementSetPlan.id, original.ordinal, decidedAt, actor.authorizationVersion, plan.correlationUid, liveActor.rows[0].name, actor.userUid, actor.userId, original.source_row_version_id]); }
      await client.query(`UPDATE public.source_decision_sets SET status='approved',approval_actor_at=$1::timestamptz,approval_actor_authorization_version=$2,approval_actor_correlation_uid=$3::uuid,approval_actor_name_snapshot=$4,approval_actor_scope='admin',approval_actor_uid_snapshot=$5::uuid,approval_actor_user_id=$6 WHERE id=$7`, [decidedAt, actor.authorizationVersion, approvalPlan.correlationUid, liveActor.rows[0].name, actor.userUid, actor.userId, replacementSetPlan.id]);
    }
    for (const plan of plans) await client.query(`INSERT INTO public.accounting_audit_events (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,NULL,$6::jsonb,$7::timestamptz,$7::timestamptz,$8,$9,$10::uuid,$11,'admin',$7::timestamptz,$12::uuid,$13)`, [plan.auditId, plan.auditEventUid, plan.entityType, plan.entityKey, plan.action, canonicalJson(plan.after), decidedAt, `audit/${plan.entityType}/${plan.action}`, actor.userId, actor.userUid, liveActor.rows[0].name, plan.correlationUid, actor.authorizationVersion]);
    await client.query("COMMIT"); return approvalReceipt;
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}
