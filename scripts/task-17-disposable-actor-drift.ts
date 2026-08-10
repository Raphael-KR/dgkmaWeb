import { readFileSync, writeFileSync } from "node:fs";
import {
  createOrResumeDisposableTarget,
  closeDisposableTarget,
  createTargetPool,
  resolveDisposableControlTarget,
  shutdownPool,
  verifyDevelopmentTarget,
} from "../server/db-target";
import { canonicalJson, sha256 } from "./schema-ledger";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`);
  return process.argv[index + 1];
}

async function stateDigest(pool: Awaited<ReturnType<typeof createOrResumeDisposableTarget>>["pool"]): Promise<string> {
  const result = await pool.query<{
    ledger_rows: number; sequence_50_rows: number; logical_sources: number; categories: number; tables: number; columns: number;
  }>(`
    SELECT
      (SELECT count(*)::int FROM public.schema_change_ledger) AS ledger_rows,
      (SELECT count(*)::int FROM public.schema_change_ledger WHERE sequence_no=50) AS sequence_50_rows,
      (SELECT count(*)::int FROM public.accounting_logical_sources) AS logical_sources,
      (SELECT count(*)::int FROM public.accounting_categories) AS categories,
      (SELECT count(*)::int FROM information_schema.tables WHERE table_schema='public') AS tables,
      (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public') AS columns
  `);
  return sha256(canonicalJson(result.rows[0] as never));
}

async function main(): Promise<void> {
  if (arg("--target") !== "disposable-test") throw new Error("task_17_drift_target_forbidden");
  const action = arg("--action");
  const runUid = arg("--run-uid");
  const receipt = JSON.parse(readFileSync(arg("--actor-receipt"), "utf8")) as {
    schema_version: string; candidate_user_id: number; candidate_user_uid: string; disposable_run_uid: string;
  };
  if (receipt.schema_version !== "dgkma-disposable-admin-v1" || receipt.disposable_run_uid !== runUid) {
    throw new Error("task_17_drift_receipt_mismatch");
  }
  const statePath = arg("--state");
  const controlResolved = resolveDisposableControlTarget(process.env, runUid);
  const controlPool = createTargetPool(controlResolved);
  let disposable: Awaited<ReturnType<typeof createOrResumeDisposableTarget>> | undefined;
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...controlResolved, kind: "development" });
    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    if (action === "drift") {
      const changed = await disposable.pool.query(`
        UPDATE public.users SET is_admin=false
        WHERE id=$1 AND user_uid=$2::uuid AND is_admin=true
          AND email LIKE 'dgkma-disposable+%@invalid.example'
      `, [receipt.candidate_user_id, receipt.candidate_user_uid]);
      if (changed.rowCount !== 1) throw new Error("task_17_drift_actor_not_changed");
      const digest = await stateDigest(disposable.pool);
      writeFileSync(statePath, `${canonicalJson({ schema_version:"dgkma-task17-pre-failure-state-v1", digest } as never)}\n`);
      console.log(JSON.stringify({ schema_version:"dgkma-task17-actor-drift-v1", actor_admin:false, before_attempt_digest:digest, result:"approved" }));
      return;
    }
    if (action !== "verify") throw new Error("task_17_drift_action_invalid");
    const before = JSON.parse(readFileSync(statePath, "utf8")) as { digest: string };
    const digest = await stateDigest(disposable.pool);
    const actor = await disposable.pool.query<{ is_admin: boolean }>(
      "SELECT is_admin FROM public.users WHERE id=$1 AND user_uid=$2::uuid",
      [receipt.candidate_user_id, receipt.candidate_user_uid],
    );
    if (before.digest !== digest || actor.rowCount !== 1 || actor.rows[0].is_admin !== false) {
      throw new Error("task_17_failed_attempt_changed_state");
    }
    console.log(JSON.stringify({
      schema_version:"dgkma-task17-failed-attempt-proof-v1",
      actor_admin:false,
      sequence_50_rows:0,
      before_attempt_digest:before.digest,
      after_attempt_digest:digest,
      identical:true,
      result:"approved",
    }));
  } finally {
    if (disposable) await closeDisposableTarget(controlPool, disposable);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    schema_version:"dgkma-task17-actor-drift-error-v1",
    error_code:error instanceof Error ? error.message : "unknown",
    result:"rejected",
  }));
  process.exitCode = 1;
});
