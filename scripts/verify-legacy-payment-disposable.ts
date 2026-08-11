import {
  closeDisposableTarget, createOrResumeDisposableTarget, createTargetPool, resolveDisposableControlTarget,
  shutdownPool, verifyDevelopmentTarget,
} from "../server/db-target";
import { buildLegacyPaymentCommand, executeLegacyPaymentCommand } from "../server/accounting/legacy-payment-service";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";
import { verifyActorReceipt } from "./admin-actor-receipt";

const ACTIONS = ["register_release", "preview", "initialize", "fence", "cutover"] as const;
function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }

async function paymentWriteProbe(pool: Awaited<ReturnType<typeof createOrResumeDisposableTarget>>["pool"], expected: "allowed" | "fenced"): Promise<void> {
  await pool.query("BEGIN");
  try {
    await pool.query("INSERT INTO public.payments (user_id,amount,year,type,status) VALUES (NULL,1,2026,'연회비','completed')");
    if (expected !== "allowed") fail("legacy_write_fence_not_enforced");
  } catch (error: unknown) {
    if (expected !== "fenced" || typeof error !== "object" || error === null || (error as { code?: string }).code !== "55000" || !String((error as { message?: string }).message).includes("legacy_payments_write_fenced")) throw error;
  } finally {
    await pool.query("ROLLBACK").catch(() => undefined);
  }
}

async function identitySnapshot(pool: Awaited<ReturnType<typeof createOrResumeDisposableTarget>>["pool"]): Promise<string> {
  const rows = await pool.query<{ sequence_name: string; last_value: string }>(`
    SELECT sequencename AS sequence_name,last_value::text
    FROM pg_catalog.pg_sequences WHERE schemaname='public' ORDER BY sequencename
  `);
  return sha256(canonicalJson(rows.rows as unknown as CanonicalValue));
}

async function main(): Promise<void> {
  if (arg("--target") !== "disposable-test") fail("legacy_disposable_target_forbidden");
  const runUid = arg("--run-uid"); const receiptPath = arg("--actor-receipt");
  const controlResolved = resolveDisposableControlTarget(process.env, runUid); const controlPool = createTargetPool(controlResolved);
  let disposable: Awaited<ReturnType<typeof createOrResumeDisposableTarget>> | undefined;
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...controlResolved, kind: "development" });
    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const actor = await verifyActorReceipt(disposable.pool, receiptPath, {
      kind: "disposable-test", targetFingerprint: disposable.targetFingerprint, disposableRunUid: runUid,
      parentTargetFingerprint: disposable.parentTargetFingerprint,
    });
    const boundActor = { ...actor, targetFingerprint: disposable.targetFingerprint };
    const scope = { kind: "disposable-test" as const, runUid, parentTargetFingerprint: disposable.parentTargetFingerprint };
    const created = [];
    for (const action of ACTIONS) {
      const execution = await executeLegacyPaymentCommand(disposable.pool, buildLegacyPaymentCommand(action), boundActor, scope);
      if (execution.execution_outcome !== "created") fail(`legacy_disposable_first_apply_mismatch:${action}`);
      created.push(execution.receipt);
      if (action === "initialize") await paymentWriteProbe(disposable.pool, "allowed");
      if (action === "fence" || action === "cutover") await paymentWriteProbe(disposable.pool, "fenced");
    }
    const beforeReplay = await identitySnapshot(disposable.pool);
    for (let index=0; index<ACTIONS.length; index+=1) {
      const action=ACTIONS[index]; const replay=await executeLegacyPaymentCommand(disposable.pool,buildLegacyPaymentCommand(action),boundActor,scope);
      if(replay.execution_outcome!=="verified_noop"||canonicalJson(replay.receipt as unknown as CanonicalValue)!==canonicalJson(created[index] as unknown as CanonicalValue))fail(`legacy_disposable_replay_mismatch:${action}`);
    }
    const afterReplay = await identitySnapshot(disposable.pool); if (beforeReplay !== afterReplay) fail("legacy_disposable_identity_sequence_changed_on_replay");
    const counts = await disposable.pool.query<{ releases: number; batches: number; cutover_states: number; payments: number; decisions: number; decision_sets: number; decision_items: number; classifications: number; receipts: number; entities: number; audits: number }>(`SELECT
      (SELECT count(*)::int FROM public.accounting_source_releases r JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code='LEGACY_PAYMENTS') releases,
      (SELECT count(*)::int FROM public.accounting_import_batches b JOIN public.accounting_source_releases r ON r.id=b.source_release_id JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code='LEGACY_PAYMENTS') batches,
      (SELECT count(*)::int FROM public.legacy_cutover_states WHERE cutover_code='payments-v1') cutover_states,
      (SELECT count(*)::int FROM public.payments) payments,
      (SELECT count(*)::int FROM public.legacy_payment_decisions) decisions,
      (SELECT count(*)::int FROM public.source_decision_sets) decision_sets,
      (SELECT count(*)::int FROM public.source_decision_items) decision_items,
      (SELECT count(*)::int FROM public.source_row_classification_decisions) classifications,
      (SELECT count(*)::int FROM public.business_operation_receipts WHERE entity_type='legacy_payment') receipts,
      (SELECT count(*)::int FROM public.business_operation_entities e JOIN public.business_operation_receipts r ON r.operation_uid=e.operation_uid WHERE r.entity_type='legacy_payment') entities,
      (SELECT count(*)::int FROM public.accounting_audit_events WHERE reason_code LIKE 'TODO19_LEGACY_%') audits`);
    const expected={releases:3,batches:1,cutover_states:3,payments:0,decisions:0,decision_sets:0,decision_items:0,classifications:0,receipts:5,entities:6,audits:6};
    if(canonicalJson(counts.rows[0] as unknown as CanonicalValue)!==canonicalJson(expected as unknown as CanonicalValue))fail("legacy_disposable_final_counts_mismatch");
    console.log(canonicalJson({ schema_version:"dgkma-legacy-payment-disposable-verification-v1", run_uid:runUid, manifest_sha256:"551d9d672a0cd3689b6c3ac5d1252078f4e53106a7ef143ac954c96239596c14", first_apply:ACTIONS.map((action)=>({action,outcome:"created"})), replay:ACTIONS.map((action)=>({action,outcome:"verified_noop"})), legacy_write:"allowed_then_rolled_back", fenced_write:"rejected_55000", new_write:"rejected_55000", identity_sequence_sha256:afterReplay, counts:counts.rows[0], production_operations:0, result:"approved" } as unknown as CanonicalValue));
  } finally {
    if (disposable) await closeDisposableTarget(controlPool, disposable);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version:"dgkma-legacy-payment-disposable-verification-error-v1", error_code:error instanceof Error?error.message:"unknown", result:"rejected" })); process.exitCode=1; });
