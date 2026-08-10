import {
  createOrResumeDisposableTarget,
  closeDisposableTarget,
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
  type MigrationActor,
} from "./schema-ledger";
import { verifyActorReceipt } from "./admin-actor-receipt";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

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

function requireCommittedReceipt(receiptPath: string): void {
  let committed: Buffer;
  try {
    execFileSync("git", ["ls-files", "--error-unmatch", receiptPath], { stdio: "ignore" });
    committed = execFileSync("git", ["show", `HEAD:${receiptPath}`]);
  } catch {
    fail("development_actor_receipt_not_committed");
  }
  if (!committed.equals(readFileSync(receiptPath))) fail("development_actor_receipt_worktree_drift");
}

async function main(): Promise<void> {
  const targetKind = value("--target");
  if (targetKind !== "development" && targetKind !== "disposable-test") fail("apply_schema_target_invalid");
  const throughSequence = Number(value("--through-sequence") ?? "1");
  const fromSequence = Number(value("--from-sequence") ?? "1");
  const requestedVariant = value("--capability-variant") ?? "auto";
  const dryRun = present("--dry-run");
  const teardown = present("--teardown");
  const interruptSequence = Number(value("--interrupt-before-commit-sequence") ?? "0");
  const descriptors = readArtifactDescriptors();
  const planned = plannedArtifacts(throughSequence);
  const unavailable = planned.filter((descriptor) => descriptor.materialization_state === "not_materialized");
  if (!dryRun && unavailable.length > 0) fail(`artifact_not_materialized:${unavailable[0].sequence_no}`);
  const manifest = readManifest();

  if (targetKind === "development") {
    if (interruptSequence !== 0) fail("development_interrupt_fixture_forbidden");
    if (requestedVariant === "fallback-test") fail("fallback_test_development_forbidden");
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
      if (dryRun) {
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
        return;
      }
      const target: BootstrapTarget = {
        kind: "development",
        targetFingerprint: verified.targetFingerprint,
        parentTargetFingerprint: null,
        runUid: null,
        currentDatabase: verified.currentDatabase,
        currentUser: verified.currentUser,
        currentUserOid: verified.currentUserOid,
        serverVersionNum: verified.serverVersionNum,
        applicationName: resolved.applicationName,
      };
      let actor: MigrationActor | undefined;
      if (fromSequence <= 50 && throughSequence >= 50) {
        const receiptPath = value("--actor-receipt") ?? fail("actor_receipt_required");
        requireCommittedReceipt(receiptPath);
        actor = await verifyActorReceipt(pool, receiptPath, {
          kind: "development",
          targetFingerprint: verified.targetFingerprint,
          candidateUserId: 315,
        });
      }
      const preferredAvailable = capability.btree_gist_installed ||
        (capability.btree_gist_available && capability.btree_gist_create_privilege);
      if (!["auto", "preferred_btree_gist"].includes(requestedVariant)) fail("capability_variant_invalid");
      if (requestedVariant === "preferred_btree_gist" && !preferredAvailable) fail("preferred_btree_gist_unavailable");
      let variant = preferredAvailable ? "preferred_btree_gist" as const : "deferred_trigger_fallback" as const;
      if (fromSequence >= 50) {
        const selectedForty = await pool.query<{ artifact_id: string }>(
          "SELECT artifact_id FROM public.schema_change_ledger WHERE sequence_no=40",
        );
        if (selectedForty.rowCount !== 1) fail("ledger_sequence_40_required");
        variant = selectedForty.rows[0].artifact_id === "accounting-temporal-fallback-v1"
          ? "deferred_trigger_fallback" : "preferred_btree_gist";
      }
      const outcomes: Array<{ sequence_no: number; artifact_id: string; outcome: string }> = [];
      if (fromSequence <= 1 && throughSequence >= 1) {
        const applied = await applySequenceOne(pool, target, capability as CapabilityReceipt);
        outcomes.push({ sequence_no: 1, artifact_id: "schema-ledger-bootstrap-v1", outcome: applied.outcome });
      }
      const effectiveFrom = Math.max(fromSequence, 10);
      for (const descriptor of selectedArtifacts(effectiveFrom, throughSequence, variant)) {
        const outcome = await applyArtifact(
          pool,
          target,
          capability as CapabilityReceipt,
          descriptor,
          variant,
          descriptor.sequence_no === 50 ? actor : undefined,
          false,
        );
        outcomes.push({ sequence_no: descriptor.sequence_no, artifact_id: descriptor.artifact_id, outcome });
      }
      console.log(JSON.stringify({
        schema_version: "dgkma-schema-apply-result-v1",
        target: "development",
        target_fingerprint: verified.targetFingerprint,
        manifest_sha256: manifest.sha256,
        through_sequence: throughSequence,
        from_sequence: fromSequence,
        capability_variant: variant,
        outcomes,
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
    let actor: MigrationActor | undefined;
    if (fromSequence <= 50 && throughSequence >= 50) {
      const receiptPath = value("--actor-receipt") ?? fail("actor_receipt_required");
      actor = await verifyActorReceipt(disposable.pool, receiptPath, {
        kind: "disposable-test",
        targetFingerprint: target.targetFingerprint,
        disposableRunUid: runUid,
        parentTargetFingerprint: target.parentTargetFingerprint!,
      });
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
      const outcome = await applyArtifact(
        disposable.pool,
        target,
        capability as CapabilityReceipt,
        descriptor,
        variant,
        descriptor.sequence_no === 50 ? actor : undefined,
        descriptor.sequence_no === interruptSequence,
      );
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
    else if (disposable) await closeDisposableTarget(controlPool, disposable);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "apply_schema_unknown_error";
  console.error(JSON.stringify({ schema_version: "dgkma-schema-apply-error-v1", error_code: message, result: "rejected" }));
  process.exitCode = 1;
});
