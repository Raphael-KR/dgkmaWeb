import type { SourceDecisionReview } from "./source-decision-review";
import type { SourceDecisionActor, SourceDecisionApprovalReceipt } from "./source-decision-service";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export type SourceDecisionTerminalDecision = "approve" | "reject";

export type SourceDecisionAdminCommandInput = {
  decision: SourceDecisionTerminalDecision;
  decisionSetUid: string;
  expectedManifestSha256: string;
  expectedSourceFingerprint: string;
  expectedItemCount: number;
  expectedApproveItems: number;
  expectedRejectItems: number;
  expectedQuarantineItems: number;
  operationUid: string;
};

function fail(code: string): never {
  throw new Error(code);
}

export function buildSourceDecisionAdminCommand(
  review: SourceDecisionReview,
  input: SourceDecisionAdminCommandInput,
): Record<string, unknown> {
  if (!UUID_V4.test(input.decisionSetUid) || !UUID_V4.test(input.operationUid)) {
    fail("source_decision_admin_cli_uid_invalid");
  }
  if (!SHA256.test(input.expectedManifestSha256) || !SHA256.test(input.expectedSourceFingerprint)) {
    fail("source_decision_admin_cli_digest_invalid");
  }
  const replayStatus = input.decision === "approve" ? "approved" : "rejected";
  if (!["previewed", replayStatus].includes(review.status) || review.decisionSetUid !== input.decisionSetUid) {
    fail("source_decision_admin_cli_review_state_mismatch");
  }
  if (
    review.manifestSha256 !== input.expectedManifestSha256 ||
    review.sourceFingerprint !== input.expectedSourceFingerprint
  ) {
    fail("source_decision_admin_cli_review_digest_mismatch");
  }
  const counts = review.items.reduce(
    (result, item) => {
      const outcome = item.decisionPayload.outcome;
      if (outcome === "approve") result.approve += 1;
      else if (outcome === "reject") result.reject += 1;
      else if (outcome === "quarantine") result.quarantine += 1;
      else fail("source_decision_admin_cli_outcome_invalid");
      return result;
    },
    { approve: 0, reject: 0, quarantine: 0 },
  );
  if (
    review.items.length !== input.expectedItemCount ||
    counts.approve !== input.expectedApproveItems ||
    counts.reject !== input.expectedRejectItems ||
    counts.quarantine !== input.expectedQuarantineItems ||
    counts.approve + counts.reject + counts.quarantine !== review.items.length
  ) {
    fail("source_decision_admin_cli_outcome_count_mismatch");
  }
  return {
    schemaVersion: "source-decision-command-v1",
    operationUid: input.operationUid,
    manifestSha256: review.manifestSha256,
    sourceFingerprint: review.sourceFingerprint,
    decision: input.decision,
    replacementDecisionSetUid: null,
    replacementManifest: null,
    replacementItems: null,
    replacementManifestSha256: null,
  };
}

export async function executeSourceDecisionAdminCommand(
  review: SourceDecisionReview,
  input: SourceDecisionAdminCommandInput,
  actor: SourceDecisionActor,
  executor: (
    decisionSetUid: string,
    command: Record<string, unknown>,
    actor: SourceDecisionActor,
  ) => Promise<SourceDecisionApprovalReceipt>,
): Promise<SourceDecisionApprovalReceipt> {
  const command = buildSourceDecisionAdminCommand(review, input);
  const receipt = await executor(review.decisionSetUid, command, actor);
  if (
    receipt.primary_decision_set_uid !== review.decisionSetUid ||
    receipt.primary_batch_uid !== review.batchUid ||
    receipt.manifest_sha256 !== review.manifestSha256 ||
    receipt.source_fingerprint !== review.sourceFingerprint ||
    receipt.operation_uid !== input.operationUid ||
    receipt.decision !== input.decision ||
    receipt.actor_user_id !== actor.userId ||
    receipt.actor_user_uid !== actor.userUid ||
    receipt.authorization_version !== actor.authorizationVersion ||
    receipt.target_fingerprint !== actor.targetFingerprint
  ) {
    fail("source_decision_admin_cli_receipt_mismatch");
  }
  return receipt;
}
