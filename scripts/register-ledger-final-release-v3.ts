import { readFileSync } from "node:fs";
import type { PoolClient } from "pg";
import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";
import { verifyActorReceipt } from "./admin-actor-receipt";

type Json = Record<string, CanonicalValue>;
const PLAN_PATH = "docs/source-contracts/releases/ledger-final-development-release-plan-v3.json";
const DESCRIPTOR_PATH = "docs/source-contracts/releases/ledger-final-2022-2025-v3.json";
const ACTOR_PATH = "docs/database-targets/development-admin-approved.json";
const SOURCE_CODE = "LEDGER_FINAL_2022_2025";
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Json;
function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
async function reserve(client: PoolClient, table: string): Promise<string> { return (await client.query<{ id: string }>("SELECT nextval(pg_get_serial_sequence($1,'id'))::text id", [`public.${table}`])).rows[0].id; }

async function register(client: PoolClient, targetFingerprint: string) {
  const plan = readJson(PLAN_PATH); const preimage = { ...plan }; delete preimage.plan_sha256;
  if (plan.plan_sha256 !== sha256(canonicalJson(preimage)) || plan.target_fingerprint !== targetFingerprint || plan.source_code !== SOURCE_CODE) fail("ledger_release_plan_binding_mismatch");
  const descriptorBytes = readFileSync(DESCRIPTOR_PATH); const descriptor = JSON.parse(descriptorBytes.toString("utf8")) as Json;
  if (plan.descriptor_sha256 !== sha256(descriptorBytes) || descriptor.source_code !== SOURCE_CODE || descriptor.adapter_version !== "3.0.0") fail("ledger_release_descriptor_binding_mismatch");
  const actor = await verifyActorReceipt(client as never, ACTOR_PATH, { kind: "development", targetFingerprint, candidateUserId: Number(plan.actor_user_id) });
  if (actor.userUid !== plan.actor_user_uid || actor.authorizationVersion !== plan.actor_authorization_version) fail("ledger_release_actor_binding_mismatch");
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  try {
    if ((await client.query("SELECT 1 FROM public.users WHERE id=$1 AND user_uid=$2::uuid AND is_admin=true FOR UPDATE", [actor.userId, actor.userUid])).rowCount !== 1) fail("blocked_actor");
    const source = await client.query<{ id: string }>("SELECT id::text FROM public.accounting_logical_sources WHERE source_code=$1 FOR UPDATE", [SOURCE_CODE]); if (source.rowCount !== 1) fail("ledger_release_source_missing");
    const baseline = (await client.query<{ v1: number; v2: number; v3: number; batches: number }>(`SELECT count(*) FILTER (WHERE adapter_version='1.0.0')::int v1,count(*) FILTER (WHERE adapter_version='2.0.0')::int v2,count(*) FILTER (WHERE adapter_version='3.0.0')::int v3,(SELECT count(*)::int FROM public.accounting_import_batches b JOIN public.accounting_source_releases br ON br.id=b.source_release_id WHERE br.logical_source_id=$1) batches FROM public.accounting_source_releases WHERE logical_source_id=$1 AND status='active'`, [source.rows[0].id])).rows[0];
    if (baseline.v1 !== 1 || baseline.v2 !== 1 || ![0, 1].includes(baseline.v3) || baseline.batches !== 0) fail("ledger_release_baseline_mismatch");
    const exact = await client.query<{ release_uid: string }>(`SELECT release_uid::text FROM public.accounting_source_releases WHERE logical_source_id=$1 AND adapter_code=$2 AND adapter_version=$3 AND normalized_schema_sha256=$4 AND normalization_implementation_sha256=$5 AND mapping_table_sha256=$6 AND mapping_approval_receipt_sha256=$7`, [source.rows[0].id, descriptor.adapter_code, descriptor.adapter_version, descriptor.normalized_schema_sha256, descriptor.normalization_implementation_sha256, descriptor.mapping_table_sha256, descriptor.mapping_approval_receipt_sha256]);
    if (exact.rowCount === 1) { if (exact.rows[0].release_uid !== plan.release_uid || (await client.query("SELECT 1 FROM public.business_operation_receipts WHERE operation_uid=$1::uuid", [plan.operation_uid])).rowCount !== 1) fail("ledger_release_existing_binding_mismatch"); await client.query("COMMIT"); return "verified_noop"; }
    if (exact.rowCount !== 0 || baseline.v3 !== 0) fail("ledger_release_drift");
    const receiptId = await reserve(client, "business_operation_receipts"); const releaseId = await reserve(client, "accounting_source_releases"); const auditId = await reserve(client, "accounting_audit_events");
    const result = { action_correlation_uid: plan.action_correlation_uid, entity_action: "create", entity_key: `release:${plan.release_uid}`, entity_type: "source_release", ordinal: 1 };
    const slots = [{ local_ordinal: 1, phase: 0, qualified_table_name: "public.business_operation_receipts", reserved_id: receiptId, result_ordinal: 0, slot_kind: "operation_receipt", slot_kind_order: 0 }, { local_ordinal: 1, phase: 1, qualified_table_name: "public.accounting_source_releases", reserved_id: releaseId, result_ordinal: 1, slot_kind: "business_row", slot_kind_order: 1 }, { local_ordinal: 1, phase: 2, qualified_table_name: "public.accounting_audit_events", reserved_id: auditId, result_ordinal: 1, slot_kind: "audit_row", slot_kind_order: 2 }];
    const payload = { command: "source_release:create", expected_results: [result], inputs: { descriptor_sha256: plan.descriptor_sha256, source_code: SOURCE_CODE }, reservation_slots: slots, schema_version: "business-operation-payload-v2" }; const payloadSha = sha256(canonicalJson(payload as CanonicalValue)); const now = new Date().toISOString();
    await client.query(`INSERT INTO public.business_operation_receipts (id,action,actor_name_snapshot,actor_scope,actor_target_user_id,actor_target_user_id_snapshot,actor_uid_snapshot,actor_user_id,actor_user_id_snapshot,authorization_version,canonical_payload,entity_type,operation_uid,payload_sha256,recorded_at,result_entity_keys,root_correlation_uid,target_fingerprint) OVERRIDING SYSTEM VALUE VALUES ($1,'create',$2,'admin',NULL,NULL,$3::uuid,$4,$4,$5,$6::jsonb,'source_release',$7::uuid,$8,$9::timestamptz,$10::jsonb,$11::uuid,$12)`, [receiptId, actor.name, actor.userUid, actor.userId, actor.authorizationVersion, canonicalJson(payload as CanonicalValue), plan.operation_uid, payloadSha, now, canonicalJson([result] as CanonicalValue), plan.root_correlation_uid, targetFingerprint]);
    await client.query("INSERT INTO public.business_operation_entities (operation_uid,ordinal,entity_type,entity_key,entity_action,action_correlation_uid) VALUES ($1::uuid,1,'source_release',$2,'create',$3::uuid)", [plan.operation_uid, result.entity_key, plan.action_correlation_uid]);
    await client.query(`INSERT INTO public.accounting_source_releases (id,release_uid,logical_source_id,adapter_code,adapter_version,normalized_schema_sha256,normalization_implementation_sha256,mapping_table_sha256,mapping_approval_receipt_sha256,released_at,status,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,'active',$11,$12::uuid,$13,'admin',$10::timestamptz,$14::uuid,$15)`, [releaseId, plan.release_uid, source.rows[0].id, descriptor.adapter_code, descriptor.adapter_version, descriptor.normalized_schema_sha256, descriptor.normalization_implementation_sha256, descriptor.mapping_table_sha256, descriptor.mapping_approval_receipt_sha256, now, actor.userId, actor.userUid, actor.name, plan.action_correlation_uid, actor.authorizationVersion]);
    await client.query(`INSERT INTO public.accounting_audit_events (id,event_uid,entity_type,entity_key,action,before_json,after_json,effective_at,recorded_at,reason_code,actor_user_id,actor_uid_snapshot,actor_name_snapshot,actor_scope,actor_at,correlation_uid,actor_authorization_version) OVERRIDING SYSTEM VALUE VALUES ($1,$2::uuid,'source_release',$3,'create',NULL,$4::jsonb,$5::timestamptz,$5::timestamptz,'TODO18_LEDGER_PROFILE_V3',$6,$7::uuid,$8,'admin',$5::timestamptz,$9::uuid,$10)`, [auditId, plan.event_uid, result.entity_key, canonicalJson({ descriptor_sha256: plan.descriptor_sha256, source_code: SOURCE_CODE } as CanonicalValue), now, actor.userId, actor.userUid, actor.name, plan.action_correlation_uid, actor.authorizationVersion]);
    await client.query("COMMIT"); return "created";
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
}

async function main() {
  if (arg("--target") !== "development" || arg("--plan") !== PLAN_PATH || arg("--actor-receipt") !== ACTOR_PATH) fail("ledger_release_scope_mismatch");
  const resolved = resolveDevelopmentTarget(process.env, "migration"); const pool = createTargetPool(resolved);
  try { const target = await verifyDevelopmentTarget(pool, resolved); const client = await pool.connect(); try { const outcome = await register(client, target.targetFingerprint); console.log(JSON.stringify({ schema_version: "ledger-final-release-result-v3", target: "development", release_uid: readJson(PLAN_PATH).release_uid, outcome, result: "verified" })); } finally { client.release(); } } finally { await shutdownPool(pool); }
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "ledger-final-release-error-v3", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
