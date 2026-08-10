import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { readSourceDecisionReview } from "../server/accounting/source-decision-review";

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }

async function main() {
  if (arg("--target") !== "development") fail("source_decision_review_verifier_scope_mismatch");
  const decisionSetUid = arg("--decision-set-uid"); const expectedItems = Number(arg("--expected-items"));
  if (!Number.isSafeInteger(expectedItems) || expectedItems < 0) fail("source_decision_review_expected_items_invalid");
  const resolved = resolveDevelopmentTarget(process.env, "migration"); const pool = createTargetPool(resolved);
  try {
    const target = await verifyDevelopmentTarget(pool, resolved); const review = await readSourceDecisionReview(pool, decisionSetUid);
    if (!review || review.status !== "previewed" || review.items.length !== expectedItems) fail("source_decision_review_live_mismatch");
    console.log(JSON.stringify({ schema_version: "source-decision-review-verification-v2", target: "development", target_fingerprint: target.targetFingerprint, decision_set_uid: review.decisionSetUid, batch_uid: review.batchUid, manifest_sha256: review.manifestSha256, source_fingerprint: review.sourceFingerprint, status: review.status, item_count: review.items.length, terminal_transaction: "ROLLBACK", result: "verified" }));
  } finally { await shutdownPool(pool); }
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "source-decision-review-verification-error-v2", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
