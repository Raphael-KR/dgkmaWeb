import { writeFileSync } from "node:fs";
import {
  closeDisposableTarget, createOrResumeDisposableTarget, createTargetPool, resolveDisposableControlTarget,
  shutdownPool, verifyDevelopmentTarget,
} from "../server/db-target";
import { sha256 } from "./schema-ledger";
import { buildActorReceipt, serializeActorReceipt } from "./admin-actor-receipt";

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
    const email = `dgkma-disposable+${sha256(runUid).slice(0, 20)}@invalid.example`;
    await disposable.pool.query(`
      INSERT INTO public.users
        (kakao_id,email,name,graduation_year,is_verified,is_admin,kakao_sync_enabled,profile_image,phone_number)
      VALUES (NULL,$1,'Disposable Migration Admin',NULL,true,true,false,NULL,NULL)
      ON CONFLICT (email) DO NOTHING
    `, [email]);
    const actor = await disposable.pool.query<{ id: number }>(`
      SELECT id FROM public.users
      WHERE email=$1 AND name='Disposable Migration Admin' AND kakao_id IS NULL
        AND graduation_year IS NULL AND is_verified=true AND is_admin=true
        AND kakao_sync_enabled=false AND profile_image IS NULL AND phone_number IS NULL
    `, [email]);
    if (actor.rowCount !== 1) throw new Error("blocked_actor");
    const receipt = await buildActorReceipt(disposable.pool, {
      kind: "disposable-test",
      targetFingerprint: disposable.targetFingerprint,
      candidateUserId: actor.rows[0].id,
      disposableRunUid: runUid,
      parentTargetFingerprint: disposable.parentTargetFingerprint,
    });
    writeFileSync(receiptPath, serializeActorReceipt(receipt), { mode: 0o600 });
    console.log(JSON.stringify({
      schema_version: receipt.schema_version,
      target_fingerprint: receipt.target_fingerprint,
      candidate_user_id: receipt.candidate_user_id,
      receipt_sha256: receipt.receipt_sha256,
      result: "approved",
    }));
  } finally {
    if (disposable) await closeDisposableTarget(controlPool, disposable);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-disposable-admin-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
