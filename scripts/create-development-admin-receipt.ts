import { writeFileSync } from "node:fs";
import {
  createTargetPool,
  resolveDevelopmentTarget,
  shutdownPool,
  verifyDevelopmentTarget,
} from "../server/db-target";
import { buildActorReceipt, serializeActorReceipt } from "./admin-actor-receipt";

const RECEIPT_PATH = "docs/database-targets/development-admin-approved.json";
const APPROVED_CANDIDATE_USER_ID = 315;

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`);
  return process.argv[index + 1];
}

async function main(): Promise<void> {
  if (arg("--target") !== "development") throw new Error("development_admin_target_forbidden");
  const candidateUserId = Number(arg("--candidate-user-id"));
  const receiptPath = arg("--receipt");
  if (candidateUserId !== APPROVED_CANDIDATE_USER_ID) throw new Error("development_admin_candidate_mismatch");
  if (receiptPath !== RECEIPT_PATH) throw new Error("development_admin_receipt_path_mismatch");
  const resolved = resolveDevelopmentTarget(process.env, "migration");
  const pool = createTargetPool(resolved);
  try {
    const development = await verifyDevelopmentTarget(pool, resolved);
    await pool.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    let receipt;
    try {
      receipt = await buildActorReceipt(pool, {
        kind: "development",
        targetFingerprint: development.targetFingerprint,
        candidateUserId,
      });
    } finally {
      await pool.query("ROLLBACK");
    }
    writeFileSync(receiptPath, serializeActorReceipt(receipt), { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({
      schema_version: receipt.schema_version,
      target_fingerprint: receipt.target_fingerprint,
      candidate_user_id: receipt.candidate_user_id,
      through_40_release_uid: receipt.through_40_release_uid,
      observed_ledger_sha256: receipt.observed_ledger_sha256,
      receipt_sha256: receipt.receipt_sha256,
      database_writes: 0,
      transaction_terminal: "ROLLBACK",
      result: "approved",
    }));
  } finally {
    await shutdownPool(pool);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    schema_version: "dgkma-development-admin-error-v1",
    error_code: error instanceof Error ? error.message : "unknown",
    result: "rejected",
  }));
  process.exitCode = 1;
});
