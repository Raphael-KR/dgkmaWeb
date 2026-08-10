import assert from "node:assert/strict";
import test from "node:test";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";
import { buildGroupMultiBatchApplyPlan, loadGroupMultiBatchApplyPlan, type GroupApplySet } from "./source-decision-group-plan";

const primaryBatch = "11111111-1111-4111-8111-111111111111"; const primarySet = "22222222-2222-4222-8222-222222222222"; const rosterBatch = "33333333-3333-4333-8333-333333333333"; const rosterSet = "44444444-4444-4444-8444-444444444444"; const receipt = "55555555-5555-4555-8555-555555555555";
const primary: GroupApplySet = { sourceCode: "BANK_TOSS_2026", batchUid: primaryBatch, decisionSetUid: primarySet, items: [{ coordinateKey: "bank:toss:1", decisionKind: "classification", decisionPayload: { allocation_request_uid_or_null: null, category_splits: [{ category_code: "DUES_INCOME", amount: "100000" }], classification_kind: "dues", direction: "credit", dues_year_or_null: 2025, event_kind: "bank", event_party_uid_or_null: "66666666-6666-4666-8666-666666666666", group_roster_batch_uid_or_null: rosterBatch, member_uid_or_null: null, outcome: "approve", party_kind: "group", receipt_uid_or_null: receipt, refund_receipt_uid_or_null: null, reverses_event_uid_or_null: null } }] };
function allocation(seed: string, amount: string) { return { coordinateKey: `roster:${seed}`, decisionKind: "group_allocation", decisionPayload: { allocation_kind_or_null: "dues", allocation_request_uid_or_null: `${seed}0000000-0000-4000-8000-000000000001`, amount_or_null: amount, assessment_uid_or_null: null, dues_year_or_null: 2025, group_member_uid_or_null: `${seed}0000000-0000-4000-8000-000000000002`, member_uid_or_null: `${seed}0000000-0000-4000-8000-000000000003`, outcome: "approve", primary_bank_batch_uid_or_null: primaryBatch, primary_bank_coordinate_key_or_null: "bank:toss:1", receipt_uid_or_null: receipt } }; }
function match(seed: string) { return { coordinateKey: `roster:${seed}`, decisionKind: "member_match", decisionPayload: { candidate_member_uid_or_null: `${seed}0000000-0000-4000-8000-000000000003`, case_uid: `${seed}0000000-0000-4000-8000-000000000004`, evidence_digest: "d".repeat(64), evidence_kind: "roster_member_uid", outcome: "approve", score_basis: "exact_roster_member_uid" } }; }
const companion: GroupApplySet = { sourceCode: "GROUP_FOREIGN_FACULTY_2025", batchUid: rosterBatch, decisionSetUid: rosterSet, items: [allocation("a", "50000"), match("a"), allocation("b", "50000"), match("b")] };

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
  const short = structuredClone(companion); (short.items[2].decisionPayload as Record<string, unknown>).amount_or_null = "40000";
  assert.throws(() => buildGroupMultiBatchApplyPlan(primary, [short]), /allocation_total_mismatch/);
});
test("requires each approved allocation to bind the same approved member match", () => {
  const wrong = structuredClone(companion); (wrong.items[1].decisionPayload as Record<string, unknown>).candidate_member_uid_or_null = "99999999-9999-4999-8999-999999999999";
  assert.throws(() => buildGroupMultiBatchApplyPlan(primary, [wrong]), /member_match_binding_mismatch/);
});
test("requires paired companion items to share exact stored evidence", () => {
  const bound = structuredClone(companion); const normalizedPayload = { group_name_snapshot: "synthetic group" };
  bound.items.forEach((item, index) => { item.evidence = { decisionItemId: String(index + 1), coordinateId: item.coordinateKey === "roster:a" ? "11" : "12", sourceRowVersionId: item.coordinateKey === "roster:a" ? "21" : "22", contentDigest: "c".repeat(64), normalizedPayload }; });
  bound.items[1].evidence = { ...bound.items[1].evidence!, sourceRowVersionId: "99" };
  assert.throws(() => buildGroupMultiBatchApplyPlan(primary, [bound]), /companion_evidence_mismatch/);
});
test("rejects duplicate or unreferenced companion batches", () => {
  assert.throws(() => buildGroupMultiBatchApplyPlan(primary, [companion, companion]), /companion_duplicate/);
  const extra = { ...companion, batchUid: "77777777-7777-4777-8777-777777777777", decisionSetUid: "88888888-8888-4888-8888-888888888888" };
  assert.throws(() => buildGroupMultiBatchApplyPlan(primary, [companion, extra]), /unreferenced_companion/);
});

test("loads and locks the exact live companion graph before planning", async () => {
  const sql: string[] = [];
  const sourceFingerprint = "f".repeat(64); const contentDigest = "c".repeat(64);
  const batchRows = ["roster:a", "roster:b"].map((coordinate_key, index) => ({ ordinal: index + 1, coordinate_key, content_digest: contentDigest, issue_status: "accepted" }));
  const batchManifest = batchRows.map(({ coordinate_key, content_digest, issue_status }) => ({ coordinate_key, content_digest, issue_status }));
  const storedItems = companion.items.map((item, index) => ({ id: String(30 + index), coordinate_id: item.coordinateKey === "roster:a" ? "41" : "42", coordinate_key: item.coordinateKey, source_row_version_id: item.coordinateKey === "roster:a" ? "51" : "52", content_digest: contentDigest, normalization_version: "allocation-roster-row-v1@1.0.0", normalized_payload: { group_name_snapshot: "synthetic group" }, decision_kind: item.decisionKind, decision_payload: item.decisionPayload, ordinal: index + 1, decision_payload_sha256: sha256(canonicalJson(item.decisionPayload as CanonicalValue)) }));
  const manifest = { schema_version: "source-decision-preview-v1", batch_uid: rosterBatch, source_fingerprint: sourceFingerprint, items: storedItems.map((item) => ({ ordinal: item.ordinal, coordinate_key: item.coordinate_key, source_content_digest: item.content_digest, decision_kind: item.decision_kind, decision_payload_sha256: item.decision_payload_sha256 })) };
  const client = { query: async (text: string) => {
    sql.push(text);
    if (text.includes("FROM public.accounting_import_batches b")) return { rowCount: 1, rows: [{ batch_id: "16", batch_uid: rosterBatch, batch_status: "previewed", preview_manifest: batchManifest, preview_manifest_sha256: sha256(canonicalJson(batchManifest as CanonicalValue)), row_count: batchRows.length, source_fingerprint: sourceFingerprint, decision_set_id: "17", decision_set_uid: rosterSet, decision_set_status: "previewed", manifest, manifest_sha256: sha256(canonicalJson(manifest as CanonicalValue)), source_code: "GROUP_FOREIGN_FACULTY_2025" }] };
    if (text.includes("FROM public.accounting_import_batch_rows br")) return { rowCount: batchRows.length, rows: batchRows };
    if (text.includes("FROM public.association_members")) return { rowCount: 2, rows: [{ id: "81", member_uid: "a0000000-0000-4000-8000-000000000003", status: "active" }, { id: "82", member_uid: "b0000000-0000-4000-8000-000000000003", status: "active" }] };
    if (text.includes("FROM public.economic_event_parties")) return { rowCount: 0, rows: [] };
    if (text.includes("FROM public.accounting_logical_sources s JOIN public.bank_source_account_mappings")) return { rowCount: 1, rows: [{ account_id: "91", account_code: "TOSS_OFFICER_2026", source_code_snapshot: "BANK_TOSS_2026", account_code_snapshot: "TOSS_OFFICER_2026" }] };
    if (text.includes("FROM public.dues_receipts") || text.includes("FROM public.member_match_cases") || text.includes("FROM public.dues_group_members") || text.includes("FROM public.dues_allocations")) return { rowCount: 0, rows: [] };
    if (text.includes("FROM public.accounting_categories")) return { rowCount: 1, rows: [{ id: "101", category_code: "DUES_INCOME", display_name: "회비 수입", active_from: "2025-01-01", active_to: null, dues_effect: "dues_credit" }] };
    if (text.includes("FROM public.accounting_periods")) return { rowCount: 1, rows: [{ id: "102", starts_at: "2025-01-01T00:00:00+09:00", ends_at: "2027-01-01T00:00:00+09:00" }] };
    return { rowCount: storedItems.length, rows: storedItems };
  } };
  const primaryWithEvidence = structuredClone(primary); primaryWithEvidence.batchId="15";primaryWithEvidence.decisionSetId="18";primaryWithEvidence.items[0].evidence = { decisionItemId: "19", coordinateId: "29", sourceRowVersionId: "39", contentDigest, normalizationVersion: "bank-row-v1@1.0.0", normalizedPayload: { amount: "100000", balance_after: "100000", direction: "credit", occurred_at: "2026-01-01T00:00:00+09:00", payer_name_key_digest: "a".repeat(64), posted_date: "2026-01-01", provider_row_id: "row-1", transaction_description_digest: "b".repeat(64) } };
  const result = await loadGroupMultiBatchApplyPlan(client as never, primaryWithEvidence);
  assert.deepEqual(result?.resolvedBindings?.batchIdsByUid,{[primaryBatch]:"15",[rosterBatch]:"16"});assert.deepEqual(result?.resolvedBindings?.decisionSetIdsByUid,{[primarySet]:"18",[rosterSet]:"17"});
  assert.deepEqual(result?.orderedBatchUids, [primaryBatch, rosterBatch]); assert.equal(result?.groups[0].primaryEvidence?.decisionItemId, "19"); assert.equal(result?.groups[0].allocations[0].evidence?.allocationDecisionItemId, "30"); assert.equal(result?.groups[0].allocations[0].evidenceKind, "roster_member_uid"); assert.equal(result?.resolvedBindings?.bankAccountId, "91"); assert.deepEqual(result?.resolvedBindings?.rosterBatchIdsByUid, { [rosterBatch]: "16" }); assert.deepEqual(result?.resolvedBindings?.memberIdsByUid, { "a0000000-0000-4000-8000-000000000003": "81", "b0000000-0000-4000-8000-000000000003": "82" }); assert.deepEqual(result?.resolvedBindings?.categoriesByCoordinate, { "bank:toss:1": { DUES_INCOME: { id: "101", displayName: "회비 수입" } } }); assert.deepEqual(result?.resolvedBindings?.periodIdsByCoordinate, { "bank:toss:1": "102" }); assert.match(result?.resolvedBindings?.financialDigestsByCoordinate["bank:toss:1"].rowFingerprint ?? "", /^[0-9a-f]{64}$/); assert.equal(sql.length, 12); assert.ok(sql.every((statement) => statement.includes("FOR UPDATE")));
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
