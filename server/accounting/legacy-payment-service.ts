import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { assertLegacyCutoverTransition, buildLegacyCutoverComparison, type FrozenLegacyCutoverRow, type LegacyCutoverPhase, type NewLegacyCutoverRow } from "./legacy-cutover-contract";
import { discoverLegacyMaterializationRows, type ResolvedLegacyMaterializationRow } from "./legacy-payment-discovery";
import { buildLegacyPaymentPreviewIdentity, readLockedLegacyPayments } from "./legacy-payment-preview";
import { executeLegacyMaterialization, reserveLegacyMaterialization } from "./legacy-payment-write";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import type { SourceDecisionActor } from "./source-decision-service";

type Json = Record<string, CanonicalValue>;
type LegacyAction = "register_release" | "preview" | "initialize" | "fence" | "cutover";
export type LegacyReadTransitionAction = "read_rollback" | "recutover";
type LegacyOperationAction = LegacyAction | LegacyReadTransitionAction;

export type LegacyPaymentCommand = {
  schemaVersion: "legacy-payment-command-v1";
  action: LegacyAction;
  operationUid: string;
  planSha256: string;
  expectedPhase: LegacyCutoverPhase | null;
  expectedWatermarkPaymentId: number | null;
  expectedComparisonDigest: string | null;
};

export type LegacyPaymentReceipt = {
  schema_version: "dgkma-legacy-payment-operation-v1";
  action: LegacyOperationAction;
  operation_uid: string;
  plan_sha256: string;
  committed_outcome: "created";
  phase: LegacyCutoverPhase | null;
  watermark_payment_id: number | null;
  comparison_digest: string | null;
  source_release_uid: string;
  batch_uid: string;
  source_fingerprint: string;
  actor_user_id: number;
  actor_user_uid: string;
  authorization_version: string;
  target_fingerprint: string;
  recorded_at: string;
  command_sha256: string;
  receipt_sha256: string;
};

export type LegacyPaymentReadTransitionCommand = {
  schemaVersion: "legacy-payment-read-transition-command-v1";
  action: LegacyReadTransitionAction;
  operationUid: string;
  expectedPhase: "new" | "read_rollback";
  expectedWatermarkPaymentId: number;
  expectedComparisonDigest: string;
};

export type LegacyPaymentExecution = {
  execution_outcome: "created" | "verified_noop";
  receipt: LegacyPaymentReceipt;
};

export type LegacyPaymentExecutionScope =
  | { kind: "development" }
  | { kind: "disposable-test"; runUid: string; parentTargetFingerprint: string };

const PLAN_PATH = "docs/source-contracts/releases/legacy-payments-development-plan-v3.json";
const DESCRIPTOR_PATH = "docs/source-contracts/releases/legacy-payments-v3.json";
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const COMMAND_KEYS = ["action", "expectedComparisonDigest", "expectedPhase", "expectedWatermarkPaymentId", "operationUid", "planSha256", "schemaVersion"];

function fail(code: string): never { throw new Error(code); }
function readJson(path: string): Json { return JSON.parse(readFileSync(path, "utf8")) as Json; }
function withoutHash<T extends Record<string, unknown>>(value: T, key: keyof T): Record<string, unknown> { const copy = { ...value }; delete copy[key]; return copy; }
function operation(action: LegacyAction, plan: Json): Json {
  if (action === "register_release") return plan.release as Json;
  if (action === "preview") return plan.batch as Json;
  const cutover = plan.cutover as Json;
  return cutover[action === "initialize" ? "legacy" : action === "fence" ? "fenced" : "new"] as Json;
}
function expectedPhase(action: LegacyAction): LegacyCutoverPhase | null {
  if (action === "initialize") return null;
  if (action === "fence") return "legacy";
  if (action === "cutover") return "fenced";
  return null;
}

export function loadLegacyPaymentPlan(): { plan: Json; descriptor: Json } {
  const plan = readJson(PLAN_PATH);
  if (plan.schema_version !== "legacy-payments-development-plan-v3" || plan.plan_sha256 !== sha256(canonicalJson(withoutHash(plan, "plan_sha256") as CanonicalValue))) fail("legacy_payment_plan_binding_mismatch");
  const descriptorBytes = readFileSync(DESCRIPTOR_PATH);
  const descriptor = JSON.parse(descriptorBytes.toString("utf8")) as Json;
  if (plan.descriptor_sha256 !== sha256(descriptorBytes) || descriptor.source_code !== "LEGACY_PAYMENTS" || descriptor.adapter_version !== "3.0.0") fail("legacy_payment_descriptor_binding_mismatch");
  return { plan, descriptor };
}

export function validateLegacyPaymentCommand(command: Record<string, unknown>, plan: Json): LegacyPaymentCommand {
  if (JSON.stringify(Object.keys(command).sort()) !== JSON.stringify(COMMAND_KEYS)) fail("legacy_payment_command_keys_mismatch");
  if (command.schemaVersion !== "legacy-payment-command-v1" || !["register_release", "preview", "initialize", "fence", "cutover"].includes(String(command.action))) fail("legacy_payment_command_action_invalid");
  const action = command.action as LegacyAction;
  const expectedOperation = operation(action, plan);
  if (!UUID_V4.test(String(command.operationUid)) || command.operationUid !== expectedOperation.operation_uid) fail("legacy_payment_command_operation_mismatch");
  if (!SHA256.test(String(command.planSha256)) || command.planSha256 !== plan.plan_sha256) fail("legacy_payment_command_plan_mismatch");
  if (command.expectedPhase !== expectedPhase(action)) fail("legacy_payment_command_phase_mismatch");
  const comparison = buildLegacyCutoverComparison(0, [], []).comparisonDigest;
  if (action === "fence" || action === "cutover") {
    if (command.expectedWatermarkPaymentId !== 0 || command.expectedComparisonDigest !== comparison) fail("legacy_payment_command_comparison_mismatch");
  } else if (command.expectedWatermarkPaymentId !== null || command.expectedComparisonDigest !== null) fail("legacy_payment_command_comparison_forbidden");
  return command as LegacyPaymentCommand;
}

export function buildLegacyPaymentCommand(action: LegacyAction): LegacyPaymentCommand {
  const { plan } = loadLegacyPaymentPlan(); const selected = operation(action, plan); const comparison = buildLegacyCutoverComparison(0, [], []).comparisonDigest;
  return {
    schemaVersion: "legacy-payment-command-v1", action, operationUid: String(selected.operation_uid), planSha256: String(plan.plan_sha256), expectedPhase: expectedPhase(action),
    expectedWatermarkPaymentId: action === "fence" || action === "cutover" ? 0 : null,
    expectedComparisonDigest: action === "fence" || action === "cutover" ? comparison : null,
  };
}

export function validateLegacyPaymentReadTransitionCommand(command: Record<string, unknown>): LegacyPaymentReadTransitionCommand {
  const keys = ["action", "expectedComparisonDigest", "expectedPhase", "expectedWatermarkPaymentId", "operationUid", "schemaVersion"];
  if (JSON.stringify(Object.keys(command).sort()) !== JSON.stringify(keys)) fail("legacy_payment_read_transition_keys_mismatch");
  if (command.schemaVersion !== "legacy-payment-read-transition-command-v1" || !["read_rollback", "recutover"].includes(String(command.action))) fail("legacy_payment_read_transition_action_invalid");
  if (!UUID_V4.test(String(command.operationUid))) fail("legacy_payment_read_transition_operation_invalid");
  const action = command.action as LegacyReadTransitionAction;
  const expected = action === "read_rollback" ? "new" : "read_rollback";
  if (command.expectedPhase !== expected) fail("legacy_payment_read_transition_phase_mismatch");
  if (!Number.isSafeInteger(command.expectedWatermarkPaymentId) || Number(command.expectedWatermarkPaymentId) < 0) fail("legacy_payment_read_transition_watermark_invalid");
  if (!SHA256.test(String(command.expectedComparisonDigest))) fail("legacy_payment_read_transition_digest_invalid");
  return command as LegacyPaymentReadTransitionCommand;
}

export function buildLegacyPaymentReadTransitionCommand(
  action: LegacyReadTransitionAction,
  operationUid: string,
  expectedWatermarkPaymentId: number,
  expectedComparisonDigest: string,
): LegacyPaymentReadTransitionCommand {
  return validateLegacyPaymentReadTransitionCommand({
    schemaVersion: "legacy-payment-read-transition-command-v1",
    action,
    operationUid,
    expectedPhase: action === "read_rollback" ? "new" : "read_rollback",
    expectedWatermarkPaymentId,
    expectedComparisonDigest,
  });
}

async function reserve(client: PoolClient, table: string): Promise<string> {
  return (await client.query<{ id: string }>("SELECT nextval(pg_get_serial_sequence($1,'id'))::text AS id", [`public.${table}`])).rows[0].id;
}
function actorValues(actor: SourceDecisionActor, at: string, correlationUid: string, scope: "admin" | "migration_admin") { return [at, actor.authorizationVersion, correlationUid, actor.name, scope, actor.userUid, actor.userId] as const; }
function hashedReceipt(input: Omit<LegacyPaymentReceipt, "receipt_sha256">): LegacyPaymentReceipt { return { ...input, receipt_sha256: sha256(canonicalJson(input as unknown as CanonicalValue)) }; }
function strictReceipt(value: unknown): LegacyPaymentReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("legacy_payment_stored_receipt_invalid");
  const receipt = value as LegacyPaymentReceipt;
  if (receipt.schema_version !== "dgkma-legacy-payment-operation-v1" || receipt.receipt_sha256 !== sha256(canonicalJson(withoutHash(receipt, "receipt_sha256") as CanonicalValue))) fail("legacy_payment_stored_receipt_invalid");
  return receipt;
}

async function replay(client: PoolClient, command: LegacyPaymentCommand | LegacyPaymentReadTransitionCommand, actor: SourceDecisionActor): Promise<LegacyPaymentReceipt | undefined> {
  const found = await client.query<{ canonical_payload: Json; target_fingerprint: string }>("SELECT canonical_payload,target_fingerprint FROM public.business_operation_receipts WHERE operation_uid=$1::uuid FOR UPDATE", [command.operationUid]);
  if (found.rowCount === 0) return undefined;
  if (found.rowCount !== 1 || found.rows[0].canonical_payload?.inputs === undefined) fail("legacy_payment_operation_uid_reuse");
  const inputs = found.rows[0].canonical_payload.inputs as Json; const receipt = strictReceipt(inputs.operation_receipt);
  if (inputs.command_sha256 !== sha256(canonicalJson(command as unknown as CanonicalValue)) || receipt.target_fingerprint !== found.rows[0].target_fingerprint || receipt.target_fingerprint !== actor.targetFingerprint || receipt.actor_user_id !== actor.userId || receipt.actor_user_uid !== actor.userUid || receipt.authorization_version !== actor.authorizationVersion) fail("legacy_payment_operation_uid_reuse");
  return receipt;
}

async function insertOperation(client: PoolClient, input: { command: LegacyPaymentCommand | LegacyPaymentReadTransitionCommand; actor: SourceDecisionActor; receipt: LegacyPaymentReceipt; rootCorrelationUid: string; results: Json[]; slots: Json[]; receiptId: string }): Promise<void> {
  const payload = { command: `legacy_payment:${input.command.action}`, expected_results: input.results, inputs: { command_sha256: input.receipt.command_sha256, operation_receipt: input.receipt as unknown as CanonicalValue }, reservation_slots: input.slots, schema_version: "business-operation-payload-v2" };
  await client.query(`INSERT INTO public.business_operation_receipts (id,action,actor_name_snapshot,actor_scope,actor_target_user_id,actor_target_user_id_snapshot,actor_uid_snapshot,actor_user_id,actor_user_id_snapshot,authorization_version,canonical_payload,entity_type,operation_uid,payload_sha256,recorded_at,result_entity_keys,root_correlation_uid,target_fingerprint) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,'migration_admin',NULL,NULL,$4::uuid,$5,$5,$6,$7::jsonb,'legacy_payment',$8::uuid,$9,$10::timestamptz,$11::jsonb,$12::uuid,$13)`, [input.receiptId, input.command.action, input.actor.name, input.actor.userUid, input.actor.userId, input.actor.authorizationVersion, canonicalJson(payload as unknown as CanonicalValue), input.command.operationUid, sha256(canonicalJson(payload as unknown as CanonicalValue)), input.receipt.recorded_at, canonicalJson(input.results as unknown as CanonicalValue), input.rootCorrelationUid, input.actor.targetFingerprint]);
  for (const result of input.results) await client.query("INSERT INTO public.business_operation_entities (operation_uid,ordinal,entity_type,entity_key,entity_action,action_correlation_uid) VALUES ($1::uuid,$2,$3,$4,$5,$6::uuid)", [input.command.operationUid, result.ordinal, result.entity_type, result.entity_key, result.entity_action, result.action_correlation_uid]);
}

async function audit(client: PoolClient, id: string, eventUid: string, result: Json, actor: SourceDecisionActor, at: string, before: CanonicalValue | null, after: CanonicalValue, reason: string): Promise<void> {
  await client.query(`INSERT INTO public.accounting_audit_events (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,$6::jsonb,$7::jsonb,$8::timestamptz,$8::timestamptz,$9,$10,$11::uuid,$12,'migration_admin',$8::timestamptz,$13::uuid,$14)`, [id, eventUid, result.entity_type, result.entity_key, result.entity_action, before === null ? null : canonicalJson(before), canonicalJson(after), at, reason, actor.userId, actor.userUid, actor.name, result.action_correlation_uid, actor.authorizationVersion]);
}

function cutoverProjection(rows: ResolvedLegacyMaterializationRow[]): { frozenRows: FrozenLegacyCutoverRow[]; newRows: NewLegacyCutoverRow[] } {
  return {
    frozenRows: rows.map((row) => ({ paymentId: row.row.paymentId, memberUidOrNull: row.projection.memberUidOrNull, duesYearOrNull: row.row.year, sourceAmountSignedOrNull: row.row.amountParse.sourceAmountSignedOrNull, sourceStatus: row.row.status, sourceContentDigest: row.row.sourceContentDigest, decision: row.projection.decision, reasonCode: row.projection.reasonCode })),
    newRows: rows.filter((row) => row.projection.decision === "cross_link" || row.projection.decision === "new_compatibility_event").map((row) => ({ paymentId: row.row.paymentId, decision: row.projection.decision as "cross_link" | "new_compatibility_event", currentEventUid: row.projection.candidateEventUidOrNull ?? row.projection.createdEventUidOrNull!, memberUid: row.projection.memberUidOrNull!, duesYear: row.row.year!, netApprovedAllocationAmount: row.row.amountParse.sourceAmountSignedOrNull!, sourceContentDigest: row.row.sourceContentDigest })),
  };
}

async function persistedCutoverProjection(client: PoolClient, batchId: string, previewRows: Awaited<ReturnType<typeof readLockedLegacyPayments>>): Promise<{ frozenRows: FrozenLegacyCutoverRow[]; newRows: NewLegacyCutoverRow[] }> {
  const decisions = await client.query<{ payment_id: number; decision: FrozenLegacyCutoverRow["decision"]; reason_code: FrozenLegacyCutoverRow["reasonCode"]; member_uid: string | null; event_uid: string | null; allocated: string }>(`
    SELECT d.legacy_payment_id payment_id,d.decision,d.reason_code,m.member_uid::text,
      COALESCE(candidate.event_uid,created.event_uid)::text event_uid,
      COALESCE((SELECT sum(a.amount)::text FROM public.dues_allocations a WHERE a.legacy_decision_id=d.id AND a.status='approved'),'0') allocated
    FROM public.legacy_payment_decisions d
    LEFT JOIN public.association_members m ON m.id=d.member_id
    LEFT JOIN public.economic_events candidate ON candidate.id=d.candidate_event_id
    LEFT JOIN public.economic_events created ON created.id=d.created_event_id
    WHERE d.preview_batch_id=$1 AND NOT EXISTS (SELECT 1 FROM public.legacy_payment_decisions child WHERE child.supersedes_id=d.id)
    ORDER BY d.legacy_payment_id FOR UPDATE OF d
  `, [batchId]);
  if (decisions.rowCount !== previewRows.length) fail("legacy_payment_terminal_decision_coverage_mismatch");
  const frozenRows: FrozenLegacyCutoverRow[] = []; const newRows: NewLegacyCutoverRow[] = [];
  for (let index=0; index<previewRows.length; index+=1) {
    const preview=previewRows[index], decision=decisions.rows[index]; if(decision.payment_id!==preview.paymentId)fail("legacy_payment_terminal_decision_order_mismatch");
    frozenRows.push({paymentId:preview.paymentId,memberUidOrNull:decision.member_uid,duesYearOrNull:preview.frozenRow.year,sourceAmountSignedOrNull:preview.frozenRow.amountParse.sourceAmountSignedOrNull,sourceStatus:preview.frozenRow.status,sourceContentDigest:preview.frozenRow.sourceContentDigest,decision:decision.decision,reasonCode:decision.reason_code});
    if(decision.decision==="cross_link"||decision.decision==="new_compatibility_event"){
      if(!decision.event_uid||!decision.member_uid)fail("legacy_payment_terminal_event_binding_missing");
      const amount=decision.decision==="new_compatibility_event"?decision.allocated:preview.frozenRow.amountParse.sourceAmountSignedOrNull!;
      newRows.push({paymentId:preview.paymentId,decision:decision.decision,currentEventUid:decision.event_uid,memberUid:decision.member_uid,duesYear:preview.frozenRow.year!,netApprovedAllocationAmount:amount,sourceContentDigest:preview.frozenRow.sourceContentDigest});
    }
  }
  return {frozenRows,newRows};
}

export async function executeLegacyPaymentCommand(pool: Pick<Pool, "connect">, rawCommand: Record<string, unknown>, actor: SourceDecisionActor, scope: LegacyPaymentExecutionScope = { kind: "development" }): Promise<LegacyPaymentExecution> {
  const { plan, descriptor } = loadLegacyPaymentPlan(); const command = validateLegacyPaymentCommand(rawCommand, plan);
  if (scope.kind === "development") {
    if (actor.targetFingerprint !== plan.target_fingerprint || actor.userId !== plan.actor_user_id || actor.userUid !== plan.actor_user_uid || actor.authorizationVersion !== plan.actor_authorization_version) fail("legacy_payment_actor_binding_mismatch");
  } else if (!UUID_V4.test(scope.runUid) || scope.parentTargetFingerprint !== plan.target_fingerprint || actor.targetFingerprint === scope.parentTargetFingerprint || !SHA256.test(actor.targetFingerprint)) {
    fail("legacy_payment_disposable_scope_mismatch");
  }
  const selected = operation(command.action, plan); const release = plan.release as Json; const batch = plan.batch as Json; const cutover = plan.cutover as Json;
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    // SERIALIZABLE fixes its snapshot on the first ordinary query. Fence/cutover must
    // therefore wait for every earlier payments writer before reading the actor or
    // any source state, otherwise a writer that commits during the lock wait can be
    // invisible to the frozen watermark.
    if (command.action === "fence" || command.action === "cutover") {
      await client.query("LOCK TABLE public.payments IN ACCESS EXCLUSIVE MODE");
    }
    const live = await client.query<{ id: number; user_uid: string; is_admin: boolean; name: string }>("SELECT id,user_uid::text,is_admin,name FROM public.users WHERE id=$1 FOR UPDATE", [actor.userId]);
    if (live.rowCount !== 1 || !live.rows[0].is_admin || live.rows[0].user_uid !== actor.userUid || live.rows[0].name !== actor.name) fail("legacy_payment_admin_required");
    const existing = await replay(client, command, actor); if (existing) { await client.query("COMMIT"); return { execution_outcome: "verified_noop", receipt: existing }; }
    const ledger = await client.query<{ count: number }>("SELECT count(*)::int count FROM public.schema_change_ledger WHERE sequence_no=100 AND manifest_sha256=$1", ["551d9d672a0cd3689b6c3ac5d1252078f4e53106a7ef143ac954c96239596c14"]); if (ledger.rows[0]?.count !== 1) fail("legacy_payment_sequence_100_missing");
    const source = await client.query<{ id: string; source_uid: string }>("SELECT id::text,source_uid::text FROM public.accounting_logical_sources WHERE source_code='LEGACY_PAYMENTS' FOR UPDATE"); if (source.rowCount !== 1) fail("legacy_payment_source_missing");
    const commandSha = sha256(canonicalJson(command as unknown as CanonicalValue)); const at = new Date().toISOString();
    let phase: LegacyCutoverPhase | null = null; let watermark: number | null = null; let comparisonDigest: string | null = null; const results: Json[] = []; const slots: Json[] = [];
    const receiptId = await reserve(client, "business_operation_receipts"); slots.push({ local_ordinal: 1, phase: 0, qualified_table_name: "public.business_operation_receipts", reserved_id: receiptId, result_ordinal: 0, slot_kind: "operation_receipt", slot_kind_order: 0 });

    if (command.action === "register_release") {
      const versions = await client.query<{ v1: number; v2: number; v3: number }>("SELECT count(*) FILTER (WHERE adapter_version='1.0.0')::int v1,count(*) FILTER (WHERE adapter_version='2.0.0')::int v2,count(*) FILTER (WHERE adapter_version='3.0.0')::int v3 FROM public.accounting_source_releases WHERE logical_source_id=$1 AND status='active'", [source.rows[0].id]);
      if (versions.rows[0].v1 !== 1 || versions.rows[0].v2 !== 1 || versions.rows[0].v3 !== 0) fail("legacy_payment_release_baseline_mismatch");
      const releaseId = await reserve(client, "accounting_source_releases"); const auditId = await reserve(client, "accounting_audit_events"); const result = { ordinal: 1, entity_type: "source_release", entity_key: `release:${release.release_uid}`, entity_action: "create", action_correlation_uid: selected.action_correlation_uid } as Json; results.push(result); slots.push({ local_ordinal: 1, phase: 10, qualified_table_name: "public.accounting_source_releases", reserved_id: releaseId, result_ordinal: 1, slot_kind: "business_row", slot_kind_order: 10 }, { local_ordinal: 1, phase: 30, qualified_table_name: "public.accounting_audit_events", reserved_id: auditId, result_ordinal: 1, slot_kind: "audit_row", slot_kind_order: 30 });
      const receipt = hashedReceipt({ schema_version: "dgkma-legacy-payment-operation-v1", action: command.action, operation_uid: command.operationUid, plan_sha256: String(plan.plan_sha256), committed_outcome: "created", phase, watermark_payment_id: watermark, comparison_digest: comparisonDigest, source_release_uid: String(release.release_uid), batch_uid: String(batch.batch_uid), source_fingerprint: String(batch.source_fingerprint), actor_user_id: actor.userId, actor_user_uid: actor.userUid, authorization_version: actor.authorizationVersion, target_fingerprint: actor.targetFingerprint, recorded_at: at, command_sha256: commandSha });
      await insertOperation(client, { command, actor, receipt, rootCorrelationUid: String(selected.root_correlation_uid), results, slots, receiptId });
      await client.query(`INSERT INTO public.accounting_source_releases (id,release_uid,logical_source_id,adapter_code,adapter_version,normalized_schema_sha256,normalization_implementation_sha256,mapping_table_sha256,mapping_approval_receipt_sha256,released_at,status,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,'active',$11,$12::uuid,$13,'migration_admin',$10::timestamptz,$14::uuid,$15)`, [releaseId, release.release_uid, source.rows[0].id, descriptor.adapter_code, descriptor.adapter_version, descriptor.normalized_schema_sha256, descriptor.normalization_implementation_sha256, descriptor.mapping_table_sha256, descriptor.mapping_approval_receipt_sha256, at, actor.userId, actor.userUid, actor.name, selected.action_correlation_uid, actor.authorizationVersion]);
      await audit(client, auditId, String(selected.audit_event_uid), result, actor, at, null, { descriptor_sha256: plan.descriptor_sha256, source_code: "LEGACY_PAYMENTS" }, "TODO19_LEGACY_SOURCE_RELEASE_V3"); await client.query("COMMIT"); return { execution_outcome: "created", receipt };
    }

    const releaseRow = await client.query<{ id: string }>("SELECT id::text FROM public.accounting_source_releases WHERE release_uid=$1::uuid AND logical_source_id=$2 AND adapter_version='3.0.0' AND status='active' FOR UPDATE", [release.release_uid, source.rows[0].id]); if (releaseRow.rowCount !== 1) fail("legacy_payment_release_v3_missing");
    if (command.action === "preview") {
      await client.query("LOCK TABLE public.payments IN SHARE MODE");
      const previewRows = await readLockedLegacyPayments(client);
      if (scope.kind === "development" && previewRows.length !== 0) fail("legacy_payment_development_plan_row_count_drift");
      const identity = previewRows.length === 0
        ? { sourceFingerprint: String(batch.source_fingerprint), previewManifest: [] as CanonicalValue[], previewManifestSha256: String(batch.preview_manifest_sha256) }
        : buildLegacyPaymentPreviewIdentity({ sourceUid: source.rows[0].source_uid, releaseUid: String(release.release_uid), sourceRevision: `disposable:${scope.kind === "disposable-test" ? scope.runUid : "forbidden"};rows:${previewRows.length}`, coverageFrom: String(batch.coverage_from), coverageThrough: String(batch.coverage_through), rows: previewRows });
      const batchId = await reserve(client, "accounting_import_batches"); const result = { ordinal: 1, entity_type: "import_batch", entity_key: `batch:${batch.batch_uid}`, entity_action: "preview", action_correlation_uid: selected.action_correlation_uid } as Json; results.push(result); slots.push({ local_ordinal: 1, phase: 10, qualified_table_name: "public.accounting_import_batches", reserved_id: batchId, result_ordinal: 1, slot_kind: "business_row", slot_kind_order: 10 });
      const previewPlans: Array<{ coordinateId: string; rowVersionId: string; batchRowId: string; coordinateCorrelation: string; rowCorrelation: string; linkCorrelation: string; coordinateAuditId: string; rowAuditId: string; linkAuditId: string }> = [];
      for (let index = 0; index < previewRows.length; index += 1) {
        const row = previewRows[index]; const coordinateCorrelation = randomUUID(); const rowCorrelation = randomUUID(); const linkCorrelation = randomUUID();
        const coordinateId = await reserve(client, "accounting_import_coordinates"); const rowVersionId = await reserve(client, "accounting_import_row_versions"); const batchRowId = await reserve(client, "accounting_import_batch_rows");
        const coordinateOrdinal = results.length + 1; results.push({ ordinal: coordinateOrdinal, entity_type: "source_coordinate", entity_key: `coordinate:LEGACY_PAYMENTS:${row.sourceRow.coordinate_key}`, entity_action: "create", action_correlation_uid: coordinateCorrelation } as Json);
        const rowOrdinal = results.length + 1; results.push({ ordinal: rowOrdinal, entity_type: "source_row", entity_key: `source-row:LEGACY_PAYMENTS:${row.sourceRow.coordinate_key}:${row.frozenRow.sourceContentDigest}`, entity_action: "create", action_correlation_uid: rowCorrelation } as Json);
        const linkOrdinal = results.length + 1; results.push({ ordinal: linkOrdinal, entity_type: "source_batch_row", entity_key: `batch-row:${batch.batch_uid}:${index + 1}`, entity_action: "create", action_correlation_uid: linkCorrelation } as Json);
        slots.push(
          { local_ordinal: index + 1, phase: 10, qualified_table_name: "public.accounting_import_coordinates", reserved_id: coordinateId, result_ordinal: coordinateOrdinal, slot_kind: "business_row", slot_kind_order: 10 },
          { local_ordinal: index + 1, phase: 10, qualified_table_name: "public.accounting_import_row_versions", reserved_id: rowVersionId, result_ordinal: rowOrdinal, slot_kind: "business_row", slot_kind_order: 10 },
          { local_ordinal: index + 1, phase: 10, qualified_table_name: "public.accounting_import_batch_rows", reserved_id: batchRowId, result_ordinal: linkOrdinal, slot_kind: "business_row", slot_kind_order: 10 },
        );
        previewPlans.push({ coordinateId, rowVersionId, batchRowId, coordinateCorrelation, rowCorrelation, linkCorrelation, coordinateAuditId: "", rowAuditId: "", linkAuditId: "" });
      }
      const auditIds: string[] = [];
      for (const resultRow of results) { const auditId = await reserve(client, "accounting_audit_events"); auditIds.push(auditId); slots.push({ local_ordinal: resultRow.ordinal, phase: 30, qualified_table_name: "public.accounting_audit_events", reserved_id: auditId, result_ordinal: resultRow.ordinal, slot_kind: "audit_row", slot_kind_order: 30 }); }
      const receipt = hashedReceipt({ schema_version: "dgkma-legacy-payment-operation-v1", action: command.action, operation_uid: command.operationUid, plan_sha256: String(plan.plan_sha256), committed_outcome: "created", phase, watermark_payment_id: watermark, comparison_digest: comparisonDigest, source_release_uid: String(release.release_uid), batch_uid: String(batch.batch_uid), source_fingerprint: identity.sourceFingerprint, actor_user_id: actor.userId, actor_user_uid: actor.userUid, authorization_version: actor.authorizationVersion, target_fingerprint: actor.targetFingerprint, recorded_at: at, command_sha256: commandSha });
      await insertOperation(client, { command, actor, receipt, rootCorrelationUid: String(selected.root_correlation_uid), results, slots, receiptId });
      await client.query(`INSERT INTO public.accounting_import_batches (id,batch_uid,source_release_id,source_fingerprint,captured_timezone,coverage_from,coverage_through,source_revision,preview_manifest,preview_manifest_sha256,status,previewed_at,preview_actor_at,preview_actor_authorization_version,preview_actor_correlation_uid,preview_actor_name_snapshot,preview_actor_scope,preview_actor_uid_snapshot,preview_actor_user_id,row_count,warning_count,error_count) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,'Asia/Seoul',$5::timestamptz,$6::timestamptz,$7,$8::jsonb,$9,'previewed',$10::timestamptz,$10::timestamptz,$11,$12::uuid,$13,'admin',$14::uuid,$15,$16,0,0)`, [batchId, batch.batch_uid, releaseRow.rows[0].id, identity.sourceFingerprint, batch.coverage_from, batch.coverage_through, previewRows.length === 0 ? plan.source_revision : `disposable:${scope.kind === "disposable-test" ? scope.runUid : "forbidden"};rows:${previewRows.length}`, canonicalJson(identity.previewManifest as CanonicalValue), identity.previewManifestSha256, at, actor.authorizationVersion, selected.action_correlation_uid, actor.name, actor.userUid, actor.userId, previewRows.length]);
      for (let index = 0; index < previewRows.length; index += 1) {
        const row = previewRows[index]; const rowPlan = previewPlans[index];
        await client.query(`INSERT INTO public.accounting_import_coordinates (id,coordinate_key,coordinate_normalization_version,logical_source_id,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7::uuid,$8,'migration_admin',$9::uuid,$10)`, [rowPlan.coordinateId, row.sourceRow.coordinate_key, row.sourceRow.coordinate_normalization_version, source.rows[0].id, at, actor.authorizationVersion, rowPlan.coordinateCorrelation, actor.name, actor.userUid, actor.userId]);
        await client.query(`INSERT INTO public.accounting_import_row_versions (id,batch_id,content_digest,coordinate_id,issue_status,normalization_version,normalized_payload,raw_payload,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,recorded_at,source_display_snapshot,supersedes_id,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::timestamptz,$10,$11::uuid,$12,'migration_admin',$13::uuid,$14,$9::timestamptz,$15,NULL,1)`, [rowPlan.rowVersionId, batchId, row.frozenRow.sourceContentDigest, rowPlan.coordinateId, row.sourceRow.issue_status, row.sourceRow.normalization_version, canonicalJson(row.sourceRow.normalized_payload), canonicalJson(row.sourceRow.raw_payload), at, actor.authorizationVersion, rowPlan.rowCorrelation, actor.name, actor.userUid, actor.userId, row.sourceRow.source_display_snapshot]);
        await client.query(`INSERT INTO public.accounting_import_batch_rows (id,batch_id,coordinate_id,ordinal,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,row_version_id) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,$4,$5::timestamptz,$6,$7::uuid,$8,'migration_admin',$9::uuid,$10,$11)`, [rowPlan.batchRowId, batchId, rowPlan.coordinateId, index + 1, at, actor.authorizationVersion, rowPlan.linkCorrelation, actor.name, actor.userUid, actor.userId, rowPlan.rowVersionId]);
      }
      for (let index = 0; index < results.length; index += 1) {
        const resultRow = results[index]; const isBatch = resultRow.entity_type === "import_batch";
        await audit(client, auditIds[index], isBatch ? String(selected.audit_event_uid) : randomUUID(), resultRow, actor, at, null, isBatch ? { row_count: previewRows.length, source_fingerprint: identity.sourceFingerprint } : { persisted: true }, previewRows.length === 0 ? "TODO19_LEGACY_ZERO_ROW_PREVIEW" : "TODO19_LEGACY_SOURCE_PREVIEW");
      }
      await client.query("COMMIT"); return { execution_outcome: "created", receipt };
    }

    const batchRow = await client.query<{ id: string; status: string; row_count: number; preview_manifest_sha256: string; source_fingerprint: string }>("SELECT id::text,status,row_count,preview_manifest_sha256,source_fingerprint FROM public.accounting_import_batches WHERE batch_uid=$1::uuid AND source_release_id=$2 FOR UPDATE", [batch.batch_uid, releaseRow.rows[0].id]);
    if (batchRow.rowCount !== 1) fail("legacy_payment_batch_binding_mismatch");
    if ((await client.query("SELECT 1 FROM public.source_decision_sets WHERE batch_id=$1", [batchRow.rows[0].id])).rowCount !== 0) fail("legacy_payment_decision_only_violation");
    if (command.action === "initialize") await client.query("LOCK TABLE public.payments IN ACCESS EXCLUSIVE MODE");
    const previewRows = await readLockedLegacyPayments(client); const paymentStats = { count: previewRows.length, watermark: previewRows.at(-1)?.paymentId ?? 0 };
    const identity = previewRows.length === 0 ? { sourceFingerprint:String(batch.source_fingerprint),previewManifestSha256:String(batch.preview_manifest_sha256) } : buildLegacyPaymentPreviewIdentity({sourceUid:source.rows[0].source_uid,releaseUid:String(release.release_uid),sourceRevision:`disposable:${scope.kind === "disposable-test" ? scope.runUid : "forbidden"};rows:${previewRows.length}`,coverageFrom:String(batch.coverage_from),coverageThrough:String(batch.coverage_through),rows:previewRows});
    if (batchRow.rows[0].row_count !== previewRows.length || batchRow.rows[0].preview_manifest_sha256 !== identity.previewManifestSha256 || batchRow.rows[0].source_fingerprint !== identity.sourceFingerprint || scope.kind === "development" && previewRows.length !== 0) fail("legacy_payment_batch_binding_mismatch");
    if ((await client.query<{count:number}>("SELECT count(*)::int count FROM public.accounting_import_batch_rows WHERE batch_id=$1", [batchRow.rows[0].id])).rows[0].count !== previewRows.length) fail("legacy_payment_batch_row_coverage_mismatch");
    const tip = await client.query<{ id: string; cutover_uid: string; phase: LegacyCutoverPhase; version: number; watermark_payment_id: number | null; comparison_digest: string | null }>("SELECT id::text,cutover_uid::text,phase,version,watermark_payment_id,comparison_digest FROM public.legacy_cutover_states WHERE cutover_code=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE", [cutover.cutover_code]);
    if (command.action === "initialize" ? tip.rowCount !== 0 || batchRow.rows[0].status !== "previewed" : tip.rowCount !== 1 || tip.rows[0].phase !== expectedPhase(command.action)) fail("legacy_payment_cutover_state_mismatch");
    if (command.action === "fence" && batchRow.rows[0].status !== "previewed" || command.action === "cutover" && batchRow.rows[0].status !== "applied") fail("legacy_payment_batch_state_mismatch");
    const decisionCount=(await client.query<{count:number}>("SELECT count(*)::int count FROM public.legacy_payment_decisions WHERE preview_batch_id=$1",[batchRow.rows[0].id])).rows[0].count;
    if (command.action === "initialize" && decisionCount !== 0 || command.action === "fence" && decisionCount !== 0 || command.action === "cutover" && decisionCount !== previewRows.length) fail("legacy_payment_decision_state_mismatch");
    const downstream = await client.query<{ legacy_events: number; legacy_receipts: number; legacy_allocations: number }>(`SELECT
      (SELECT count(*)::int FROM public.economic_events WHERE event_kind='legacy_compatibility') legacy_events,
      (SELECT count(*)::int FROM public.dues_receipts WHERE legacy_decision_id IS NOT NULL) legacy_receipts,
      (SELECT count(*)::int FROM public.dues_allocations WHERE legacy_decision_id IS NOT NULL) legacy_allocations`);
    if (command.action === "initialize" && (downstream.rows[0].legacy_events !== 0 || downstream.rows[0].legacy_receipts !== 0 || downstream.rows[0].legacy_allocations !== 0)) fail("legacy_payment_initialize_downstream_mismatch");
    let materialization: ResolvedLegacyMaterializationRow[] = [];
    if (command.action === "fence" && previewRows.length > 0) materialization = await discoverLegacyMaterializationRows(client,batchRow.rows[0].id,previewRows);
    const projection = command.action === "fence" ? cutoverProjection(materialization) : command.action === "cutover" ? await persistedCutoverProjection(client,batchRow.rows[0].id,previewRows) : {frozenRows:[],newRows:[]};
    const cutoverId = await reserve(client, "legacy_cutover_states");
    phase = command.action === "initialize" ? "legacy" : command.action === "fence" ? "fenced" : "new";
    if (phase !== "legacy") { watermark = paymentStats.watermark; comparisonDigest = buildLegacyCutoverComparison(watermark, projection.frozenRows, projection.newRows).comparisonDigest; }
    const materializationReservation = materialization.length > 0 ? await reserveLegacyMaterialization(client,materialization,1) : {actions:[],results:[],slots:[]};
    results.push(...materializationReservation.results); slots.push(...materializationReservation.slots);
    const cutoverResult = { ordinal: results.length + 1, entity_type: "legacy_cutover", entity_key: `cutover:${cutover.cutover_code}:${phase}`, entity_action: phase === "legacy" ? "create" : phase, action_correlation_uid: selected.action_correlation_uid } as Json;
    results.push(cutoverResult);
    if (command.action === "fence") results.push({ ordinal: results.length + 1, entity_type: "import_batch", entity_key: `batch:${batch.batch_uid}`, entity_action: "apply", action_correlation_uid: selected.batch_action_correlation_uid } as Json);
    const transitionResults = results.slice(materializationReservation.results.length);
    slots.push({ local_ordinal: 1, phase: 10, qualified_table_name: "public.legacy_cutover_states", reserved_id: cutoverId, result_ordinal: cutoverResult.ordinal, slot_kind: "business_row", slot_kind_order: 10 });
    const auditIds: string[] = []; for (const result of transitionResults) { const id = await reserve(client, "accounting_audit_events"); auditIds.push(id); slots.push({ local_ordinal: 1, phase: 30, qualified_table_name: "public.accounting_audit_events", reserved_id: id, result_ordinal: result.ordinal, slot_kind: "audit_row", slot_kind_order: 30 }); }
    const receipt = hashedReceipt({ schema_version: "dgkma-legacy-payment-operation-v1", action: command.action, operation_uid: command.operationUid, plan_sha256: String(plan.plan_sha256), committed_outcome: "created", phase, watermark_payment_id: watermark, comparison_digest: comparisonDigest, source_release_uid: String(release.release_uid), batch_uid: String(batch.batch_uid), source_fingerprint: identity.sourceFingerprint, actor_user_id: actor.userId, actor_user_uid: actor.userUid, authorization_version: actor.authorizationVersion, target_fingerprint: actor.targetFingerprint, recorded_at: at, command_sha256: commandSha });
    await insertOperation(client, { command, actor, receipt, rootCorrelationUid: String(selected.root_correlation_uid), results, slots, receiptId });
    if(materialization.length>0)await executeLegacyMaterialization(client,materialization,materializationReservation,actor,at,batchRow.rows[0].id);
    if (command.action === "fence") await client.query("UPDATE public.accounting_import_batches SET status='applied',applied_at=$1::timestamptz,apply_actor_at=$1::timestamptz,apply_actor_authorization_version=$2,apply_actor_correlation_uid=$3::uuid,apply_actor_name_snapshot=$4,apply_actor_scope='admin',apply_actor_uid_snapshot=$5::uuid,apply_actor_user_id=$6 WHERE id=$7", [at, actor.authorizationVersion, selected.batch_action_correlation_uid, actor.name, actor.userUid, actor.userId, batchRow.rows[0].id]);
    const parent = tip.rows[0]; await client.query(`INSERT INTO public.legacy_cutover_states (id,cutover_uid,cutover_code,phase,watermark_payment_id,comparison_digest,effective_at,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,supersedes_id,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,$6,$7::timestamptz,$7::timestamptz,$8,$9::uuid,$10,'migration_admin',$11::uuid,$12,$13,$14)`, [cutoverId, command.action === "initialize" ? cutover.cutover_uid : parent.cutover_uid, cutover.cutover_code, phase, watermark, comparisonDigest, at, actor.authorizationVersion, selected.action_correlation_uid, actor.name, actor.userUid, actor.userId, command.action === "initialize" ? null : parent.id, command.action === "initialize" ? 1 : parent.version + 1]);
    for (let index = 0; index < transitionResults.length; index += 1) {
      const result = transitionResults[index];
      const before: CanonicalValue | null = result.entity_type === "legacy_cutover" && tip.rowCount === 1 ? { phase: tip.rows[0].phase, version: tip.rows[0].version } : null;
      const after: CanonicalValue = result.entity_type === "legacy_cutover"
        ? { comparison_digest: comparisonDigest, phase, version: command.action === "initialize" ? 1 : tip.rows[0].version + 1, watermark_payment_id: watermark }
        : { row_count: previewRows.length, status: "applied" };
      await audit(client, auditIds[index], result === cutoverResult ? String(selected.audit_event_uid) : String(selected.batch_audit_event_uid), result, actor, at, before, after, result.entity_type === "legacy_cutover" ? "TODO19_LEGACY_CUTOVER" : "TODO19_LEGACY_ZERO_ROW_APPLY");
    }
    await client.query("COMMIT"); return { execution_outcome: "created", receipt };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

export async function executeLegacyPaymentReadTransition(
  pool: Pick<Pool, "connect">,
  rawCommand: Record<string, unknown>,
  actor: SourceDecisionActor,
  scope: LegacyPaymentExecutionScope = { kind: "development" },
): Promise<LegacyPaymentExecution> {
  const { plan } = loadLegacyPaymentPlan();
  const command = validateLegacyPaymentReadTransitionCommand(rawCommand);
  if (scope.kind === "development") {
    if (actor.targetFingerprint !== plan.target_fingerprint || actor.userId !== plan.actor_user_id || actor.userUid !== plan.actor_user_uid || actor.authorizationVersion !== plan.actor_authorization_version) fail("legacy_payment_actor_binding_mismatch");
  } else if (!UUID_V4.test(scope.runUid) || scope.parentTargetFingerprint !== plan.target_fingerprint || actor.targetFingerprint === scope.parentTargetFingerprint || !SHA256.test(actor.targetFingerprint)) {
    fail("legacy_payment_disposable_scope_mismatch");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const live = await client.query<{ user_uid: string; is_admin: boolean; name: string }>("SELECT user_uid::text,is_admin,name FROM public.users WHERE id=$1 FOR UPDATE", [actor.userId]);
    if (live.rowCount !== 1 || !live.rows[0].is_admin || live.rows[0].user_uid !== actor.userUid || live.rows[0].name !== actor.name) fail("legacy_payment_admin_required");
    const existing = await replay(client, command, actor);
    if (existing) {
      await client.query("COMMIT");
      return { execution_outcome: "verified_noop", receipt: existing };
    }
    const ledger = await client.query<{ count: number }>("SELECT count(*)::int count FROM public.schema_change_ledger WHERE sequence_no=100 AND manifest_sha256=$1", ["551d9d672a0cd3689b6c3ac5d1252078f4e53106a7ef143ac954c96239596c14"]);
    if (ledger.rows[0]?.count !== 1) fail("legacy_payment_sequence_100_missing");
    const tip = await client.query<{ id: string; cutover_uid: string; phase: LegacyCutoverPhase; version: number; watermark_payment_id: number; comparison_digest: string }>("SELECT id::text,cutover_uid::text,phase,version,watermark_payment_id,comparison_digest FROM public.legacy_cutover_states WHERE cutover_code='payments-v1' ORDER BY version DESC LIMIT 1 FOR UPDATE");
    if (tip.rowCount !== 1 || tip.rows[0].phase !== command.expectedPhase || tip.rows[0].watermark_payment_id !== command.expectedWatermarkPaymentId || tip.rows[0].comparison_digest !== command.expectedComparisonDigest) fail("legacy_payment_read_transition_state_mismatch");
    const nextPhase: LegacyCutoverPhase = command.action === "read_rollback" ? "read_rollback" : "new";
    assertLegacyCutoverTransition(tip.rows[0].phase, nextPhase);
    const batch = plan.batch as Json;
    const release = plan.release as Json;
    const storedBatch = await client.query<{ source_fingerprint: string }>("SELECT source_fingerprint FROM public.accounting_import_batches WHERE batch_uid=$1::uuid AND status='applied' FOR UPDATE", [batch.batch_uid]);
    if (storedBatch.rowCount !== 1) fail("legacy_payment_batch_binding_mismatch");
    const receiptId = await reserve(client, "business_operation_receipts");
    const cutoverId = await reserve(client, "legacy_cutover_states");
    const auditId = await reserve(client, "accounting_audit_events");
    const at = new Date().toISOString();
    const result = { ordinal: 1, entity_type: "legacy_cutover", entity_key: `cutover:payments-v1:${nextPhase}`, entity_action: nextPhase, action_correlation_uid: randomUUID() } as Json;
    const slots = [
      { local_ordinal: 1, phase: 0, qualified_table_name: "public.business_operation_receipts", reserved_id: receiptId, result_ordinal: 0, slot_kind: "operation_receipt", slot_kind_order: 0 },
      { local_ordinal: 1, phase: 10, qualified_table_name: "public.legacy_cutover_states", reserved_id: cutoverId, result_ordinal: 1, slot_kind: "business_row", slot_kind_order: 10 },
      { local_ordinal: 1, phase: 30, qualified_table_name: "public.accounting_audit_events", reserved_id: auditId, result_ordinal: 1, slot_kind: "audit_row", slot_kind_order: 30 },
    ] as Json[];
    const commandSha = sha256(canonicalJson(command as unknown as CanonicalValue));
    const receipt = hashedReceipt({
      schema_version: "dgkma-legacy-payment-operation-v1",
      action: command.action,
      operation_uid: command.operationUid,
      plan_sha256: String(plan.plan_sha256),
      committed_outcome: "created",
      phase: nextPhase,
      watermark_payment_id: tip.rows[0].watermark_payment_id,
      comparison_digest: tip.rows[0].comparison_digest,
      source_release_uid: String(release.release_uid),
      batch_uid: String(batch.batch_uid),
      source_fingerprint: storedBatch.rows[0].source_fingerprint,
      actor_user_id: actor.userId,
      actor_user_uid: actor.userUid,
      authorization_version: actor.authorizationVersion,
      target_fingerprint: actor.targetFingerprint,
      recorded_at: at,
      command_sha256: commandSha,
    });
    await insertOperation(client, { command, actor, receipt, rootCorrelationUid: randomUUID(), results: [result], slots, receiptId });
    await client.query(`INSERT INTO public.legacy_cutover_states (id,cutover_uid,cutover_code,phase,watermark_payment_id,comparison_digest,effective_at,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,supersedes_id,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,'payments-v1',$3,$4,$5,$6::timestamptz,$6::timestamptz,$7,$8::uuid,$9,'migration_admin',$10::uuid,$11,$12,$13)`, [cutoverId, tip.rows[0].cutover_uid, nextPhase, tip.rows[0].watermark_payment_id, tip.rows[0].comparison_digest, at, actor.authorizationVersion, result.action_correlation_uid, actor.name, actor.userUid, actor.userId, tip.rows[0].id, tip.rows[0].version + 1]);
    await audit(client, auditId, randomUUID(), result, actor, at, { phase: tip.rows[0].phase, version: tip.rows[0].version }, { comparison_digest: tip.rows[0].comparison_digest, phase: nextPhase, version: tip.rows[0].version + 1, watermark_payment_id: tip.rows[0].watermark_payment_id }, "TODO19_LEGACY_CUTOVER");
    await client.query("COMMIT");
    return { execution_outcome: "created", receipt };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
