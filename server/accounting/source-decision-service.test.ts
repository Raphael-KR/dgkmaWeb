import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import { decideSourcePreview, type SourceDecisionActor } from "./source-decision-service";

const primaryUid = "55555555-5555-4555-8555-555555555555";
const batchUid = "44444444-4444-4444-8444-444444444444";
const fingerprint = "a".repeat(64);
const defaultPayloadSha = sha256(canonicalJson({ outcome: "quarantine" }));
const defaultManifest = { schema_version: "source-decision-preview-v1", batch_uid: batchUid, source_fingerprint: fingerprint, items: [{ ordinal: 1, coordinate_key: "row:1", source_content_digest: "b".repeat(64), decision_kind: "classification", decision_payload_sha256: defaultPayloadSha }] };
const manifestSha = sha256(canonicalJson(defaultManifest as CanonicalValue));
const actor: SourceDecisionActor = { userId: 7, userUid: "77777777-7777-4777-8777-777777777777", name: "관리자", authorizationVersion: "8".repeat(64), targetFingerprint: "7".repeat(64) };
const baseCommand = { schemaVersion: "source-decision-command-v1", operationUid: randomUUID(), manifestSha256: manifestSha, sourceFingerprint: fingerprint, decision: "reject", replacementDecisionSetUid: null, replacementManifest: null, replacementItems: null, replacementManifestSha256: null };
const quarantineClassification = { allocation_request_uid_or_null: null, category_splits: [], classification_kind: "pending_manual_source_decision", direction: "credit", dues_year_or_null: null, event_kind: "unclassified_credit", event_party_uid_or_null: null, group_roster_batch_uid_or_null: null, member_uid_or_null: null, outcome: "quarantine", party_kind: "unknown", receipt_uid_or_null: null, refund_receipt_uid_or_null: null, reverses_event_uid_or_null: null };

function fakePool(outcome = "quarantine", decisionKind = "classification", decisionPayload: Record<string, unknown> = { outcome }, sourceCode = "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK") {
  let status = "previewed"; let nextId = 100; const sql: string[] = [];
  const decisionPayloadSha256 = sha256(canonicalJson(decisionPayload));
  const manifest = { schema_version: "source-decision-preview-v1", batch_uid: batchUid, source_fingerprint: fingerprint, items: [{ ordinal: 1, coordinate_key: "row:1", source_content_digest: "b".repeat(64), decision_kind: decisionKind, decision_payload_sha256: decisionPayloadSha256 }] };
  const liveManifestSha = sha256(canonicalJson(manifest as CanonicalValue));
  const batchManifest = [{ coordinate_key: "row:1", content_digest: "b".repeat(64), issue_status: "accepted" }];
  const client = {
    async query(text: string) {
      sql.push(text);
      if (text.includes("FROM public.business_operation_receipts WHERE operation_uid")) return { rowCount: 0, rows: [] };
      if (text.includes("FROM public.users WHERE id")) return { rowCount: 1, rows: [{ id: 7, user_uid: actor.userUid, is_admin: true, name: actor.name }] };
      if (text.includes("FROM public.source_decision_sets ds JOIN public.accounting_import_batches")) return { rowCount: 1, rows: [{ id: "10", decision_set_uid: primaryUid, batch_id: "20", batch_uid: batchUid, batch_preview_manifest: batchManifest, batch_preview_manifest_sha256: sha256(canonicalJson(batchManifest as CanonicalValue)), row_count: 1, manifest, manifest_sha256: liveManifestSha, source_fingerprint: fingerprint, status, source_code: sourceCode }] };
      if (text.includes("FROM public.accounting_import_batch_rows br")) return { rowCount: 1, rows: [{ ordinal: 1, coordinate_key: "row:1", content_digest: "b".repeat(64), issue_status: "accepted" }] };
      if (text.includes("FROM public.source_decision_items i JOIN public.accounting_import_coordinates")) return { rowCount: 1, rows: [{ id: "30", ordinal: 1, coordinate_id: "40", coordinate_key: "row:1", source_row_version_id: "50", content_digest: "b".repeat(64), normalized_payload: { boundary_content_digest: decisionPayload.boundary_content_digest }, decision_kind: decisionKind, decision_payload: decisionPayload, decision_payload_sha256: decisionPayloadSha256 }] };
      if (text.includes("FROM public.accounting_import_row_versions rv JOIN public.accounting_import_coordinates")) return { rowCount: 1, rows: [{ id: "51" }] };
      if (text.includes("SELECT 1 FROM public.accounting_periods WHERE period_code")) return { rowCount: 0, rows: [] };
      if (text.includes("AS descendant_count")) return { rowCount: 1, rows: [{ descendant_count: 0 }] };
      if (text.includes("nextval(pg_get_serial_sequence")) return { rowCount: 1, rows: [{ id: String(nextId++) }] };
      if (text.includes("SELECT 1 FROM public.source_decision_sets WHERE decision_set_uid")) return { rowCount: 0, rows: [] };
      if (text.includes("UPDATE public.source_decision_sets SET status='rejected'")) status = "rejected";
      if (text.includes("UPDATE public.source_decision_sets SET status='approved'")) status = "approved";
      if (text.includes("UPDATE public.source_decision_sets SET status='superseded'")) status = "superseded";
      return { rowCount: 1, rows: [] };
    },
    release() {},
  };
  return { pool: { connect: async () => client }, sql, status: () => status, batchManifest, manifest, manifestSha: liveManifestSha };
}

test("reject then full-byte repreview keeps applied arrays empty and uses one transaction each", async () => {
  const fake = fakePool();
  const rejected = await decideSourcePreview(fake.pool as never, primaryUid, baseCommand, actor);
  assert.equal(rejected.decision, "reject"); assert.deepEqual(rejected.applied_batch_uids, []); assert.equal(fake.status(), "rejected");
  const payload = quarantineClassification; const payloadSha = sha256(canonicalJson(payload));
  const manifest = { schema_version: "source-decision-preview-v1", batch_uid: batchUid, source_fingerprint: fingerprint, items: [{ ordinal: 1, coordinate_key: "row:1", source_content_digest: "b".repeat(64), decision_kind: "classification", decision_payload_sha256: payloadSha }] };
  const command = { ...baseCommand, operationUid: randomUUID(), decision: "repreview", replacementDecisionSetUid: "66666666-6666-4666-8666-666666666666", replacementManifest: manifest, replacementItems: [{ ordinal: 1, coordinateKey: "row:1", sourceContentDigest: "b".repeat(64), decisionKind: "classification", decisionPayload: payload, decisionPayloadSha256: payloadSha }], replacementManifestSha256: sha256(canonicalJson(manifest as CanonicalValue)) };
  const repreviewed = await decideSourcePreview(fake.pool as never, primaryUid, command, actor);
  assert.equal(repreviewed.decision, "repreview"); assert.equal(repreviewed.replacement_decision_set_uid, command.replacementDecisionSetUid); assert.deepEqual(repreviewed.approved_decision_set_uids, []);
  assert.ok(fake.sql.some((statement) => statement.includes("INSERT INTO public.source_decision_sets")));
  assert.ok(fake.sql.some((statement) => statement.includes("INSERT INTO public.source_decision_items")));
  assert.equal(fake.sql.filter((statement) => statement === "COMMIT").length, 2);
});

test("approve applies only a quarantine-only preview and records the ordered set and batch", async () => {
  const fake = fakePool(); const command = { ...baseCommand, operationUid: randomUUID(), decision: "approve" };
  const approved = await decideSourcePreview(fake.pool as never, primaryUid, command, actor);
  assert.equal(approved.decision, "approve"); assert.deepEqual(approved.approved_decision_set_uids, [primaryUid]); assert.deepEqual(approved.applied_batch_uids, [batchUid]); assert.equal(fake.status(), "approved");
  assert.ok(fake.sql.some((statement) => statement.includes("UPDATE public.accounting_import_batches SET status='applied'")));
  assert.ok(fake.sql.findIndex((statement) => statement.includes("FROM public.users WHERE id")) < fake.sql.findIndex((statement) => statement.includes("FROM public.business_operation_receipts WHERE operation_uid")));
});

test("approve refuses non-quarantine items before reservations or state changes", async () => {
  const fake = fakePool("approve"); const command = { ...baseCommand, manifestSha256: fake.manifestSha, operationUid: randomUUID(), decision: "approve" }; const before = fake.sql.length;
  await assert.rejects(() => decideSourcePreview(fake.pool as never, primaryUid, command, actor), /nonquarantine_apply_not_implemented/);
  const failureSql = fake.sql.slice(before); assert.ok(failureSql.includes("ROLLBACK")); assert.equal(failureSql.some((statement) => statement.includes("nextval")), false); assert.equal(fake.status(), "previewed");
});

test("reject fails closed on primary payload or manifest drift before reservations", async () => {
  const payload: Record<string, unknown> = { outcome: "quarantine" }; const payloadDrift = fakePool("quarantine", "classification", payload); payload.outcome = "reject";
  await assert.rejects(() => decideSourcePreview(payloadDrift.pool as never, primaryUid, { ...baseCommand, manifestSha256: payloadDrift.manifestSha, operationUid: randomUUID() }, actor), /primary_item_drift/);
  assert.equal(payloadDrift.sql.some((statement) => statement.includes("nextval")), false);
  const manifestDrift = fakePool(); manifestDrift.manifest.schema_version = "drift";
  await assert.rejects(() => decideSourcePreview(manifestDrift.pool as never, primaryUid, { ...baseCommand, manifestSha256: manifestDrift.manifestSha, operationUid: randomUUID() }, actor), /primary_manifest_drift/);
  assert.equal(manifestDrift.sql.some((statement) => statement.includes("nextval")), false);
});

test("reject fails closed on primary batch manifest drift before reservations", async () => {
  const fake = fakePool(); fake.batchManifest[0].issue_status = "warning";
  await assert.rejects(() => decideSourcePreview(fake.pool as never, primaryUid, { ...baseCommand, operationUid: randomUUID() }, actor), /primary_batch_manifest_drift/);
  assert.equal(fake.sql.some((statement) => statement.includes("nextval")), false);
});

test("approve materializes an exact source-bound period before applying its batch", async () => {
  const payload = { outcome:"approve",period_code:"TEST_2026",starts_at:"2026-01-01T00:00:00+09:00",ends_at:"2027-01-01T00:00:00+09:00",boundary_source_code:"MEMBERSHIP_INTEGRATED_ADDRESS_BOOK",boundary_coordinate_key:"row:1",boundary_content_digest:"b".repeat(64) };
  const fake=fakePool("approve","period_materialization",payload,"LEDGER_FINAL_2022_2025");const command={...baseCommand,manifestSha256:fake.manifestSha,operationUid:randomUUID(),decision:"approve"};const approved=await decideSourcePreview(fake.pool as never,primaryUid,command,actor);
  assert.equal(approved.decision,"approve");assert.ok(fake.sql.some((statement)=>statement.includes("INSERT INTO public.accounting_periods")));assert.ok(fake.sql.findIndex((statement)=>statement.includes("INSERT INTO public.accounting_periods"))<fake.sql.findIndex((statement)=>statement==="COMMIT"));
});

test("period materialization refuses an unregistered source family", async () => {
  const payload={outcome:"approve",period_code:"TEST_2026",starts_at:"2026-01-01T00:00:00+09:00",ends_at:null,boundary_source_code:"MEMBERSHIP_INTEGRATED_ADDRESS_BOOK",boundary_coordinate_key:"row:1",boundary_content_digest:"b".repeat(64)};const fake=fakePool("approve","period_materialization",payload);const command={...baseCommand,manifestSha256:fake.manifestSha,operationUid:randomUUID(),decision:"approve"};
  await assert.rejects(()=>decideSourcePreview(fake.pool as never,primaryUid,command,actor),/period_source_family_mismatch/);assert.equal(fake.sql.some((statement)=>statement.includes("nextval")),false);
});

test("approve forbids applying a roster companion directly", async () => {
  const payload = { outcome: "approve" }; const fake = fakePool("approve", "group_allocation", payload, "GROUP_FOREIGN_FACULTY_2025"); const command = { ...baseCommand, manifestSha256: fake.manifestSha, operationUid: randomUUID(), decision: "approve" };
  await assert.rejects(() => decideSourcePreview(fake.pool as never, primaryUid, command, actor), /direct_companion_apply_forbidden/);
  assert.equal(fake.sql.some((statement) => statement.includes("nextval")), false);
});

test("supersede atomically replaces an approved zero-child quarantine set", async () => {
  const fake = fakePool();
  await decideSourcePreview(fake.pool as never, primaryUid, { ...baseCommand, operationUid: randomUUID(), decision: "approve" }, actor);
  const replacementPayload = quarantineClassification; const replacementPayloadSha = sha256(canonicalJson(replacementPayload));
  const replacementUid = "66666666-6666-4666-8666-666666666666";
  const replacementManifest = { schema_version: "source-decision-preview-v1", batch_uid: batchUid, source_fingerprint: fingerprint, items: [{ ordinal: 1, coordinate_key: "row:1", source_content_digest: "b".repeat(64), decision_kind: "classification", decision_payload_sha256: replacementPayloadSha }] };
  const command = { ...baseCommand, operationUid: randomUUID(), decision: "supersede", replacementDecisionSetUid: replacementUid, replacementManifest, replacementItems: [{ ordinal: 1, coordinateKey: "row:1", sourceContentDigest: "b".repeat(64), decisionKind: "classification", decisionPayload: replacementPayload, decisionPayloadSha256: replacementPayloadSha }], replacementManifestSha256: sha256(canonicalJson(replacementManifest as CanonicalValue)) };
  const receipt = await decideSourcePreview(fake.pool as never, primaryUid, command, actor);
  assert.equal(receipt.decision, "supersede"); assert.deepEqual(receipt.applied_batch_uids, []); assert.deepEqual(receipt.approved_decision_set_uids, [replacementUid]);
  assert.ok(fake.sql.some((statement) => statement.includes("SET status='superseded'")));
  assert.equal(fake.sql.filter((statement) => statement.includes("SET status='approved'")).length, 2);
});

test("repreview rejects incomplete replacement before reserving or inserting rows", async () => {
  const fake = fakePool(); await decideSourcePreview(fake.pool as never, primaryUid, baseCommand, actor);
  const command = { ...baseCommand, operationUid: randomUUID(), decision: "repreview", replacementDecisionSetUid: "66666666-6666-4666-8666-666666666666", replacementManifest: { items: [] }, replacementItems: [], replacementManifestSha256: "0".repeat(64) };
  const before = fake.sql.length;
  await assert.rejects(() => decideSourcePreview(fake.pool as never, primaryUid, command, actor), /item_coverage_mismatch/);
  const failureSql = fake.sql.slice(before); assert.ok(failureSql.includes("ROLLBACK")); assert.equal(failureSql.some((statement) => statement.includes("nextval")), false);
});
