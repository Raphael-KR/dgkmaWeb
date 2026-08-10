import { readFileSync } from "node:fs";
import type { Pool, PoolClient } from "pg";
import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";
import { verifyActorReceipt } from "./admin-actor-receipt";

type Json = Record<string, CanonicalValue>;
const PLAN = "docs/source-contracts/releases/admin-readable-development-source-release-plan-v2.json";
const ACTOR = "docs/database-targets/development-admin-approved.json";
const slug = (code: string) => code.toLowerCase().replaceAll("_", "-");
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Json;
function arg(name: string): string { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw new Error(`missing_argument:${name}`); return process.argv[i + 1]; }
async function reserve(client: PoolClient, table: string): Promise<string> {
  const result = await client.query<{ id: string }>(`SELECT nextval(pg_get_serial_sequence($1,'id'))::text AS id`, [`public.${table}`]);
  return result.rows[0].id;
}

async function register(pool: Pool, targetFingerprint: string) {
  const plan = readJson(PLAN); const planPreimage = { ...plan }; delete planPreimage.plan_sha256;
  if (plan.plan_sha256 !== sha256(canonicalJson(planPreimage as CanonicalValue)) || plan.target_fingerprint !== targetFingerprint) throw new Error("admin_readable_release_plan_binding_mismatch");
  const operations = plan.operations as Json[];
  if (operations.length !== 10 || new Set(operations.map((entry) => entry.source_code)).size !== 10) throw new Error("admin_readable_release_plan_coverage_mismatch");
  const actor = await verifyActorReceipt(pool, ACTOR, { kind: "development", targetFingerprint, candidateUserId: Number(plan.actor_user_id) });
  if (actor.userUid !== plan.actor_user_uid || actor.authorizationVersion !== plan.actor_authorization_version) throw new Error("admin_readable_release_actor_binding_mismatch");
  const client = await pool.connect();
  try {
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    const locked = await client.query<{ name: string }>("SELECT name FROM public.users WHERE id=$1 AND user_uid=$2::uuid AND is_admin=true FOR UPDATE", [actor.userId, actor.userUid]);
    if (locked.rowCount !== 1) throw new Error("blocked_actor");
    const sourceCodes = operations.map((entry) => String(entry.source_code));
    const preflight = await client.query<{ all_active: number; v2_exact: number; import_batches: number; decision_sets: number }>(`
      SELECT
        count(*)::int AS all_active,
        count(*) FILTER (WHERE r.adapter_version='2.0.0')::int AS v2_exact,
        (SELECT count(*)::int FROM public.accounting_import_batches) AS import_batches,
        (SELECT count(*)::int FROM public.source_decision_sets) AS decision_sets
      FROM public.accounting_source_releases r
      JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id
      WHERE s.source_code=ANY($1::text[]) AND r.status='active'
    `, [sourceCodes]);
    if (![0, 10].includes(preflight.rows[0].v2_exact)) throw new Error("admin_readable_release_partial_drift");
    if (preflight.rows[0].import_batches !== 0 || preflight.rows[0].decision_sets !== 0) throw new Error("admin_readable_release_import_already_started");
    if (preflight.rows[0].v2_exact === 0 && preflight.rows[0].all_active !== 10) throw new Error("admin_readable_release_v1_baseline_mismatch");
    if (preflight.rows[0].v2_exact === 10 && preflight.rows[0].all_active !== 20) throw new Error("admin_readable_release_retry_baseline_mismatch");
    let created = 0;
    for (const operation of operations) {
      const sourceCode = String(operation.source_code); const descriptorPath = `docs/source-contracts/releases/${slug(sourceCode)}-v2.json`;
      const descriptorBytes = readFileSync(descriptorPath); const descriptor = JSON.parse(descriptorBytes.toString("utf8")) as Json;
      if (operation.descriptor_sha256 !== sha256(descriptorBytes) || descriptor.source_code !== sourceCode || descriptor.adapter_version !== "2.0.0") throw new Error("admin_readable_release_descriptor_binding_mismatch");
      const source = await client.query<{ id: string }>("SELECT id::text FROM public.accounting_logical_sources WHERE source_code=$1 FOR UPDATE", [sourceCode]);
      if (source.rowCount !== 1) throw new Error(`admin_readable_release_logical_source_missing:${sourceCode}`);
      const exact = await client.query<{ release_uid: string }>(`SELECT release_uid::text FROM public.accounting_source_releases WHERE logical_source_id=$1 AND adapter_code=$2 AND adapter_version=$3 AND normalized_schema_sha256=$4 AND normalization_implementation_sha256=$5 AND mapping_table_sha256=$6 AND mapping_approval_receipt_sha256=$7`, [source.rows[0].id, descriptor.adapter_code, descriptor.adapter_version, descriptor.normalized_schema_sha256, descriptor.normalization_implementation_sha256, descriptor.mapping_table_sha256, descriptor.mapping_approval_receipt_sha256]);
      if (exact.rowCount === 1) {
        if (exact.rows[0].release_uid !== operation.release_uid) throw new Error(`admin_readable_release_unattributed_existing:${sourceCode}`);
        const receipt = await client.query("SELECT 1 FROM public.business_operation_receipts WHERE operation_uid=$1::uuid", [operation.operation_uid]);
        if (receipt.rowCount !== 1) throw new Error(`admin_readable_release_receipt_missing:${sourceCode}`);
        continue;
      }
      if (preflight.rows[0].v2_exact !== 0) throw new Error("admin_readable_release_retry_descriptor_drift");
      const receiptId = await reserve(client, "business_operation_receipts"); const releaseId = await reserve(client, "accounting_source_releases"); const auditId = await reserve(client, "accounting_audit_events");
      const result = { action_correlation_uid: operation.action_correlation_uid, entity_action: "create", entity_key: `release:${operation.release_uid}`, entity_type: "source_release", ordinal: 1 };
      const slots = [
        { local_ordinal: 1, phase: 0, qualified_table_name: "public.business_operation_receipts", reserved_id: receiptId, result_ordinal: 0, slot_kind: "operation_receipt", slot_kind_order: 0 },
        { local_ordinal: 1, phase: 1, qualified_table_name: "public.accounting_source_releases", reserved_id: releaseId, result_ordinal: 1, slot_kind: "business_row", slot_kind_order: 1 },
        { local_ordinal: 1, phase: 2, qualified_table_name: "public.accounting_audit_events", reserved_id: auditId, result_ordinal: 1, slot_kind: "audit_row", slot_kind_order: 2 },
      ];
      const payload = { command: "source_release:create", expected_results: [result], inputs: { descriptor_sha256: operation.descriptor_sha256, source_code: sourceCode }, reservation_slots: slots, schema_version: "business-operation-payload-v2" };
      const payloadSha = sha256(canonicalJson(payload as CanonicalValue)); const now = new Date().toISOString();
      await client.query(`INSERT INTO public.business_operation_receipts (id,action,actor_name_snapshot,actor_scope,actor_target_user_id,actor_target_user_id_snapshot,actor_uid_snapshot,actor_user_id,actor_user_id_snapshot,authorization_version,canonical_payload,entity_type,operation_uid,payload_sha256,recorded_at,result_entity_keys,root_correlation_uid,target_fingerprint) OVERRIDING SYSTEM VALUE VALUES ($1,'create',$2,'admin',NULL,NULL,$3::uuid,$4,$4,$5,$6::jsonb,'source_release',$7::uuid,$8,$9::timestamptz,$10::jsonb,$11::uuid,$12)`, [receiptId, actor.name, actor.userUid, actor.userId, actor.authorizationVersion, canonicalJson(payload as CanonicalValue), operation.operation_uid, payloadSha, now, canonicalJson([result] as CanonicalValue), operation.root_correlation_uid, targetFingerprint]);
      await client.query("INSERT INTO public.business_operation_entities (operation_uid,ordinal,entity_type,entity_key,entity_action,action_correlation_uid) VALUES ($1::uuid,1,'source_release',$2,'create',$3::uuid)", [operation.operation_uid, result.entity_key, operation.action_correlation_uid]);
      await client.query(`INSERT INTO public.accounting_source_releases (id,release_uid,logical_source_id,adapter_code,adapter_version,normalized_schema_sha256,normalization_implementation_sha256,mapping_table_sha256,mapping_approval_receipt_sha256,released_at,status,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,'active',$11,$12::uuid,$13,'admin',$10::timestamptz,$14::uuid,$15)`, [releaseId, operation.release_uid, source.rows[0].id, descriptor.adapter_code, descriptor.adapter_version, descriptor.normalized_schema_sha256, descriptor.normalization_implementation_sha256, descriptor.mapping_table_sha256, descriptor.mapping_approval_receipt_sha256, now, actor.userId, actor.userUid, actor.name, operation.action_correlation_uid, actor.authorizationVersion]);
      await client.query(`INSERT INTO public.accounting_audit_events (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,'source_release',$3,'create',NULL,$4::jsonb,$5::timestamptz,$5::timestamptz,'TODO18_ADMIN_READABLE_SOURCE_CONTRACT',$6,$7::uuid,$8,'admin',$5::timestamptz,$9::uuid,$10)`, [auditId, operation.event_uid, result.entity_key, canonicalJson({ descriptor_sha256: operation.descriptor_sha256, source_code: sourceCode } as CanonicalValue), now, actor.userId, actor.userUid, actor.name, operation.action_correlation_uid, actor.authorizationVersion]);
      created += 1;
    }
    if (![0, 10].includes(created)) throw new Error("admin_readable_release_atomic_count_mismatch");
    const coverage = await client.query<{ all_active: number; v2_active: number }>(`SELECT count(*)::int AS all_active, count(*) FILTER (WHERE r.adapter_version='2.0.0')::int AS v2_active FROM public.accounting_source_releases r JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code=ANY($1::text[]) AND r.status='active'`, [sourceCodes]);
    if (coverage.rows[0].all_active !== 20 || coverage.rows[0].v2_active !== 10) throw new Error("admin_readable_release_coverage_mismatch");
    await client.query("COMMIT");
    return created === 0 ? "verified_noop" : "created";
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
}

async function main() {
  if (arg("--target") !== "development" || arg("--plan") !== PLAN || arg("--actor-receipt") !== ACTOR) throw new Error("admin_readable_release_command_scope_mismatch");
  const resolved = resolveDevelopmentTarget(process.env, "migration"); const pool = createTargetPool(resolved);
  try { const target = await verifyDevelopmentTarget(pool, resolved); const outcome = await register(pool, target.targetFingerprint); console.log(JSON.stringify({ schema_version: "dgkma-admin-readable-source-release-result-v2", target: "development", source_count: 10, outcome, result: "verified" })); } finally { await shutdownPool(pool); }
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-admin-readable-source-release-error-v2", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
