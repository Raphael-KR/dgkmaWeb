import { createHash } from "node:crypto";

export const SOURCE_DECISION_SCHEMA_VERSION = "source-decision-command-v1";
const COMMAND_KEYS = ["decision", "manifestSha256", "operationUid", "replacementDecisionSetUid", "replacementItems", "replacementManifest", "replacementManifestSha256", "schemaVersion", "sourceFingerprint"].sort();
const REPLACEMENT_ITEM_KEYS = ["decisionPayload", "decisionPayloadSha256", "ordinal"].sort();
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function fail(code: string): never { throw new Error(code); }
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(",")}}`;
}
function digest(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }

export type ApprovalContext = {
  sessionUserId: number | null;
  liveUserId: number;
  liveUserUid: string;
  liveIsAdmin: boolean;
  frozenAdminId: number;
  frozenAdminUid: string;
  origin: string | null;
  hostOrigin: string;
  fetchSite: string | null;
  expectedDecisionSetUid: string;
  expectedBatchUid: string;
  expectedManifestSha256: string;
  expectedSourceFingerprint: string;
  expectedItems: Array<{ ordinal: number; coordinateKey: string; sourceContentDigest: string; decisionKind: string }>;
};

export function authorizeSourceDecision(context: ApprovalContext): void {
  if (context.sessionUserId === null || context.sessionUserId !== context.liveUserId) fail("source_decision_unauthenticated");
  if (!context.liveIsAdmin) fail("source_decision_admin_required");
  if (context.liveUserId !== context.frozenAdminId || context.liveUserUid !== context.frozenAdminUid) fail("source_decision_frozen_admin_mismatch");
  if (context.origin !== context.hostOrigin || !["same-origin", "same-site"].includes(context.fetchSite ?? "")) fail("source_decision_cross_origin");
}

export function validateSourceDecisionCommand(command: Record<string, unknown>, context: ApprovalContext) {
  authorizeSourceDecision(context);
  const keys = Object.keys(command).sort();
  if (JSON.stringify(keys) !== JSON.stringify(COMMAND_KEYS)) fail("source_decision_command_keys_mismatch");
  if (command.schemaVersion !== SOURCE_DECISION_SCHEMA_VERSION || command.manifestSha256 !== context.expectedManifestSha256) fail("source_decision_stale_manifest");
  if (command.sourceFingerprint !== context.expectedSourceFingerprint) fail("source_decision_stale_fingerprint");
  if (typeof command.operationUid !== "string" || !UUID_V4.test(command.operationUid)) fail("source_decision_operation_uid_invalid");
  if (!["approve", "reject", "repreview", "supersede"].includes(String(command.decision))) fail("source_decision_unknown_decision");
  const replacement = [command.replacementDecisionSetUid, command.replacementManifest, command.replacementItems, command.replacementManifestSha256];
  if (["approve", "reject"].includes(String(command.decision)) && replacement.some((value) => value !== null)) fail("source_decision_replacement_forbidden");
  if (["repreview", "supersede"].includes(String(command.decision)) && replacement.some((value) => value === null)) fail("source_decision_replacement_required");
  if (["repreview", "supersede"].includes(String(command.decision))) {
    if (typeof command.replacementDecisionSetUid !== "string" || !UUID_V4.test(command.replacementDecisionSetUid) || command.replacementDecisionSetUid === context.expectedDecisionSetUid) fail("source_decision_replacement_uid_invalid");
    if (!Array.isArray(command.replacementItems) || command.replacementItems.length !== context.expectedItems.length) fail("source_decision_item_coverage_mismatch");
    const replacementItems = command.replacementItems as Array<Record<string, unknown>>;
    const manifestItems = replacementItems.map((item, index) => {
      if (JSON.stringify(Object.keys(item).sort()) !== JSON.stringify(REPLACEMENT_ITEM_KEYS)) fail("source_decision_replacement_item_keys_mismatch");
      const expected = context.expectedItems[index];
      if (item.ordinal !== index + 1 || expected?.ordinal !== index + 1) fail("source_decision_item_coverage_mismatch");
      if (typeof item.decisionPayloadSha256 !== "string" || !SHA256.test(item.decisionPayloadSha256) || item.decisionPayloadSha256 !== digest(item.decisionPayload)) fail("source_decision_item_digest_mismatch");
      return { ordinal: expected.ordinal, coordinate_key: expected.coordinateKey, source_content_digest: expected.sourceContentDigest, decision_kind: expected.decisionKind, decision_payload_sha256: item.decisionPayloadSha256 };
    });
    const expectedManifest = { schema_version: "source-decision-preview-v1", batch_uid: context.expectedBatchUid, source_fingerprint: context.expectedSourceFingerprint, items: manifestItems };
    if (canonicalJson(command.replacementManifest) !== canonicalJson(expectedManifest)) fail("source_decision_replacement_manifest_mismatch");
    if (command.replacementManifestSha256 !== digest(expectedManifest)) fail("source_decision_replacement_manifest_digest_mismatch");
  }
  return { operationPayloadSha256: digest(command), decision: command.decision };
}

export function sourceDecisionReceipt(command: Record<string, unknown>, context: ApprovalContext, decidedAt: string) {
  const validated = validateSourceDecisionCommand(command, context);
  const receipt = {
    schema_version: "dgkma-source-decision-approval-v2", operation_uid: command.operationUid,
    manifest_sha256: command.manifestSha256, source_fingerprint: command.sourceFingerprint,
    decision: command.decision, actor_user_id: context.liveUserId, actor_user_uid: context.liveUserUid,
    decided_at: decidedAt, operation_payload_sha256: validated.operationPayloadSha256,
  };
  return { ...receipt, receipt_sha256: digest(receipt) };
}
