import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  createOrResumeDisposableTarget, createTargetPool, resolveDisposableControlTarget,
  shutdownPool, teardownDisposableTarget, verifyDevelopmentTarget,
} from "../server/db-target";
import { canonicalJson, sha256 } from "../server/accounting/source-contracts";
import type { CanonicalValue } from "../server/accounting/source-contracts";
import { assertBusinessOperationPayloadHash, validateBusinessOperationPayloadV2 } from "../server/accounting/business-operation-payload";
import { buildLegacyPaymentCommand, executeLegacyPaymentCommand } from "../server/accounting/legacy-payment-service";
import { materializeAnnualPolicyActivation } from "../server/accounting/annual-policy-activation-write";
import { executeAnnualPolicyActivationOperation } from "../server/accounting/annual-policy-activation-service";
import { executeReceiptRefundOperation } from "../server/accounting/receipt-refund-service";
import { verifyActorReceipt } from "./admin-actor-receipt";
import { seedLegacyNonzeroFixture } from "./verify-legacy-payment-nonzero-disposable";

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
    (SELECT count(*)::int FROM public.dues_policies) dues_policies,
    (SELECT count(*)::int FROM public.dues_position_tier_mappings) dues_mappings,
    (SELECT count(*)::int FROM public.economic_events) economic_events,
    (SELECT count(*)::int FROM public.bank_reconciliations) reconciliations`);
  return sha256(canonicalJson(result.rows[0] as never));
}

async function annualActivationCounts(pool: Pool): Promise<{ policies: number; mappings: number; brokenBindings: number }> {
  const result = await pool.query<{ policies: number; mappings: number; broken_bindings: number }>(`SELECT
    (SELECT count(*)::int FROM public.dues_policies WHERE dues_year=2026 AND version=2) policies,
    (SELECT count(*)::int FROM public.dues_position_tier_mappings WHERE dues_year=2026 AND version=2) mappings,
    (SELECT count(*)::int FROM public.dues_position_tier_mappings mapping
      LEFT JOIN public.dues_policies policy ON policy.id=mapping.policy_id
      WHERE mapping.dues_year=2026 AND mapping.version=2
        AND ((mapping.adds_obligation AND (policy.id IS NULL OR policy.dues_year<>2026 OR policy.version<>2 OR policy.status<>'approved' OR policy.tier_code<>mapping.tier_code))
          OR (NOT mapping.adds_obligation AND mapping.policy_id IS NOT NULL))) broken_bindings`);
  return { policies: result.rows[0].policies, mappings: result.rows[0].mappings, brokenBindings: result.rows[0].broken_bindings };
}

async function runAnnualActivationProbe(
  pool: Pool,
  actor: Awaited<ReturnType<typeof verifyActorReceipt>>,
  targetFingerprint: string,
): Promise<Record<string, unknown>> {
  const before = await annualActivationCounts(pool);
  if (before.policies !== 0 || before.mappings !== 0 || before.brokenBindings !== 0) throw new Error("task_20_annual_activation_preexisting_successor");
  const input = { duesYear: 2026, effectiveAt: "2026-01-01T00:00:00+09:00", resolutionRef: "todo20-synthetic-annual-activation", actor };

  const failureClient = await pool.connect();
  let failureCode = "none";
  try {
    await failureClient.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await failureClient.query(`CREATE FUNCTION pg_temp.task20_fail_mapping() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'task20_synthetic_mapping_failure'; END $$`);
    await failureClient.query(`CREATE TRIGGER task20_fail_mapping BEFORE INSERT ON public.dues_position_tier_mappings FOR EACH ROW WHEN (NEW.version=2) EXECUTE FUNCTION pg_temp.task20_fail_mapping()`);
    try { await materializeAnnualPolicyActivation(failureClient, input); }
    catch (error) { failureCode = error instanceof Error ? error.message : "unknown"; }
    await failureClient.query("ROLLBACK");
  } finally { failureClient.release(); }
  if (!failureCode.includes("task20_synthetic_mapping_failure")) throw new Error(`task_20_annual_activation_failure_fixture_mismatch:${failureCode}`);
  const afterFailure = await annualActivationCounts(pool);
  if (canonicalJson(afterFailure as never) !== canonicalJson(before as never)) throw new Error("task_20_annual_activation_failure_residue");

  const operationUid = randomUUID();
  const command = {
    schemaVersion: "annual-policy-activation-command-v1" as const,
    operationUid,
    duesYear: input.duesYear,
    effectiveAt: input.effectiveAt,
    resolutionRef: input.resolutionRef,
  };
  const boundActor = { ...actor, targetFingerprint };
  const created = await executeAnnualPolicyActivationOperation(pool, command, boundActor);
  if (created.executionOutcome !== "created" || created.resultCount !== 30) throw new Error("task_20_annual_activation_first_apply_mismatch");
  const after = await annualActivationCounts(pool);
  if (after.policies !== 6 || after.mappings !== 24 || after.brokenBindings !== 0) throw new Error("task_20_annual_activation_result_mismatch");

  const stored = await pool.query<{ canonical_payload: CanonicalValue; payload_sha256: string; result_entity_keys: CanonicalValue; entities: number; audits: number }>(`SELECT
    receipt.canonical_payload,receipt.payload_sha256,receipt.result_entity_keys,
    (SELECT count(*)::int FROM public.business_operation_entities entity WHERE entity.operation_uid=receipt.operation_uid) entities,
    (SELECT count(*)::int FROM public.accounting_audit_events audit JOIN public.business_operation_entities entity
      ON entity.action_correlation_uid=audit.correlation_uid WHERE entity.operation_uid=receipt.operation_uid) audits
    FROM public.business_operation_receipts receipt
    WHERE receipt.operation_uid=$1::uuid AND receipt.entity_type='annual_policy_activation'`, [operationUid]);
  if (stored.rowCount !== 1 || stored.rows[0].entities !== 30 || stored.rows[0].audits !== 30) throw new Error("task_20_annual_activation_tail_count_mismatch");
  const validated = validateBusinessOperationPayloadV2(stored.rows[0].canonical_payload);
  assertBusinessOperationPayloadHash(stored.rows[0].canonical_payload, stored.rows[0].payload_sha256);
  const payload = stored.rows[0].canonical_payload as Record<string, CanonicalValue>;
  if (validated.sha256 !== created.payloadSha256 || canonicalJson(payload.expected_results!) !== canonicalJson(stored.rows[0].result_entity_keys)) throw new Error("task_20_annual_activation_receipt_mismatch");
  const entities = await pool.query<{ ordinal: number; entity_type: string; entity_key: string; entity_action: string; action_correlation_uid: string }>(
    "SELECT ordinal,entity_type,entity_key,entity_action,action_correlation_uid::text FROM public.business_operation_entities WHERE operation_uid=$1::uuid ORDER BY ordinal",
    [operationUid],
  );
  if (
    canonicalJson(entities.rows as unknown as CanonicalValue) !== canonicalJson(payload.expected_results!) ||
    entities.rows.slice(0, 6).some((entry) => entry.entity_type !== "dues_policy") ||
    entities.rows.slice(6).some((entry) => entry.entity_type !== "dues_position_tier_mapping")
  ) throw new Error("task_20_annual_activation_result_order_mismatch");

  const beforeReplay = await identitySequenceDigest(pool);
  const replay = await executeAnnualPolicyActivationOperation(pool, command, boundActor);
  const afterReplay = await identitySequenceDigest(pool);
  if (replay.executionOutcome !== "verified_noop" || replay.payloadSha256 !== created.payloadSha256 || replay.resultCount !== 30 || beforeReplay !== afterReplay) throw new Error("task_20_annual_activation_replay_mismatch");
  const afterReplayCounts = await annualActivationCounts(pool);
  if (canonicalJson(afterReplayCounts as never) !== canonicalJson(after as never)) throw new Error("task_20_annual_activation_replay_residue");
  return {
    failure_code: "task20_synthetic_mapping_failure",
    failure_zero_residue: true,
    first_apply: created.executionOutcome,
    replay: replay.executionOutcome,
    operation_receipts: stored.rowCount,
    result_entities: stored.rows[0].entities,
    audits: stored.rows[0].audits,
    policies_created: after.policies,
    mappings_created: after.mappings,
    broken_policy_bindings: after.brokenBindings,
    policy_before_mapping: true,
    replay_identity_sequence_sha256: afterReplay,
    replay_sequence_unchanged: true,
    payload_hash_verified: true,
  };
}

async function identitySequenceDigest(pool: Pool): Promise<string> {
  const rows = await pool.query<{ sequence_name: string; last_value: string }>("SELECT sequencename sequence_name,last_value::text FROM pg_catalog.pg_sequences WHERE schemaname='public' ORDER BY sequencename");
  return sha256(canonicalJson(rows.rows as unknown as CanonicalValue));
}

async function runReceiptRefundProbe(
  pool: Pool,
  actor: Awaited<ReturnType<typeof verifyActorReceipt>>,
  runUid: string,
  targetFingerprint: string,
): Promise<Record<string, unknown>> {
  const payerEmail = `legacy-payer-${sha256(runUid).slice(0, 20)}@invalid.example`;
  await pool.query("INSERT INTO public.users (email,name,is_verified,is_admin,kakao_sync_enabled) VALUES ($1,'Legacy Fixture Payer',true,false,false)", [payerEmail]);
  const fixture = await seedLegacyNonzeroFixture(pool, actor);
  const occurredAt = "2026-03-15T12:00:00+09:00";
  const sourceBinding = await pool.query<{ logical_source_id: string; batch_id: string }>(`SELECT coordinate.logical_source_id::text,row_version.batch_id::text
    FROM public.accounting_import_coordinates coordinate JOIN public.accounting_import_row_versions row_version
      ON row_version.coordinate_id=coordinate.id WHERE coordinate.id=$1 AND row_version.id=$2`,
  [fixture.coordinateId, fixture.sourceRowVersionId]);
  if (sourceBinding.rowCount !== 1) throw new Error("task_20_refund_source_binding_missing");
  const refundCoordinate = await pool.query<{ id: string }>(`INSERT INTO public.accounting_import_coordinates
    (coordinate_key,coordinate_normalization_version,logical_source_id,recorded_actor_at,recorded_actor_authorization_version,
     recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id)
    VALUES ($1,'coordinate-v1',$2,$3::timestamptz,$4,$5::uuid,$6,'migration_admin',$7::uuid,$8) RETURNING id::text`,
  [`fixture:refund:${runUid}`, sourceBinding.rows[0].logical_source_id, occurredAt, actor.authorizationVersion, randomUUID(), actor.name, actor.userUid, actor.userId]);
  const refundPayload = { fixture: "refund-event" };
  const refundRowVersion = await pool.query<{ id: string }>(`INSERT INTO public.accounting_import_row_versions
    (batch_id,content_digest,coordinate_id,issue_status,normalization_version,normalized_payload,raw_payload,recorded_actor_at,
     recorded_actor_authorization_version,recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,
     recorded_actor_uid_snapshot,recorded_actor_user_id,recorded_at,source_display_snapshot,supersedes_id,version)
    VALUES ($1,$2,$3,'accepted','fixture-v1',$4::jsonb,$4::jsonb,$5::timestamptz,$6,$7::uuid,$8,'migration_admin',$9::uuid,$10,
      $5::timestamptz,'fixture-refund',NULL,1) RETURNING id::text`,
  [sourceBinding.rows[0].batch_id, sha256(canonicalJson(refundPayload)), refundCoordinate.rows[0].id, canonicalJson(refundPayload), occurredAt,
    actor.authorizationVersion, randomUUID(), actor.name, actor.userUid, actor.userId]);
  await pool.query(`INSERT INTO public.accounting_import_batch_rows
    (batch_id,coordinate_id,ordinal,recorded_actor_at,recorded_actor_authorization_version,recorded_actor_correlation_uid,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,recorded_actor_user_id,row_version_id)
    VALUES ($1,$2,2,$3::timestamptz,$4,$5::uuid,$6,'migration_admin',$7::uuid,$8,$9)`,
  [sourceBinding.rows[0].batch_id, refundCoordinate.rows[0].id, occurredAt, actor.authorizationVersion, randomUUID(), actor.name,
    actor.userUid, actor.userId, refundRowVersion.rows[0].id]);
  const refundEventUid = randomUUID();
  const refundEvent = await pool.query<{ id: string }>(`INSERT INTO public.economic_events
    (amount,direction,dues_year,event_kind,event_uid,occurred_at,recorded_actor_at,recorded_actor_authorization_version,
     recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,
     recorded_actor_user_id,reverses_event_id,status)
    VALUES (50000,'debit',2026,'bank',$1::uuid,$2::timestamptz,$2::timestamptz,$3,$4::uuid,$5,'admin',$6::uuid,$7,$8,'proposed') RETURNING id::text`,
  [refundEventUid, occurredAt, actor.authorizationVersion, randomUUID(), actor.name, actor.userUid, actor.userId, fixture.originalEventId]);
  const refundEventId = refundEvent.rows[0].id;
  await pool.query(`INSERT INTO public.economic_event_claims
    (amount,candidate_key,claim_actor_at,claim_actor_authorization_version,claim_actor_correlation_uid,claim_actor_name_snapshot,
     claim_actor_scope,claim_actor_uid_snapshot,claim_actor_user_id,claim_uid,coordinate_id,created_at,decision_actor_at,
     decision_actor_authorization_version,decision_actor_correlation_uid,decision_actor_name_snapshot,decision_actor_scope,
     decision_actor_uid_snapshot,decision_actor_user_id,direction,dues_year,effective_at,event_id,event_party_id,member_id,
     occurred_date_kst,party_kind,source_row_version_id,state,supersedes_id,version)
    VALUES (50000,$1,$2::timestamptz,$3,$4::uuid,$5,'admin',$6::uuid,$7,$8::uuid,$9,$2::timestamptz,$2::timestamptz,$3,
      $10::uuid,$5,'admin',$6::uuid,$7,'debit',2026,$2::timestamptz,$11,NULL,$12,'2026-03-15','member',$13,'bound',NULL,1)`,
  [sha256(`refund-candidate:${runUid}`), occurredAt, actor.authorizationVersion, randomUUID(), actor.name, actor.userUid,
    actor.userId, randomUUID(), refundCoordinate.rows[0].id, randomUUID(), refundEventId, fixture.memberId, refundRowVersion.rows[0].id]);
  const account = await pool.query<{ id: string }>("SELECT id::text FROM public.bank_accounts ORDER BY id LIMIT 1");
  if (account.rowCount !== 1) throw new Error("task_20_refund_bank_account_missing");
  await pool.query(`INSERT INTO public.bank_transactions
    (account_id,balance_after,event_id,occurred_at,posted_date,recorded_actor_at,recorded_actor_authorization_version,
     recorded_actor_correlation_uid,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_uid_snapshot,
     recorded_actor_user_id,row_fingerprint,source_row_version_id)
    VALUES ($1,0,$2,$3::timestamptz,'2026-03-15',$3::timestamptz,$4,$5::uuid,$6,'admin',$7::uuid,$8,$9,$10)`,
  [account.rows[0].id, refundEventId, occurredAt, actor.authorizationVersion, randomUUID(), actor.name, actor.userUid,
    actor.userId, sha256(`refund-bank-row:${runUid}`), refundRowVersion.rows[0].id]);

  const boundActor = { ...actor, targetFingerprint };
  const failureCommand = {
    schemaVersion: "receipt-refund-command-v1" as const,
    operationUid: randomUUID(),
    refundEventUid,
    receiptUid: fixture.receiptUid,
    originalAllocationRequestUids: [fixture.originalAllocationRequestUid],
    newAllocationRequestUids: [randomUUID()],
    correctionReasonCode: null,
    correctionEvidenceSha256: null,
    correctionEvidenceVerified: false,
  };
  await pool.query(`CREATE FUNCTION public.task20_fail_refund_allocation_v1() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'task20_synthetic_refund_allocation_failure'; END $$`);
  await pool.query(`CREATE TRIGGER task20_fail_refund_allocation_v1 BEFORE INSERT ON public.dues_allocations
    FOR EACH ROW WHEN (NEW.effect_kind='refund') EXECUTE FUNCTION public.task20_fail_refund_allocation_v1()`);
  let failureCode = "none";
  try { await executeReceiptRefundOperation(pool, failureCommand, boundActor); }
  catch (error) { failureCode = error instanceof Error ? error.message : "unknown"; }
  await pool.query("DROP TRIGGER task20_fail_refund_allocation_v1 ON public.dues_allocations");
  await pool.query("DROP FUNCTION public.task20_fail_refund_allocation_v1()");
  if (!failureCode.includes("task20_synthetic_refund_allocation_failure")) throw new Error(`task_20_refund_failure_fixture_mismatch:${failureCode}`);
  const failureResidue = await pool.query<{ receipts: number; reversals: number; allocations: number; audits: number }>(`SELECT
    (SELECT count(*)::int FROM public.business_operation_receipts WHERE operation_uid=$1::uuid) receipts,
    (SELECT count(*)::int FROM public.dues_receipt_reversals WHERE refund_event_id=$2) reversals,
    (SELECT count(*)::int FROM public.dues_allocations WHERE request_uid=$3::uuid) allocations,
    (SELECT count(*)::int FROM public.accounting_audit_events audit JOIN public.business_operation_entities entity
      ON entity.action_correlation_uid=audit.correlation_uid WHERE entity.operation_uid=$1::uuid) audits`,
  [failureCommand.operationUid, refundEventId, failureCommand.newAllocationRequestUids[0]]);
  if (canonicalJson(failureResidue.rows[0] as unknown as CanonicalValue) !== canonicalJson({ receipts: 0, reversals: 0, allocations: 0, audits: 0 })) throw new Error("task_20_refund_failure_residue");

  const command = { ...failureCommand, operationUid: randomUUID(), newAllocationRequestUids: [randomUUID()] };
  const created = await executeReceiptRefundOperation(pool, command, boundActor);
  if (created.executionOutcome !== "created" || created.resultCount !== 2) throw new Error("task_20_refund_first_apply_mismatch");
  const stored = await pool.query<{ canonical_payload: CanonicalValue; payload_sha256: string; result_entity_keys: CanonicalValue; entities: number; audits: number; reversals: number; allocations: number; effective_at: string; rights_effect_mode: string }>(`SELECT
    receipt.canonical_payload,receipt.payload_sha256,receipt.result_entity_keys,
    (SELECT count(*)::int FROM public.business_operation_entities entity WHERE entity.operation_uid=receipt.operation_uid) entities,
    (SELECT count(*)::int FROM public.accounting_audit_events audit JOIN public.business_operation_entities entity
      ON entity.action_correlation_uid=audit.correlation_uid WHERE entity.operation_uid=receipt.operation_uid) audits,
    (SELECT count(*)::int FROM public.dues_receipt_reversals WHERE refund_event_id=$2 AND status='approved') reversals,
    (SELECT count(*)::int FROM public.dues_allocations WHERE request_uid=$3::uuid AND status='approved') allocations,
    (SELECT effective_at::text FROM public.dues_allocations WHERE request_uid=$3::uuid) effective_at,
    (SELECT rights_effect_mode FROM public.dues_allocations WHERE request_uid=$3::uuid) rights_effect_mode
    FROM public.business_operation_receipts receipt WHERE receipt.operation_uid=$1::uuid AND receipt.entity_type='receipt_refund'`,
  [command.operationUid, refundEventId, command.newAllocationRequestUids[0]]);
  const state = stored.rows[0];
  if (stored.rowCount !== 1 || state.entities !== 2 || state.audits !== 2 || state.reversals !== 1 || state.allocations !== 1 || state.rights_effect_mode !== "next_month_negative" || !state.effective_at.startsWith("2026-04-01 00:00:00+09")) throw new Error(`task_20_refund_result_mismatch:${canonicalJson(state as unknown as CanonicalValue)}`);
  assertBusinessOperationPayloadHash(state.canonical_payload, state.payload_sha256);
  const payload = state.canonical_payload as Record<string, CanonicalValue>;
  if (validateBusinessOperationPayloadV2(state.canonical_payload).sha256 !== created.payloadSha256 || canonicalJson(payload.expected_results!) !== canonicalJson(state.result_entity_keys)) throw new Error("task_20_refund_receipt_mismatch");
  const beforeReplay = await identitySequenceDigest(pool);
  const replay = await executeReceiptRefundOperation(pool, command, boundActor);
  const afterReplay = await identitySequenceDigest(pool);
  if (replay.executionOutcome !== "verified_noop" || replay.payloadSha256 !== created.payloadSha256 || replay.resultCount !== 2 || beforeReplay !== afterReplay) throw new Error("task_20_refund_replay_mismatch");
  return {
    failure_code: "task20_synthetic_refund_allocation_failure",
    failure_zero_residue: true,
    first_apply: created.executionOutcome,
    replay: replay.executionOutcome,
    operation_receipts: stored.rowCount,
    result_entities: state.entities,
    audits: state.audits,
    reversals_created: state.reversals,
    allocations_created: state.allocations,
    effective_at: "2026-04-01T00:00:00+09:00",
    rights_effect_mode: state.rights_effect_mode,
    payload_hash_verified: true,
    replay_identity_sequence_sha256: afterReplay,
    replay_sequence_unchanged: true,
  };
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
    assertions.annual_activation = await runAnnualActivationProbe(disposable.pool, actor, disposable.targetFingerprint);
    assertions.receipt_refund = await runReceiptRefundProbe(disposable.pool, actor, runUid, disposable.targetFingerprint);
    const teardown = await teardownDisposableTarget(controlPool, disposable); disposable = undefined;
    const developmentAfter = await aggregateDigest(controlPool);
    if (!teardown.absent || developmentBefore !== developmentAfter) throw new Error("task_20_teardown_or_development_digest_mismatch");
    console.log(JSON.stringify({ schema_version: "dgkma-task20-disposable-invariants-v1", case: caseName, run_uid: runUid, assertions, development_digest_unchanged: true, teardown, production_operations: 0, result: caseName === "happy" ? "approved" : "rejected" }));
    if (caseName === "failure") process.exitCode = 1;
  } finally { if (disposable) await teardownDisposableTarget(controlPool, disposable).catch(() => undefined); await shutdownPool(controlPool); }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-task20-disposable-invariants-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
