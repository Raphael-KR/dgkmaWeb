import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { buildLegacyCutoverComparison, type LegacyCutoverPhase } from "./legacy-cutover-contract";
import { buildLegacyPaymentPreviewIdentity, readLockedLegacyPayments } from "./legacy-payment-preview";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import type { SourceDecisionActor } from "./source-decision-service";

type Json = Record<string, CanonicalValue>;
type LegacyAction = "register_release" | "preview" | "initialize" | "fence" | "cutover";

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
  action: LegacyAction;
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

async function replay(client: PoolClient, command: LegacyPaymentCommand, actor: SourceDecisionActor): Promise<LegacyPaymentReceipt | undefined> {
  const found = await client.query<{ canonical_payload: Json; target_fingerprint: string }>("SELECT canonical_payload,target_fingerprint FROM public.business_operation_receipts WHERE operation_uid=$1::uuid FOR UPDATE", [command.operationUid]);
  if (found.rowCount === 0) return undefined;
  if (found.rowCount !== 1 || found.rows[0].canonical_payload?.inputs === undefined) fail("legacy_payment_operation_uid_reuse");
  const inputs = found.rows[0].canonical_payload.inputs as Json; const receipt = strictReceipt(inputs.operation_receipt);
  if (inputs.command_sha256 !== sha256(canonicalJson(command as unknown as CanonicalValue)) || receipt.target_fingerprint !== found.rows[0].target_fingerprint || receipt.target_fingerprint !== actor.targetFingerprint || receipt.actor_user_id !== actor.userId || receipt.actor_user_uid !== actor.userUid || receipt.authorization_version !== actor.authorizationVersion) fail("legacy_payment_operation_uid_reuse");
  return receipt;
}

async function insertOperation(client: PoolClient, input: { command: LegacyPaymentCommand; actor: SourceDecisionActor; receipt: LegacyPaymentReceipt; rootCorrelationUid: string; results: Json[]; slots: Json[]; receiptId: string }): Promise<void> {
  const payload = { command: `legacy_payment:${input.command.action}`, expected_results: input.results, inputs: { command_sha256: input.receipt.command_sha256, operation_receipt: input.receipt as unknown as CanonicalValue }, reservation_slots: input.slots, schema_version: "business-operation-payload-v2" };
  await client.query(`INSERT INTO public.business_operation_receipts (id,action,actor_name_snapshot,actor_scope,actor_target_user_id,actor_target_user_id_snapshot,actor_uid_snapshot,actor_user_id,actor_user_id_snapshot,authorization_version,canonical_payload,entity_type,operation_uid,payload_sha256,recorded_at,result_entity_keys,root_correlation_uid,target_fingerprint) OVERRIDING SYSTEM VALUE VALUES ($1,$2,$3,'migration_admin',NULL,NULL,$4::uuid,$5,$5,$6,$7::jsonb,'legacy_payment',$8::uuid,$9,$10::timestamptz,$11::jsonb,$12::uuid,$13)`, [input.receiptId, input.command.action, input.actor.name, input.actor.userUid, input.actor.userId, input.actor.authorizationVersion, canonicalJson(payload as unknown as CanonicalValue), input.command.operationUid, sha256(canonicalJson(payload as unknown as CanonicalValue)), input.receipt.recorded_at, canonicalJson(input.results as unknown as CanonicalValue), input.rootCorrelationUid, input.actor.targetFingerprint]);
  for (const result of input.results) await client.query("INSERT INTO public.business_operation_entities (operation_uid,ordinal,entity_type,entity_key,entity_action,action_correlation_uid) VALUES ($1::uuid,$2,$3,$4,$5,$6::uuid)", [input.command.operationUid, result.ordinal, result.entity_type, result.entity_key, result.entity_action, result.action_correlation_uid]);
}

async function audit(client: PoolClient, id: string, eventUid: string, result: Json, actor: SourceDecisionActor, at: string, before: CanonicalValue | null, after: CanonicalValue, reason: string): Promise<void> {
  await client.query(`INSERT INTO public.accounting_audit_events (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,$6::jsonb,$7::jsonb,$8::timestamptz,$8::timestamptz,$9,$10,$11::uuid,$12,'migration_admin',$8::timestamptz,$13::uuid,$14)`, [id, eventUid, result.entity_type, result.entity_key, result.entity_action, before === null ? null : canonicalJson(before), canonicalJson(after), at, reason, actor.userId, actor.userUid, actor.name, result.action_correlation_uid, actor.authorizationVersion]);
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
    if (batchRow.rowCount !== 1 || batchRow.rows[0].row_count !== 0 || batchRow.rows[0].preview_manifest_sha256 !== batch.preview_manifest_sha256 || batchRow.rows[0].source_fingerprint !== batch.source_fingerprint) fail("legacy_payment_batch_binding_mismatch");
    if ((await client.query("SELECT 1 FROM public.source_decision_sets WHERE batch_id=$1", [batchRow.rows[0].id])).rowCount !== 0 || (await client.query("SELECT 1 FROM public.accounting_import_batch_rows WHERE batch_id=$1", [batchRow.rows[0].id])).rowCount !== 0) fail("legacy_payment_decision_only_violation");
    await client.query("LOCK TABLE public.payments IN ACCESS EXCLUSIVE MODE"); const paymentStats = (await client.query<{ count: number; watermark: number }>("SELECT count(*)::int count,COALESCE(max(id),0)::int watermark FROM public.payments")).rows[0]; if (paymentStats.count !== 0 || paymentStats.watermark !== 0) fail("legacy_payment_nonzero_materialization_not_implemented");
    const tip = await client.query<{ id: string; cutover_uid: string; phase: LegacyCutoverPhase; version: number; watermark_payment_id: number | null; comparison_digest: string | null }>("SELECT id::text,cutover_uid::text,phase,version,watermark_payment_id,comparison_digest FROM public.legacy_cutover_states WHERE cutover_code=$1 ORDER BY version DESC LIMIT 1 FOR UPDATE", [cutover.cutover_code]);
    if (command.action === "initialize" ? tip.rowCount !== 0 || batchRow.rows[0].status !== "previewed" : tip.rowCount !== 1 || tip.rows[0].phase !== expectedPhase(command.action)) fail("legacy_payment_cutover_state_mismatch");
    if (command.action === "fence" && batchRow.rows[0].status !== "previewed" || command.action === "cutover" && batchRow.rows[0].status !== "applied") fail("legacy_payment_batch_state_mismatch");
    if ((await client.query("SELECT 1 FROM public.legacy_payment_decisions LIMIT 1 FOR UPDATE")).rowCount !== 0) fail("legacy_payment_zero_row_decision_mismatch");
    const downstream = await client.query<{ legacy_events: number; legacy_receipts: number; legacy_allocations: number }>(`SELECT
      (SELECT count(*)::int FROM public.economic_events WHERE event_kind='legacy_compatibility') legacy_events,
      (SELECT count(*)::int FROM public.dues_receipts WHERE legacy_decision_id IS NOT NULL) legacy_receipts,
      (SELECT count(*)::int FROM public.dues_allocations WHERE legacy_decision_id IS NOT NULL) legacy_allocations`);
    if (downstream.rows[0].legacy_events !== 0 || downstream.rows[0].legacy_receipts !== 0 || downstream.rows[0].legacy_allocations !== 0) fail("legacy_payment_zero_row_downstream_mismatch");
    const cutoverId = await reserve(client, "legacy_cutover_states");
    phase = command.action === "initialize" ? "legacy" : command.action === "fence" ? "fenced" : "new";
    if (phase !== "legacy") { watermark = 0; comparisonDigest = buildLegacyCutoverComparison(0, [], []).comparisonDigest; }
    const cutoverResult = { ordinal: 1, entity_type: "legacy_cutover", entity_key: `cutover:${cutover.cutover_code}:${phase}`, entity_action: phase === "legacy" ? "create" : phase, action_correlation_uid: selected.action_correlation_uid } as Json;
    results.push(cutoverResult);
    if (command.action === "fence") results.push({ ordinal: 2, entity_type: "import_batch", entity_key: `batch:${batch.batch_uid}`, entity_action: "apply", action_correlation_uid: selected.batch_action_correlation_uid } as Json);
    slots.push({ local_ordinal: 1, phase: 10, qualified_table_name: "public.legacy_cutover_states", reserved_id: cutoverId, result_ordinal: 1, slot_kind: "business_row", slot_kind_order: 10 });
    const auditIds: string[] = []; for (const result of results) { const id = await reserve(client, "accounting_audit_events"); auditIds.push(id); slots.push({ local_ordinal: 1, phase: 30, qualified_table_name: "public.accounting_audit_events", reserved_id: id, result_ordinal: result.ordinal, slot_kind: "audit_row", slot_kind_order: 30 }); }
    const receipt = hashedReceipt({ schema_version: "dgkma-legacy-payment-operation-v1", action: command.action, operation_uid: command.operationUid, plan_sha256: String(plan.plan_sha256), committed_outcome: "created", phase, watermark_payment_id: watermark, comparison_digest: comparisonDigest, source_release_uid: String(release.release_uid), batch_uid: String(batch.batch_uid), source_fingerprint: String(batch.source_fingerprint), actor_user_id: actor.userId, actor_user_uid: actor.userUid, authorization_version: actor.authorizationVersion, target_fingerprint: actor.targetFingerprint, recorded_at: at, command_sha256: commandSha });
    await insertOperation(client, { command, actor, receipt, rootCorrelationUid: String(selected.root_correlation_uid), results, slots, receiptId });
    if (command.action === "fence") await client.query("UPDATE public.accounting_import_batches SET status='applied',applied_at=$1::timestamptz,apply_actor_at=$1::timestamptz,apply_actor_authorization_version=$2,apply_actor_correlation_uid=$3::uuid,apply_actor_name_snapshot=$4,apply_actor_scope='admin',apply_actor_uid_snapshot=$5::uuid,apply_actor_user_id=$6 WHERE id=$7", [at, actor.authorizationVersion, selected.batch_action_correlation_uid, actor.name, actor.userUid, actor.userId, batchRow.rows[0].id]);
    const parent = tip.rows[0]; await client.query(`INSERT INTO public.legacy_cutover_states (id,cutover_uid,cutover_code,phase,watermark_payment_id,comparison_digest,effective_at,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,supersedes_id,version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,$6,$7::timestamptz,$7::timestamptz,$8,$9::uuid,$10,'migration_admin',$11::uuid,$12,$13,$14)`, [cutoverId, command.action === "initialize" ? cutover.cutover_uid : parent.cutover_uid, cutover.cutover_code, phase, watermark, comparisonDigest, at, actor.authorizationVersion, selected.action_correlation_uid, actor.name, actor.userUid, actor.userId, command.action === "initialize" ? null : parent.id, command.action === "initialize" ? 1 : parent.version + 1]);
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      const before: CanonicalValue | null = result.entity_type === "legacy_cutover" && tip.rowCount === 1 ? { phase: tip.rows[0].phase, version: tip.rows[0].version } : null;
      const after: CanonicalValue = result.entity_type === "legacy_cutover"
        ? { comparison_digest: comparisonDigest, phase, version: command.action === "initialize" ? 1 : tip.rows[0].version + 1, watermark_payment_id: watermark }
        : { row_count: 0, status: "applied" };
      await audit(client, auditIds[index], result === cutoverResult ? String(selected.audit_event_uid) : String(selected.batch_audit_event_uid), result, actor, at, before, after, result.entity_type === "legacy_cutover" ? "TODO19_LEGACY_CUTOVER" : "TODO19_LEGACY_ZERO_ROW_APPLY");
    }
    await client.query("COMMIT"); return { execution_outcome: "created", receipt };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}
