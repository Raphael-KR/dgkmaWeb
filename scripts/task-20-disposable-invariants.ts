import type { Pool, PoolClient } from "pg";
import {
  createOrResumeDisposableTarget, createTargetPool, resolveDisposableControlTarget,
  shutdownPool, teardownDisposableTarget, verifyDevelopmentTarget,
} from "../server/db-target";
import { canonicalJson, sha256 } from "../server/accounting/source-contracts";
import type { CanonicalValue } from "../server/accounting/source-contracts";
import { assertBusinessOperationPayloadHash, validateBusinessOperationPayloadV2 } from "../server/accounting/business-operation-payload";
import { buildLegacyPaymentCommand, executeLegacyPaymentCommand } from "../server/accounting/legacy-payment-service";
import { verifyActorReceipt } from "./admin-actor-receipt";

const BUSINESS_REASON_TABLES = [
  "mutable_entity_action_history", "member_match_cases", "member_identity_link_history",
  "economic_event_authority_decisions", "economic_event_canonicalizations", "economic_event_collisions",
  "legacy_payment_decisions", "dues_receipt_reversals",
] as const;
const SCHEMA_CONSTRAINTS = [
  "schema_data_exceptions__capture_chain__check", "schema_data_exceptions__lifecycle_actor__check",
  "schema_data_exceptions__resolution_duplicate__check", "schema_data_exceptions__rule_class_registry__check",
  "schema_data_exceptions__rule_code_registry__check", "schema_data_exceptions__status_resolution__check",
] as const;
const LEGACY_ACTIONS = ["register_release", "preview", "initialize", "fence", "cutover"] as const;

function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`); return process.argv[index + 1]; }
function errorCode(error: unknown): string { return typeof error === "object" && error !== null && "code" in error ? String((error as { code: unknown }).code) : "unknown"; }

async function aggregateDigest(pool: Pool): Promise<string> {
  const result = await pool.query<Record<string, number>>(`SELECT
    (SELECT count(*)::int FROM public.business_operation_receipts) operation_receipts,
    (SELECT count(*)::int FROM public.accounting_audit_events) audit_events,
    (SELECT count(*)::int FROM public.schema_data_exceptions) schema_exceptions,
    (SELECT count(*)::int FROM public.dues_receipts) dues_receipts,
    (SELECT count(*)::int FROM public.dues_allocations) dues_allocations,
    (SELECT count(*)::int FROM public.economic_events) economic_events,
    (SELECT count(*)::int FROM public.bank_reconciliations) reconciliations`);
  return sha256(canonicalJson(result.rows[0] as never));
}

async function identitySequenceDigest(pool: Pool): Promise<string> {
  const rows = await pool.query<{ sequence_name: string; last_value: string }>("SELECT sequencename sequence_name,last_value::text FROM pg_catalog.pg_sequences WHERE schemaname='public' ORDER BY sequencename");
  return sha256(canonicalJson(rows.rows as unknown as CanonicalValue));
}

async function runLegacyReceiptProbe(pool: Pool, actor: Awaited<ReturnType<typeof verifyActorReceipt>>, runUid: string, targetFingerprint: string, parentTargetFingerprint: string): Promise<Record<string, unknown>> {
  const boundActor = { ...actor, targetFingerprint };
  const scope = { kind: "disposable-test" as const, runUid, parentTargetFingerprint };
  const created = [];
  for (const action of LEGACY_ACTIONS) {
    const execution = await executeLegacyPaymentCommand(pool, buildLegacyPaymentCommand(action), boundActor, scope);
    if (execution.execution_outcome !== "created") throw new Error(`task_20_legacy_first_apply_mismatch:${action}`);
    created.push(execution.receipt);
  }
  const beforeReplay = await identitySequenceDigest(pool);
  for (let index = 0; index < LEGACY_ACTIONS.length; index += 1) {
    const replay = await executeLegacyPaymentCommand(pool, buildLegacyPaymentCommand(LEGACY_ACTIONS[index]), boundActor, scope);
    if (replay.execution_outcome !== "verified_noop" || canonicalJson(replay.receipt as unknown as CanonicalValue) !== canonicalJson(created[index] as unknown as CanonicalValue)) throw new Error(`task_20_legacy_replay_mismatch:${LEGACY_ACTIONS[index]}`);
  }
  const afterReplay = await identitySequenceDigest(pool);
  if (beforeReplay !== afterReplay) throw new Error("task_20_legacy_replay_sequence_changed");
  const receipts = await pool.query<{ operation_uid: string; canonical_payload: CanonicalValue; payload_sha256: string; result_entity_keys: CanonicalValue }>("SELECT operation_uid::text,canonical_payload,payload_sha256,result_entity_keys FROM public.business_operation_receipts WHERE entity_type='legacy_payment' ORDER BY id");
  if (receipts.rowCount !== LEGACY_ACTIONS.length) throw new Error("task_20_legacy_receipt_count_mismatch");
  let slots = 0; let results = 0;
  for (const receipt of receipts.rows) {
    const validated = validateBusinessOperationPayloadV2(receipt.canonical_payload);
    assertBusinessOperationPayloadHash(receipt.canonical_payload, receipt.payload_sha256);
    const payload = receipt.canonical_payload as Record<string, CanonicalValue>;
    if (canonicalJson(payload.expected_results!) !== canonicalJson(receipt.result_entity_keys)) throw new Error("task_20_receipt_result_projection_mismatch");
    const entities = await pool.query<{ ordinal: number; entity_type: string; entity_key: string; entity_action: string; action_correlation_uid: string }>("SELECT ordinal,entity_type,entity_key,entity_action,action_correlation_uid::text FROM public.business_operation_entities WHERE operation_uid=$1::uuid ORDER BY ordinal", [receipt.operation_uid]);
    if (canonicalJson(entities.rows as unknown as CanonicalValue) !== canonicalJson(payload.expected_results!)) throw new Error("task_20_receipt_entity_projection_mismatch");
    const reservationSlots = payload.reservation_slots as CanonicalValue[];
    slots += reservationSlots.length; results += entities.rowCount;
    if (validated.canonical !== canonicalJson(receipt.canonical_payload) || reservationSlots.some((slot) => typeof (slot as Record<string, CanonicalValue>).reserved_id !== "string")) throw new Error("task_20_receipt_payload_storage_mismatch");
  }
  return { operation_receipts: receipts.rowCount, result_entities: results, reservation_slots: slots, replay_identity_sequence_sha256: afterReplay, replay_sequence_unchanged: true, payload_hashes_verified: receipts.rowCount, result_projections_verified: receipts.rowCount };
}

async function expectDefaultInsertRejected(client: PoolClient, table: string, ordinal: number): Promise<string> {
  const savepoint = `task20_probe_${ordinal}`;
  await client.query(`SAVEPOINT ${savepoint}`);
  let observed = "accepted";
  try { await client.query(`INSERT INTO public.${table} DEFAULT VALUES`); }
  catch (error) { observed = errorCode(error); }
  await client.query(`ROLLBACK TO SAVEPOINT ${savepoint}`);
  await client.query(`RELEASE SAVEPOINT ${savepoint}`);
  if (observed !== "23514") throw new Error(`task_20_registry_probe_sqlstate:${table}:${observed}`);
  return observed;
}

async function runProbe(client: PoolClient): Promise<Record<string, unknown>> {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
  try {
    const ledger = await client.query<{ sequence_no: number }>("SELECT sequence_no FROM public.schema_change_ledger ORDER BY sequence_no");
    if (ledger.rows.map((row) => row.sequence_no).join(",") !== "1,10,15,20,30,40,50,60,70,80,90,100,110,120,130") throw new Error("task_20_ledger_mismatch");
    const catalog = await client.query<{ schema_constraints: string[]; schema_triggers: string[]; reason_triggers: string[]; payload_not_null: boolean; payload_checks: string[] }>(`SELECT
      ARRAY(SELECT conname::text FROM pg_catalog.pg_constraint WHERE conrelid='public.schema_data_exceptions'::regclass AND conname LIKE 'schema_data_exceptions__%registry%' OR conrelid='public.schema_data_exceptions'::regclass AND conname IN ('schema_data_exceptions__capture_chain__check','schema_data_exceptions__lifecycle_actor__check','schema_data_exceptions__resolution_duplicate__check','schema_data_exceptions__status_resolution__check') ORDER BY conname)::text[] schema_constraints,
      ARRAY(SELECT tgname::text FROM pg_catalog.pg_trigger WHERE tgrelid='public.schema_data_exceptions'::regclass AND NOT tgisinternal ORDER BY tgname)::text[] schema_triggers,
      ARRAY(SELECT tgname::text FROM pg_catalog.pg_trigger WHERE tgrelid=ANY($1::regclass[]) AND NOT tgisinternal AND tgname LIKE '%business_reason%' ORDER BY tgname)::text[] reason_triggers,
      (SELECT attnotnull FROM pg_catalog.pg_attribute WHERE attrelid='public.business_operation_receipts'::regclass AND attname='canonical_payload') payload_not_null,
      ARRAY(SELECT conname::text FROM pg_catalog.pg_constraint WHERE conrelid='public.business_operation_receipts'::regclass AND conname='business_operation_receipts__canonical_payload__check' ORDER BY conname)::text[] payload_checks`, [BUSINESS_REASON_TABLES.map((table) => `public.${table}`)]);
    const row = catalog.rows[0];
    if (canonicalJson(row.schema_constraints as never) !== canonicalJson([...SCHEMA_CONSTRAINTS] as never) || canonicalJson(row.schema_triggers as never) !== canonicalJson(["schema_data_exceptions__registry_transition_v1"] as never) || row.reason_triggers.length !== 8 || new Set(row.reason_triggers).size !== 8 || row.payload_not_null !== true || canonicalJson(row.payload_checks as never) !== canonicalJson(["business_operation_receipts__canonical_payload__check"] as never)) throw new Error(`task_20_registry_catalog_mismatch:${canonicalJson({ schema_constraints: row.schema_constraints, schema_triggers: row.schema_triggers, reason_trigger_count: row.reason_triggers.length, payload_not_null: row.payload_not_null, payload_checks: row.payload_checks } as never)}`);
    const before = await client.query<{ exceptions: number; reasons: number }>(`SELECT
      (SELECT count(*)::int FROM public.schema_data_exceptions) exceptions,
      (${BUSINESS_REASON_TABLES.map((table) => `(SELECT count(*) FROM public.${table})`).join("+")})::int reasons`);
    const sqlstates: Record<string, string> = {};
    let ordinal = 1;
    for (const table of ["schema_data_exceptions", ...BUSINESS_REASON_TABLES]) sqlstates[table] = await expectDefaultInsertRejected(client, table, ordinal++);
    const after = await client.query<{ exceptions: number; reasons: number }>(`SELECT
      (SELECT count(*)::int FROM public.schema_data_exceptions) exceptions,
      (${BUSINESS_REASON_TABLES.map((table) => `(SELECT count(*) FROM public.${table})`).join("+")})::int reasons`);
    if (canonicalJson(before.rows[0] as never) !== canonicalJson(after.rows[0] as never)) throw new Error("task_20_registry_probe_residue");
    await client.query("ROLLBACK");
    return { ledger_sequences: ledger.rows.map((entry) => entry.sequence_no), schema_constraints: row.schema_constraints.length, schema_triggers: row.schema_triggers.length, business_reason_triggers: row.reason_triggers.length, canonical_payload_not_null: row.payload_not_null, canonical_payload_checks: row.payload_checks.length, rejection_sqlstates: sqlstates, transaction_terminal: "ROLLBACK" };
  } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; }
}

async function main(): Promise<void> {
  if (arg("--target") !== "disposable-test") throw new Error("task_20_target_forbidden");
  const caseName = arg("--case"); if (caseName !== "happy" && caseName !== "failure") throw new Error("task_20_case_invalid");
  const runUid = arg("--run-uid"); const actorReceipt = arg("--actor-receipt");
  const controlResolved = resolveDisposableControlTarget(process.env, runUid); const controlPool = createTargetPool(controlResolved);
  let disposable: Awaited<ReturnType<typeof createOrResumeDisposableTarget>> | undefined;
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...controlResolved, kind: "development" });
    const developmentBefore = await aggregateDigest(controlPool);
    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const actor = await verifyActorReceipt(disposable.pool, actorReceipt, { kind: "disposable-test", targetFingerprint: disposable.targetFingerprint, disposableRunUid: runUid, parentTargetFingerprint: disposable.parentTargetFingerprint });
    const client = await disposable.pool.connect(); let assertions: Record<string, unknown>;
    try { assertions = await runProbe(client); } finally { client.release(); }
    assertions.legacy_receipt_replay = await runLegacyReceiptProbe(disposable.pool, actor, runUid, disposable.targetFingerprint, disposable.parentTargetFingerprint);
    const teardown = await teardownDisposableTarget(controlPool, disposable); disposable = undefined;
    const developmentAfter = await aggregateDigest(controlPool);
    if (!teardown.absent || developmentBefore !== developmentAfter) throw new Error("task_20_teardown_or_development_digest_mismatch");
    console.log(JSON.stringify({ schema_version: "dgkma-task20-disposable-invariants-v1", case: caseName, run_uid: runUid, assertions, development_digest_unchanged: true, teardown, production_operations: 0, result: caseName === "happy" ? "approved" : "rejected" }));
    if (caseName === "failure") process.exitCode = 1;
  } finally { if (disposable) await teardownDisposableTarget(controlPool, disposable).catch(() => undefined); await shutdownPool(controlPool); }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-task20-disposable-invariants-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
