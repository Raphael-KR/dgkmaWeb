import {
  createOrResumeDisposableTarget,
  createTargetPool,
  resolveDevelopmentTarget,
  resolveDisposableControlTarget,
  runRollbackPrivilegeProbes,
  shutdownPool,
  teardownDisposableTarget,
  verifyDevelopmentTarget,
} from "../server/db-target";
import {
  applySequenceOne,
  plannedArtifacts,
  readArtifactDescriptors,
  readManifest,
  type BootstrapTarget,
  type CapabilityReceipt,
} from "./schema-ledger";

function value(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index === -1 ? undefined : process.argv[index + 1];
}

function present(flag: string): boolean {
  return process.argv.includes(flag);
}

function fail(code: string): never {
  throw new Error(code);
}

async function main(): Promise<void> {
  const targetKind = value("--target");
  if (targetKind !== "development" && targetKind !== "disposable-test") fail("apply_schema_target_invalid");
  const throughSequence = Number(value("--through-sequence") ?? "1");
  const dryRun = present("--dry-run");
  const teardown = present("--teardown");
  const descriptors = readArtifactDescriptors();
  const planned = plannedArtifacts(throughSequence);
  const unavailable = planned.filter((descriptor) => descriptor.materialization_state === "not_materialized");
  if (!dryRun && unavailable.length > 0) fail(`artifact_not_materialized:${unavailable[0].sequence_no}`);
  const manifest = readManifest();

  if (targetKind === "development") {
    if (!dryRun) fail("apply_schema_development_write_not_authorized_in_todo_2");
    if (teardown) fail("apply_schema_development_teardown_forbidden");
    const resolved = resolveDevelopmentTarget(process.env, "migration");
    const pool = createTargetPool(resolved);
    try {
      const verified = await verifyDevelopmentTarget(pool, resolved);
      const capability = await runRollbackPrivilegeProbes(pool, {
        kind: "development",
        targetFingerprint: verified.targetFingerprint,
        serverVersionNum: verified.serverVersionNum,
        currentUser: verified.currentUser,
        currentUserOid: verified.currentUserOid,
        parentTargetFingerprint: null,
        runUid: null,
      });
      console.log(JSON.stringify({
        schema_version: "dgkma-schema-apply-preview-v1",
        target: "development",
        target_fingerprint: verified.targetFingerprint,
        manifest_sha256: manifest.sha256,
        through_sequence: throughSequence,
        materialized_sequences: [...new Set(planned.filter((entry) => entry.materialization_state === "materialized").map((entry) => entry.sequence_no))],
        not_materialized_sequences: [...new Set(planned.filter((entry) => entry.materialization_state === "not_materialized").map((entry) => entry.sequence_no))],
        capability_receipt_sha256: capability.receipt_sha256,
        schema_writes: 0,
        result: "approved",
      }));
    } finally {
      await shutdownPool(pool);
    }
    return;
  }

  if (dryRun) fail("apply_schema_disposable_dry_run_not_a_real_apply");
  const runUid = value("--run-uid") ?? fail("apply_schema_run_uid_required");
  const controlResolved = resolveDisposableControlTarget(process.env, runUid);
  const controlPool = createTargetPool(controlResolved);
  let disposable: Awaited<ReturnType<typeof createOrResumeDisposableTarget>> | undefined;
  let teardownCompleted = false;
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...controlResolved, kind: "development" });
    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const capability = await runRollbackPrivilegeProbes(disposable.pool, {
      kind: "disposable-test",
      targetFingerprint: disposable.targetFingerprint,
      serverVersionNum: disposable.serverVersionNum,
      currentUser: disposable.currentUser,
      currentUserOid: disposable.currentUserOid,
      parentTargetFingerprint: disposable.parentTargetFingerprint,
      runUid: disposable.runUid,
    });
    const target: BootstrapTarget = {
      kind: "disposable-test",
      targetFingerprint: disposable.targetFingerprint,
      parentTargetFingerprint: disposable.parentTargetFingerprint,
      runUid: disposable.runUid,
      currentDatabase: disposable.databaseName,
      currentUser: disposable.currentUser,
      currentUserOid: disposable.currentUserOid,
      serverVersionNum: disposable.serverVersionNum,
      applicationName: disposable.applicationName,
    };
    const applied = await applySequenceOne(disposable.pool, target, capability as CapabilityReceipt);
    const catalog = await disposable.pool.query<{ ledger_rows: number; verified_runs: number; capability_rows: number }>(`
      SELECT (SELECT count(*)::int FROM public.schema_change_ledger) AS ledger_rows,
             (SELECT count(*)::int FROM public.schema_release_runs WHERE state='verified') AS verified_runs,
             (SELECT count(*)::int FROM public.schema_capability_receipts) AS capability_rows
    `);
    const cleanup = teardown ? await teardownDisposableTarget(controlPool, disposable) : null;
    teardownCompleted = cleanup?.absent === true;
    console.log(JSON.stringify({
      schema_version: "dgkma-schema-apply-result-v1",
      target: "disposable-test",
      run_uid: runUid,
      target_fingerprint: disposable.targetFingerprint,
      manifest_sha256: manifest.sha256,
      descriptor_count: descriptors.length,
      through_sequence: throughSequence,
      outcome: applied.outcome,
      release_uid: applied.releaseUid,
      catalog: catalog.rows[0],
      cleanup,
      result: "approved",
    }));
  } finally {
    if (disposable && teardown && !teardownCompleted) await teardownDisposableTarget(controlPool, disposable);
    else if (disposable && !disposable.poolClosed) {
      await shutdownPool(disposable.pool);
      disposable.poolClosed = true;
    }
    await shutdownPool(controlPool);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "apply_schema_unknown_error";
  console.error(JSON.stringify({ schema_version: "dgkma-schema-apply-error-v1", error_code: message, result: "rejected" }));
  process.exitCode = 1;
});
