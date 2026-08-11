import assert from "node:assert/strict";
import test from "node:test";
import { buildSourceDecisionAdminCommand, executeSourceDecisionAdminCommand } from "./source-decision-admin-cli";
import type { SourceDecisionReview } from "./source-decision-review";
import type { SourceDecisionActor, SourceDecisionApprovalReceipt } from "./source-decision-service";

const review: SourceDecisionReview = {
  schemaVersion: "source-decision-review-v2",
  decisionSetUid: "55555555-5555-4555-8555-555555555555",
  batchUid: "44444444-4444-4444-8444-444444444444",
  manifestSha256: "a".repeat(64),
  sourceFingerprint: "b".repeat(64),
  status: "previewed",
  items: [
    { ordinal: 1, coordinateKey: "row:1", sourceContentDigest: "c".repeat(64), reviewDisplay: {}, decisionKind: "classification", decisionPayload: { outcome: "quarantine" }, decisionPayloadSha256: "d".repeat(64) },
    { ordinal: 2, coordinateKey: "row:2", sourceContentDigest: "e".repeat(64), reviewDisplay: {}, decisionKind: "period_materialization", decisionPayload: { outcome: "approve" }, decisionPayloadSha256: "f".repeat(64) },
  ],
};
const input = {
  decision: "approve" as const,
  decisionSetUid: review.decisionSetUid,
  expectedManifestSha256: review.manifestSha256,
  expectedSourceFingerprint: review.sourceFingerprint,
  expectedItemCount: 2,
  expectedApproveItems: 1,
  expectedRejectItems: 0,
  expectedQuarantineItems: 1,
  operationUid: "12345678-1234-4234-8234-123456789abc",
};
const actor: SourceDecisionActor = { userId: 7, userUid: "77777777-7777-4777-8777-777777777777", name: "관리자", authorizationVersion: "8".repeat(64), targetFingerprint: "9".repeat(64) };

test("admin CLI builds the exact terminal command accepted by the POST service", () => {
  assert.deepEqual(buildSourceDecisionAdminCommand(review, input), {
    schemaVersion: "source-decision-command-v1",
    operationUid: input.operationUid,
    manifestSha256: review.manifestSha256,
    sourceFingerprint: review.sourceFingerprint,
    decision: "approve",
    replacementDecisionSetUid: null,
    replacementManifest: null,
    replacementItems: null,
    replacementManifestSha256: null,
  });
});

test("admin CLI stops on stale review or changed outcome counts before the executor", async () => {
  let calls = 0;
  const executor = async () => { calls += 1; throw new Error("unexpected"); };
  await assert.rejects(() => executeSourceDecisionAdminCommand(review, { ...input, expectedManifestSha256: "0".repeat(64) }, actor, executor), /review_digest_mismatch/);
  await assert.rejects(() => executeSourceDecisionAdminCommand(review, { ...input, expectedQuarantineItems: 2 }, actor, executor), /outcome_count_mismatch/);
  assert.equal(calls, 0);
});

test("admin CLI delegates once to the same application service and verifies its receipt", async () => {
  let calls = 0;
  const receipt: SourceDecisionApprovalReceipt = {
    schema_version: "dgkma-source-decision-approval-v2", operation_uid: input.operationUid,
    primary_decision_set_uid: review.decisionSetUid, primary_batch_uid: review.batchUid,
    applied_batch_uids: [review.batchUid], approved_decision_set_uids: [review.decisionSetUid],
    manifest_sha256: review.manifestSha256, source_fingerprint: review.sourceFingerprint,
    decision: "approve", replacement_decision_set_uid: null, replacement_manifest_sha256: null,
    actor_user_id: actor.userId, actor_user_uid: actor.userUid, authorization_version: actor.authorizationVersion,
    target_fingerprint: actor.targetFingerprint, decided_at: "2026-08-11T00:00:00.000Z",
    operation_payload_sha256: "1".repeat(64), receipt_sha256: "2".repeat(64),
  };
  const executor = async (decisionSetUid: string, command: Record<string, unknown>, receivedActor: SourceDecisionActor) => {
    calls += 1;
    assert.equal(decisionSetUid, review.decisionSetUid);
    assert.deepEqual(command, buildSourceDecisionAdminCommand(review, input));
    assert.deepEqual(receivedActor, actor);
    return receipt;
  };
  assert.deepEqual(await executeSourceDecisionAdminCommand(review, input, actor, executor), receipt);
  assert.equal(calls, 1);
});
