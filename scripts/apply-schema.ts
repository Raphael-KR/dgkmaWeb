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
  applyArtifact,
  plannedArtifacts,
  readArtifactDescriptors,
  readManifest,
  selectedArtifacts,
  type BootstrapTarget,
  type CapabilityReceipt,
} from "./schema-ledger";
import { readFileSync } from "node:fs";
import { canonicalJson, sha256 } from "./schema-ledger";

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
  const fromSequence = Number(value("--from-sequence") ?? "1");
  const requestedVariant = value("--capability-variant") ?? "auto";
  const dryRun = present("--dry-run");
  const teardown = present("--teardown");
  const descriptors = readArtifactDescriptors();
  const planned = plannedArtifacts(throughSequence);
  const unavailable = planned.filter((descriptor) => descriptor.materialization_state === "not_materialized");
  if (!dryRun && unavailable.length > 0) fail(`artifact_not_materialized:${unavailable[0].sequence_no}`);
  const manifest = readManifest();

  if (targetKind === "development") {
    if (requestedVariant === "fallback-test") fail("fallback_test_development_forbidden");
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
    if (throughSequence >= 50) {
      const receiptPath = value("--actor-receipt") ?? fail("actor_receipt_required");
      const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
      const receiptHash = receipt.receipt_sha256;
      delete receipt.receipt_sha256;
      if (receiptHash !== sha256(canonicalJson(receipt)) || receipt.schema_version !== "dgkma-disposable-admin-v1" ||
          receipt.target_fingerprint !== target.targetFingerprint || receipt.run_uid !== runUid || receipt.manifest_sha256 !== manifest.sha256) {
        fail("actor_receipt_target_mismatch");
      }
      const liveActor = await disposable.pool.query<{ ok: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM public.users WHERE id=$1 AND user_uid=$2::uuid AND is_admin=true) AS ok",
        [receipt.actor_user_id, receipt.actor_user_uid],
      );
      if (liveActor.rows[0]?.ok !== true) fail("blocked_actor");
    }
    const preferredAvailable = capability.btree_gist_installed || (capability.btree_gist_available && capability.btree_gist_create_privilege);
    if (!["auto","fallback-test","preferred_btree_gist"].includes(requestedVariant)) fail("capability_variant_invalid");
    if (requestedVariant === "preferred_btree_gist" && !preferredAvailable) fail("preferred_btree_gist_unavailable");
    let variant = requestedVariant === "fallback-test" || !preferredAvailable
      ? "deferred_trigger_fallback" as const
      : "preferred_btree_gist" as const;
    if (fromSequence >= 50) {
      const selectedForty = await disposable.pool.query<{ artifact_id: string }>(
        "SELECT artifact_id FROM public.schema_change_ledger WHERE sequence_no=40",
      );
      if (selectedForty.rowCount !== 1) fail("ledger_sequence_40_required");
      variant = selectedForty.rows[0].artifact_id === "accounting-temporal-fallback-v1"
        ? "deferred_trigger_fallback" : "preferred_btree_gist";
    }
    const outcomes: Array<{ sequence_no: number; artifact_id: string; outcome: string }> = [];
    if (fromSequence <= 1 && throughSequence >= 1) {
      const applied = await applySequenceOne(disposable.pool, target, capability as CapabilityReceipt);
      outcomes.push({ sequence_no: 1, artifact_id: "schema-ledger-bootstrap-v1", outcome: applied.outcome });
    }
    const effectiveFrom = Math.max(fromSequence, 10);
    for (const descriptor of selectedArtifacts(effectiveFrom, throughSequence, variant)) {
      const outcome = await applyArtifact(disposable.pool, target, capability as CapabilityReceipt, descriptor, variant);
      outcomes.push({ sequence_no: descriptor.sequence_no, artifact_id: descriptor.artifact_id, outcome });
    }
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
      from_sequence: fromSequence,
      capability_variant: variant,
      outcomes,
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
