import { writeFileSync } from "node:fs";
import {
  createTargetPool,
  resolveDevelopmentTarget,
  shutdownPool,
  verifyDevelopmentTarget,
} from "../server/db-target";
import {
  executeSourceDecisionAdminCommand,
  type SourceDecisionAdminCommandInput,
} from "../server/accounting/source-decision-admin-cli";
import { readSourceDecisionReview } from "../server/accounting/source-decision-review";
import { decideSourcePreview } from "../server/accounting/source-decision-service";
import { canonicalJson, type CanonicalValue } from "../server/accounting/source-contracts";
import { verifyActorReceipt } from "./admin-actor-receipt";

const ACTOR_RECEIPT_PATH = "docs/database-targets/development-admin-approved.json";
const APPROVED_DEVELOPMENT_ADMIN_USER_ID = 315;

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
function count(name: string): number { const parsed = Number(arg(name)); if (!Number.isSafeInteger(parsed) || parsed < 0) fail(`invalid_count:${name}`); return parsed; }

async function main(): Promise<void> {
  if (arg("--target") !== "development") fail("source_decision_admin_target_forbidden");
  const actorReceiptPath = arg("--actor-receipt");
  if (actorReceiptPath !== ACTOR_RECEIPT_PATH) fail("source_decision_admin_actor_receipt_path_mismatch");
  const receiptPath = arg("--receipt");
  if (!/^\/tmp\/dgkma-source-decision-admin-[0-9a-f-]+\.json$/.test(receiptPath)) {
    fail("source_decision_admin_receipt_path_forbidden");
  }
  const input: SourceDecisionAdminCommandInput = {
    decision: arg("--decision") as SourceDecisionAdminCommandInput["decision"],
    decisionSetUid: arg("--decision-set-uid"),
    expectedManifestSha256: arg("--expected-manifest-sha256"),
    expectedSourceFingerprint: arg("--expected-source-fingerprint"),
    expectedItemCount: count("--expected-items"),
    expectedApproveItems: count("--expected-approve-items"),
    expectedRejectItems: count("--expected-reject-items"),
    expectedQuarantineItems: count("--expected-quarantine-items"),
    operationUid: arg("--operation-uid"),
  };
  if (!(["approve", "reject"] as string[]).includes(input.decision)) fail("source_decision_admin_decision_unsupported");
  const resolved = resolveDevelopmentTarget(process.env, "migration");
  const pool = createTargetPool(resolved);
  try {
    const target = await verifyDevelopmentTarget(pool, resolved);
    const verified = await verifyActorReceipt(pool, actorReceiptPath, {
      kind: "development",
      targetFingerprint: target.targetFingerprint,
      candidateUserId: APPROVED_DEVELOPMENT_ADMIN_USER_ID,
    });
    const review = await readSourceDecisionReview(pool, input.decisionSetUid);
    if (!review) fail("source_decision_admin_review_missing");
    const receipt = await executeSourceDecisionAdminCommand(
      review,
      input,
      { ...verified, targetFingerprint: target.targetFingerprint },
      (decisionSetUid, command, actor) => decideSourcePreview(pool, decisionSetUid, command, actor),
    );
    writeFileSync(receiptPath, `${canonicalJson(receipt as unknown as CanonicalValue)}\n`, { flag: "wx", mode: 0o600 });
    console.log(canonicalJson({
      schema_version: "dgkma-source-decision-admin-cli-v1",
      operation_uid: receipt.operation_uid,
      primary_decision_set_uid: receipt.primary_decision_set_uid,
      primary_batch_uid: receipt.primary_batch_uid,
      applied_batch_count: receipt.applied_batch_uids.length,
      approved_decision_set_count: receipt.approved_decision_set_uids.length,
      decision: receipt.decision,
      receipt_sha256: receipt.receipt_sha256,
      target: "development",
      result: "approved",
    } as CanonicalValue));
  } finally {
    await shutdownPool(pool);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    schema_version: "dgkma-source-decision-admin-cli-error-v1",
    error_code: error instanceof Error ? error.message : "unknown",
    operation_uid: process.argv.includes("--operation-uid") ? process.argv[process.argv.indexOf("--operation-uid") + 1] : null,
    result: "rejected",
  }));
  process.exitCode = 1;
});
