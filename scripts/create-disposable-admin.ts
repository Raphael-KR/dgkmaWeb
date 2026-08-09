import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import {
  createOrResumeDisposableTarget, createTargetPool, resolveDisposableControlTarget,
  shutdownPool, verifyDevelopmentTarget,
} from "../server/db-target";
import { canonicalJson, readManifest, sha256 } from "./schema-ledger";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`);
  return process.argv[index + 1];
}

async function main() {
  if (arg("--target") !== "disposable-test") throw new Error("disposable_admin_target_forbidden");
  const runUid = arg("--run-uid");
  const receiptPath = arg("--receipt");
  const controlResolved = resolveDisposableControlTarget(process.env, runUid);
  const controlPool = createTargetPool(controlResolved);
  let disposable: Awaited<ReturnType<typeof createOrResumeDisposableTarget>> | undefined;
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...controlResolved, kind: "development" });
    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const ledger = await disposable.pool.query<{ release_uid: string; artifact_sha256: string }>(`
      SELECT r.release_uid::text, l.artifact_sha256 FROM public.schema_change_ledger l
      JOIN public.schema_release_runs r ON r.id=l.release_run_id
      WHERE l.sequence_no=40 AND r.state='verified'
    `);
    if (ledger.rowCount !== 1) throw new Error("disposable_admin_sequence_40_required");
    const actorUid = randomUUID();
    const actor = await disposable.pool.query<{ id: number; user_uid: string; name: string }>(`
      INSERT INTO public.users (user_uid,email,name,is_verified,is_admin)
      VALUES ($1,$2,'Disposable migration admin',true,true)
      ON CONFLICT (email) DO UPDATE SET is_admin=true
      RETURNING id,user_uid::text,name
    `, [actorUid, `synthetic-${runUid}@invalid.example`]);
    const manifest = readManifest();
    const body: any = {
      schema_version: "dgkma-disposable-admin-v1", target_kind: "disposable-test", run_uid: runUid,
      target_fingerprint: disposable.targetFingerprint, through_40_release_uid: ledger.rows[0].release_uid,
      through_40_artifact_sha256: ledger.rows[0].artifact_sha256, actor_user_id: actor.rows[0].id,
      actor_user_uid: actor.rows[0].user_uid, actor_name_snapshot: actor.rows[0].name,
      actor_scope: "migration_admin", authorization_version: sha256(`${manifest.sha256}\n${ledger.rows[0].artifact_sha256}`),
      manifest_sha256: manifest.sha256, observed_at: new Date().toISOString(),
    };
    body.receipt_sha256 = sha256(canonicalJson(body));
    writeFileSync(receiptPath, `${canonicalJson(body)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ schema_version: body.schema_version, target_fingerprint: body.target_fingerprint, actor_user_id: body.actor_user_id, receipt_sha256: body.receipt_sha256, result: "approved" }));
  } finally {
    if (disposable && !disposable.poolClosed) await shutdownPool(disposable.pool);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-disposable-admin-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
