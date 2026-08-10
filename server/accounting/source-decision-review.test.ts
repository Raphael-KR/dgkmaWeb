import assert from "node:assert/strict";
import test from "node:test";
import { sourceFingerprint, buildDecisionManifest, type SourcePreviewInput } from "./source-preview-contract-v2";
import { readSourceDecisionReview } from "./source-decision-review";

function fixture() {
  const input: SourcePreviewInput = { schema_version: "accounting-source-preview-input-v2", source_code: "NOTION_ORGANIZATION_ROLE_HISTORY", source_uid: "11111111-1111-5111-8111-111111111111", release_uid: "22222222-2222-4222-8222-222222222222", source_revision: "notion:test", source_fingerprint: "0".repeat(64), operation_uid: "33333333-3333-4333-8333-333333333333", batch_uid: "44444444-4444-4444-8444-444444444444", decision_set_uid: "55555555-5555-4555-8555-555555555555", captured_timezone: "Asia/Seoul", coverage_from: "2026-01-01T00:00:00+09:00", coverage_through: "2027-01-01T00:00:00+09:00", rows: [{ coordinate_key: "notion:role:1", coordinate_normalization_version: "coordinate-v1", issue_status: "warning", normalization_version: "role-v2", normalized_payload: { administration_no: 22, admission_year: 1, appointment_basis: "appointment", date_precision: "day", display_position: "이사", editorial_status: "검토필요", effective_from: "2026-01-01", effective_to: null, generation: 1, matched_member_uid: null, member_match_status: "미매칭", name_key_digest: "a".repeat(64), name_snapshot: "관리자 표시 이름", note_digest: null, note_snapshot: null, organization_code: "alumni_association", position_code: "director", publication_allowed: false, source_appointment_date: null, source_date_text: null, source_locator_digest: "b".repeat(64), source_locator_snapshot: "명단", source_timezone: "Asia/Seoul", verification_evidence_digest: null, verification_evidence_snapshot: null }, raw_payload: { administration_no: 22, admission_year: 1, appointment_basis: "appointment", date_precision: "day", display_position: "이사", editorial_status: "검토필요", effective_from: "2026-01-01", effective_to: null, generation: 1, matched_member_uid: null, member_match_status: "미매칭", name_key_digest: "a".repeat(64), name_snapshot: "관리자 표시 이름", note_digest: null, note_snapshot: null, organization_code: "alumni_association", position_code: "director", publication_allowed: false, source_appointment_date: null, source_date_text: null, source_locator_digest: "b".repeat(64), source_locator_snapshot: "명단", source_timezone: "Asia/Seoul", verification_evidence_digest: null, verification_evidence_snapshot: null }, source_display_snapshot: "__page__", decisions: [{ decision_kind: "member_match", decision_payload: { outcome: "quarantine", case_uid: "66666666-6666-4666-8666-666666666666", candidate_member_uid_or_null: null, evidence_kind: "name_only", evidence_digest: "c".repeat(64), score_basis: "name_only_unapprovable" } }] }] };
  input.source_fingerprint = sourceFingerprint(input); return input;
}

test("review GET projection verifies persisted bytes and reveals only approved snapshots", async () => {
  const input = fixture(); const built = buildDecisionManifest(input); let query = 0; let rolledBack = false;
  const client = { query: async (sql: string) => {
    query += 1;
    if (sql.startsWith("BEGIN")) return { rowCount: null, rows: [] };
    if (sql.includes("FROM public.source_decision_sets ds")) return { rowCount: 1, rows: [{ id: "1", decision_set_uid: input.decision_set_uid, batch_uid: input.batch_uid, manifest: built.manifest, manifest_sha256: built.manifestSha256, source_fingerprint: input.source_fingerprint, status: "previewed", source_code: input.source_code }] };
    if (sql.includes("FROM public.source_decision_items i")) return { rowCount: 1, rows: [{ ordinal: 1, coordinate_key: input.rows[0].coordinate_key, content_digest: built.items[0].source_content_digest, normalized_payload: input.rows[0].normalized_payload, decision_kind: built.items[0].decision_kind, decision_payload: built.items[0].decision_payload, decision_payload_sha256: built.items[0].decision_payload_sha256 }] };
    if (sql === "ROLLBACK") { rolledBack = true; return { rowCount: null, rows: [] }; }
    throw new Error("unexpected query");
  }, release: () => {} };
  const review = await readSourceDecisionReview({ connect: async () => client } as any, input.decision_set_uid);
  assert.equal(query, 4); assert.equal(rolledBack, true); assert.equal(review?.items[0].reviewDisplay.name_snapshot, "관리자 표시 이름");
  assert.equal(JSON.stringify(review).includes("source_locator_digest"), false);
});
