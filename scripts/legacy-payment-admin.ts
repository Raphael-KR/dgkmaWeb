import { writeFileSync } from "node:fs";
import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { buildLegacyPaymentCommand, executeLegacyPaymentCommand } from "../server/accounting/legacy-payment-service";
import { canonicalJson, type CanonicalValue } from "../server/accounting/source-contracts";
import { verifyActorReceipt } from "./admin-actor-receipt";

const ACTOR_RECEIPT_PATH = "docs/database-targets/development-admin-approved.json";
const APPROVED_DEVELOPMENT_ADMIN_USER_ID = 315;
const ACTIONS = ["register_release", "preview", "initialize", "fence", "cutover"] as const;
type Action = typeof ACTIONS[number];

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }

async function main(): Promise<void> {
  if (arg("--target") !== "development") fail("legacy_payment_admin_target_forbidden");
  if (arg("--actor-receipt") !== ACTOR_RECEIPT_PATH) fail("legacy_payment_admin_actor_receipt_path_mismatch");
  const action = arg("--action") as Action; if (!(ACTIONS as readonly string[]).includes(action)) fail("legacy_payment_admin_action_invalid");
  const receiptPath = arg("--receipt"); if (!/^\/tmp\/dgkma-legacy-payment-admin-[0-9a-f-]+\.json$/.test(receiptPath)) fail("legacy_payment_admin_receipt_path_forbidden");
  const resolved = resolveDevelopmentTarget(process.env, "migration"); const pool = createTargetPool(resolved);
  try {
    const target = await verifyDevelopmentTarget(pool, resolved);
    const actor = await verifyActorReceipt(pool, ACTOR_RECEIPT_PATH, { kind: "development", targetFingerprint: target.targetFingerprint, candidateUserId: APPROVED_DEVELOPMENT_ADMIN_USER_ID });
    const execution = await executeLegacyPaymentCommand(pool, buildLegacyPaymentCommand(action), { ...actor, targetFingerprint: target.targetFingerprint });
    writeFileSync(receiptPath, `${canonicalJson(execution as unknown as CanonicalValue)}\n`, { flag: "wx", mode: 0o600 });
    console.log(canonicalJson({ schema_version: "dgkma-legacy-payment-admin-cli-v1", action, execution_outcome: execution.execution_outcome, operation_uid: execution.receipt.operation_uid, phase: execution.receipt.phase, watermark_payment_id: execution.receipt.watermark_payment_id, comparison_digest: execution.receipt.comparison_digest, receipt_sha256: execution.receipt.receipt_sha256, target: "development", result: "verified" } as CanonicalValue));
  } finally { await shutdownPool(pool); }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-legacy-payment-admin-cli-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
