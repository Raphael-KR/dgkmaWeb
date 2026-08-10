import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import { buildGroupMultiBatchApplyPlan, loadGroupMultiBatchApplyPlan, type GroupApplySet } from "./source-decision-group-plan";

const primaryBatch = "11111111-1111-4111-8111-111111111111"; const primarySet = "22222222-2222-4222-8222-222222222222"; const rosterBatch = "33333333-3333-4333-8333-333333333333"; const rosterSet = "44444444-4444-4444-8444-444444444444"; const receipt = "55555555-5555-4555-8555-555555555555";
const primary: GroupApplySet = { sourceCode: "BANK_TOSS_2026", batchUid: primaryBatch, decisionSetUid: primarySet, items: [{ coordinateKey: "bank:toss:1", decisionKind: "classification", decisionPayload: { allocation_request_uid_or_null: null, category_splits: [{ category_code: "DUES_INCOME", amount: "100000" }], classification_kind: "dues", direction: "credit", dues_year_or_null: 2025, event_kind: "bank", event_party_uid_or_null: "66666666-6666-4666-8666-666666666666", group_roster_batch_uid_or_null: rosterBatch, member_uid_or_null: null, outcome: "approve", party_kind: "group", receipt_uid_or_null: receipt, refund_receipt_uid_or_null: null, reverses_event_uid_or_null: null } }] };
function allocation(seed: string, amount: string) { return { coordinateKey: `roster:${seed}`, decisionKind: "group_allocation", decisionPayload: { allocation_kind_or_null: "dues", allocation_request_uid_or_null: `${seed}0000000-0000-4000-8000-000000000001`, amount_or_null: amount, assessment_uid_or_null: null, dues_year_or_null: 2025, group_member_uid_or_null: `${seed}0000000-0000-4000-8000-000000000002`, member_uid_or_null: `${seed}0000000-0000-4000-8000-000000000003`, outcome: "approve", primary_bank_batch_uid_or_null: primaryBatch, primary_bank_coordinate_key_or_null: "bank:toss:1", receipt_uid_or_null: receipt } }; }
const companion: GroupApplySet = { sourceCode: "GROUP_FOREIGN_FACULTY_2025", batchUid: rosterBatch, decisionSetUid: rosterSet, items: [allocation("a", "50000"), allocation("b", "50000")] };

test("builds a deterministic primary-first bank and roster apply plan", () => {
  const result = buildGroupMultiBatchApplyPlan(primary, [companion]);
  assert.deepEqual(result.orderedBatchUids, [primaryBatch, rosterBatch]); assert.deepEqual(result.orderedDecisionSetUids, [primarySet, rosterSet]); assert.equal(result.groups[0].approvedAllocationAmount, "100000");
});

test("forbids direct companion apply", () => { assert.throws(() => buildGroupMultiBatchApplyPlan(companion, []), /direct_companion_apply_forbidden/); });
test("requires exact primary receipt and coordinate binding", () => {
  const wrong = structuredClone(companion); (wrong.items[0].decisionPayload as Record<string, unknown>).receipt_uid_or_null = "99999999-9999-4999-8999-999999999999";
  assert.throws(() => buildGroupMultiBatchApplyPlan(primary, [wrong]), /primary_binding_mismatch/);
});
test("requires approved allocation totals to equal the primary dues amount", () => {
  const short = structuredClone(companion); (short.items[1].decisionPayload as Record<string, unknown>).amount_or_null = "40000";
  assert.throws(() => buildGroupMultiBatchApplyPlan(primary, [short]), /allocation_total_mismatch/);
});
test("rejects duplicate or unreferenced companion batches", () => {
  assert.throws(() => buildGroupMultiBatchApplyPlan(primary, [companion, companion]), /companion_duplicate/);
  const extra = { ...companion, batchUid: "77777777-7777-4777-8777-777777777777", decisionSetUid: "88888888-8888-4888-8888-888888888888" };
  assert.throws(() => buildGroupMultiBatchApplyPlan(primary, [companion, extra]), /unreferenced_companion/);
});

test("loads and locks the exact live companion graph before planning", async () => {
  const sql: string[] = [];
  const sourceFingerprint = "f".repeat(64); const contentDigest = "c".repeat(64);
  const batchRows = companion.items.map((item, index) => ({ ordinal: index + 1, coordinate_key: item.coordinateKey, content_digest: contentDigest, issue_status: "accepted" }));
  const batchManifest = batchRows.map(({ coordinate_key, content_digest, issue_status }) => ({ coordinate_key, content_digest, issue_status }));
  const storedItems = companion.items.flatMap((item) => [{ coordinate_key: item.coordinateKey, content_digest: contentDigest, decision_kind: item.decisionKind, decision_payload: item.decisionPayload }, { coordinate_key: item.coordinateKey, content_digest: contentDigest, decision_kind: "member_match", decision_payload: { outcome: "quarantine" } }]).map((item, index) => ({ ...item, ordinal: index + 1, decision_payload_sha256: sha256(canonicalJson(item.decision_payload as CanonicalValue)) }));
  const manifest = { schema_version: "source-decision-preview-v1", batch_uid: rosterBatch, source_fingerprint: sourceFingerprint, items: storedItems.map((item) => ({ ordinal: item.ordinal, coordinate_key: item.coordinate_key, source_content_digest: item.content_digest, decision_kind: item.decision_kind, decision_payload_sha256: item.decision_payload_sha256 })) };
  const client = { query: async (text: string) => {
    sql.push(text);
    if (text.includes("FROM public.accounting_import_batches b")) return { rowCount: 1, rows: [{ batch_id: "16", batch_uid: rosterBatch, batch_status: "previewed", preview_manifest: batchManifest, preview_manifest_sha256: sha256(canonicalJson(batchManifest as CanonicalValue)), row_count: batchRows.length, source_fingerprint: sourceFingerprint, decision_set_id: "17", decision_set_uid: rosterSet, decision_set_status: "previewed", manifest, manifest_sha256: sha256(canonicalJson(manifest as CanonicalValue)), source_code: "GROUP_FOREIGN_FACULTY_2025" }] };
    if (text.includes("FROM public.accounting_import_batch_rows br")) return { rowCount: batchRows.length, rows: batchRows };
    return { rowCount: storedItems.length, rows: storedItems };
  } };
  const result = await loadGroupMultiBatchApplyPlan(client as never, primary);
  assert.deepEqual(result?.orderedBatchUids, [primaryBatch, rosterBatch]); assert.equal(sql.length, 3); assert.ok(sql.every((statement) => statement.includes("FOR UPDATE")));
});

test("fails closed when the referenced companion has no unique live preview set", async () => {
  const client = { query: async () => ({ rowCount: 0, rows: [] }) };
  await assert.rejects(() => loadGroupMultiBatchApplyPlan(client as never, primary), /companion_graph_mismatch/);
});

test("fails closed on companion manifest or coverage drift", async () => {
  const sourceFingerprint = "f".repeat(64); const item = { ordinal: 1, coordinate_key: "roster:a", content_digest: "c".repeat(64), decision_kind: "group_allocation", decision_payload: companion.items[0].decisionPayload, decision_payload_sha256: sha256(canonicalJson(companion.items[0].decisionPayload as CanonicalValue)) };
  const batchRows = [{ ordinal: 1, coordinate_key: "roster:a", content_digest: item.content_digest, issue_status: "accepted" }]; const batchManifest = batchRows.map(({ coordinate_key, content_digest, issue_status }) => ({ coordinate_key, content_digest, issue_status }));
  const client = { query: async (text: string) => text.includes("FROM public.accounting_import_batches b") ? { rowCount: 1, rows: [{ batch_id: "16", batch_uid: rosterBatch, batch_status: "previewed", preview_manifest: batchManifest, preview_manifest_sha256: sha256(canonicalJson(batchManifest as CanonicalValue)), row_count: 1, source_fingerprint: sourceFingerprint, decision_set_id: "17", decision_set_uid: rosterSet, decision_set_status: "previewed", manifest: {}, manifest_sha256: "0".repeat(64), source_code: "GROUP_FOREIGN_FACULTY_2025" }] } : text.includes("FROM public.accounting_import_batch_rows br") ? { rowCount: 1, rows: batchRows } : { rowCount: 1, rows: [item] } };
  await assert.rejects(() => loadGroupMultiBatchApplyPlan(client as never, primary), /companion_manifest_drift/);
});

test("fails closed on companion batch manifest drift", async () => {
  const batchRows = [{ ordinal: 1, coordinate_key: "roster:a", content_digest: "c".repeat(64), issue_status: "accepted" }];
  const client = { query: async (text: string) => text.includes("FROM public.accounting_import_batches b") ? { rowCount: 1, rows: [{ batch_id: "16", batch_uid: rosterBatch, batch_status: "previewed", preview_manifest: [], preview_manifest_sha256: sha256(canonicalJson([])), row_count: 1, source_fingerprint: "f".repeat(64), decision_set_id: "17", decision_set_uid: rosterSet, decision_set_status: "previewed", manifest: {}, manifest_sha256: "0".repeat(64), source_code: "GROUP_FOREIGN_FACULTY_2025" }] } : { rowCount: 1, rows: batchRows } };
  await assert.rejects(() => loadGroupMultiBatchApplyPlan(client as never, primary), /companion_batch_manifest_drift/);
});
