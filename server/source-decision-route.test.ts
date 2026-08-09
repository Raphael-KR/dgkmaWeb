import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { sourceDecisionReceipt, validateSourceDecisionCommand } from "./accounting/source-decision-api";

const context = { sessionUserId: 7, liveUserId: 7, liveUserUid: "77777777-7777-4777-8777-777777777777", liveIsAdmin: true, frozenAdminId: 7, frozenAdminUid: "77777777-7777-4777-8777-777777777777", origin: "https://dev.example", hostOrigin: "https://dev.example", fetchSite: "same-origin", expectedSourceFingerprint: "a".repeat(64) };
const command = { schemaVersion: "source-decision-command-v1", operationUid: "12345678-1234-4234-8234-123456789abc", manifestSha256: "24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a", sourceFingerprint: "a".repeat(64), decision: "approve", replacementDecisionSetUid: null, replacementManifest: null, replacementItems: null, replacementManifestSha256: null };

test("source decision requires the frozen same-origin live admin and exact manifest/fingerprint", () => {
  assert.equal(validateSourceDecisionCommand(command, context).decision, "approve");
  for (const changed of [
    { sessionUserId: null }, { liveIsAdmin: false }, { frozenAdminId: 8 }, { origin: "https://evil.example" }, { expectedSourceFingerprint: "b".repeat(64) },
  ]) assert.throws(() => validateSourceDecisionCommand(command, { ...context, ...changed }));
  assert.throws(() => validateSourceDecisionCommand({ ...command, manifestSha256: "0".repeat(64) }, context), /stale_manifest/);
  assert.throws(() => validateSourceDecisionCommand({ ...command, extra: true }, context), /keys_mismatch/);
});

test("approval receipt binds canonical command and actor without source PII", () => {
  const receipt = sourceDecisionReceipt(command, context, "2026-08-10T00:00:00Z");
  assert.match(receipt.receipt_sha256, /^[0-9a-f]{64}$/);
  assert.equal(receipt.actor_user_id, 7);
  assert.equal(JSON.stringify(receipt).includes("name"), false);
});

test("replacement paths require complete ordinal/digest-bound items", () => {
  const payload = { classification: "DUES_INCOME" };
  const payloadDigest = createHash("sha256").update('{"classification":"DUES_INCOME"}').digest("hex");
  const repreview = { ...command, decision: "repreview", replacementDecisionSetUid: "87654321-4321-4321-8321-cba987654321", replacementManifest: { count: 1 }, replacementItems: [{ ordinal: 1, decisionPayload: payload, decisionPayloadSha256: payloadDigest }], replacementManifestSha256: "c".repeat(64) };
  assert.equal(validateSourceDecisionCommand(repreview, context).decision, "repreview");
  assert.throws(() => validateSourceDecisionCommand({ ...repreview, replacementItems: [{ ...repreview.replacementItems[0], ordinal: 2 }] }, context), /coverage_mismatch/);
  assert.throws(() => validateSourceDecisionCommand({ ...repreview, replacementItems: [{ ...repreview.replacementItems[0], decisionPayloadSha256: "0".repeat(64) }] }, context), /digest_mismatch/);
});
