import {
  closeDisposableTarget, createOrResumeDisposableTarget, createTargetPool, resolveDisposableControlTarget,
  shutdownPool, verifyDevelopmentTarget,
} from "../server/db-target";
import { verifyActorReceipt } from "./admin-actor-receipt";

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }

async function main(): Promise<void> {
  if (arg("--target") !== "disposable-test") fail("legacy_baseline_target_forbidden");
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
    const ledger = await disposable.pool.query<{ sequence_no: number }>("SELECT sequence_no FROM public.schema_change_ledger ORDER BY sequence_no");
    if (JSON.stringify(ledger.rows.map((row) => row.sequence_no)) !== JSON.stringify([1,10,15,20,30,40,50])) fail("legacy_baseline_sequence_boundary_mismatch");
    const source = await disposable.pool.query<{ id: string }>("SELECT id::text FROM public.accounting_logical_sources WHERE source_code='LEGACY_PAYMENTS'");
    if (source.rowCount !== 1) fail("legacy_baseline_source_missing");
    const rows = [
      ["11111111-1111-4111-8111-111111111111", "legacy-payment-row-v1", "1.0.0", "2026-08-08T00:00:00Z", "1", "2", "3", "4", "11111111-1111-4111-8111-111111111112"],
      ["22222222-2222-4222-8222-222222222222", "legacy-payment-row-v2", "2.0.0", "2026-08-09T00:00:00Z", "5", "6", "7", "8", "22222222-2222-4222-8222-222222222223"],
    ] as const;
    let created = 0;
    for (const [releaseUid, adapterCode, adapterVersion, releasedAt, schema, implementation, mapping, approval, correlationUid] of rows) {
      const result = await disposable.pool.query(`
        INSERT INTO public.accounting_source_releases
          (release_uid,logical_source_id,adapter_code,adapter_version,normalized_schema_sha256,
           normalization_implementation_sha256,mapping_table_sha256,mapping_approval_receipt_sha256,
           released_at,status,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
           recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
        VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,'active',$10,$11::uuid,$12,
                'migration_admin',$9::timestamptz,$13::uuid,$14)
        ON CONFLICT (release_uid) DO NOTHING
      `, [releaseUid, source.rows[0].id, adapterCode, adapterVersion, schema.repeat(64), implementation.repeat(64), mapping.repeat(64), approval.repeat(64), releasedAt, actor.userId, actor.userUid, actor.name, correlationUid, actor.authorizationVersion]);
      created += result.rowCount ?? 0;
    }
    const versions = await disposable.pool.query<{ versions: string[] }>(`
      SELECT array_agg(adapter_version ORDER BY adapter_version) AS versions
      FROM public.accounting_source_releases WHERE logical_source_id=$1
    `, [source.rows[0].id]);
    if (JSON.stringify(versions.rows[0]?.versions) !== JSON.stringify(["1.0.0","2.0.0"])) fail("legacy_baseline_version_mismatch");
    console.log(JSON.stringify({ schema_version: "dgkma-legacy-disposable-baseline-v1", created, versions: versions.rows[0].versions, result: created === 2 ? "created" : "verified_noop" }));
  } finally {
    if (disposable) await closeDisposableTarget(controlPool, disposable);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-legacy-disposable-baseline-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
