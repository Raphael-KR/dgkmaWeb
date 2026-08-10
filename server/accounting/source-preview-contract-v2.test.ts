import assert from "node:assert/strict";
import test from "node:test";
import { batchPreviewManifest, buildDecisionManifest, reviewDisplay, sourceFingerprint, validateSourcePreviewInput, type SourcePreviewInput } from "./source-preview-contract-v2";

function fixture(): SourcePreviewInput {
  const input: SourcePreviewInput = {
    schema_version: "accounting-source-preview-input-v2",
    source_code: "NOTION_ORGANIZATION_ROLE_HISTORY",
    source_uid: "33333333-3333-4333-8333-333333333330",
    release_uid: "33333333-3333-4333-8333-333333333331",
    source_revision: "notion:test-revision",
    source_fingerprint: "0".repeat(64),
    operation_uid: "55555555-5555-4555-8555-555555555555",
    batch_uid: "11111111-1111-4111-8111-111111111111",
    decision_set_uid: "22222222-2222-4222-8222-222222222222",
    captured_timezone: "Asia/Seoul",
    coverage_from: "2026-01-01T00:00:00+09:00",
    coverage_through: "2026-12-31T23:59:59+09:00",
    rows: [{
      coordinate_key: "notion:page:33333333-3333-4333-8333-333333333333",
      coordinate_normalization_version: "notion-page-id-v1",
      issue_status: "warning",
      normalization_version: "notion-organization-role-history-v2@2.0.0+admin-readable-v1",
      normalized_payload: { administration_no: 22, admission_year: 2000, appointment_basis: "appointment", date_precision: "day", display_position: "이사", editorial_status: "검토필요", effective_from: "2026-01-01T00:00:00+09:00", effective_to: null, generation: 20, matched_member_uid: null, member_match_status: "미매칭", name_key_digest: "a".repeat(64), name_snapshot: "검토 회원", note_digest: null, note_snapshot: null, organization_code: "alumni_association", position_code: "director", publication_allowed: false, source_appointment_date: null, source_date_text: null, source_locator_digest: "b".repeat(64), source_locator_snapshot: "회의록", source_timezone: "Asia/Seoul", verification_evidence_digest: null, verification_evidence_snapshot: null },
      raw_payload: { administration_no: 22, admission_year: 2000, appointment_basis: "appointment", date_precision: "day", display_position: "이사", editorial_status: "검토필요", effective_from: "2026-01-01T00:00:00+09:00", effective_to: null, generation: 20, matched_member_uid: null, member_match_status: "미매칭", name_key_digest: "a".repeat(64), name_snapshot: "검토 회원", note_digest: null, note_snapshot: null, organization_code: "alumni_association", position_code: "director", publication_allowed: false, source_appointment_date: null, source_date_text: null, source_locator_digest: "b".repeat(64), source_locator_snapshot: "회의록", source_timezone: "Asia/Seoul", verification_evidence_digest: null, verification_evidence_snapshot: null },
      source_display_snapshot: "__page__",
      decisions: [{ decision_kind: "member_match", decision_payload: { outcome: "quarantine", case_uid: "44444444-4444-4444-8444-444444444444", candidate_member_uid_or_null: null, evidence_kind: "name_only", evidence_digest: "a".repeat(64), score_basis: "name_only_unapprovable" } }],
    }],
  };
  input.source_fingerprint = sourceFingerprint(input);
  return input;
}

test("preview input binds exact source bytes and creates a redacted manifest", () => {
  const input = validateSourcePreviewInput(fixture());
  const built = buildDecisionManifest(input);
  assert.equal(built.items.length, 1);
  assert.equal(built.manifest.items[0].coordinate_key, input.rows[0].coordinate_key);
  assert.equal(JSON.stringify(built.manifest).includes("검토 회원"), false);
  assert.match(built.manifestSha256, /^[0-9a-f]{64}$/);
});

test("batch manifest is the exact ordered source-fingerprint rows projection", () => {
  const input = fixture();
  const manifest = batchPreviewManifest(input.rows);
  assert.deepEqual(Object.keys(manifest[0]).sort(), ["content_digest", "coordinate_key", "issue_status"]);
  assert.match(manifest[0].content_digest, /^[0-9a-f]{64}$/);
  assert.equal(manifest[0].issue_status, "warning");
  assert.notEqual(sourceFingerprint({ ...input, release_uid: "33333333-3333-4333-8333-333333333332" }), input.source_fingerprint);
});

test("admin review projection exposes only the approved work snapshot", () => {
  const input = fixture();
  const projection = reviewDisplay(input.source_code, input.rows[0].normalized_payload);
  assert.deepEqual(projection, { name_snapshot: "검토 회원", display_position: "이사", note_snapshot: null, source_locator_snapshot: "회의록", verification_evidence_snapshot: null });
  assert.equal("name_key_digest" in projection, false);
});

test("name-only approval and stale fingerprints fail closed", () => {
  const approved = fixture();
  approved.rows[0].decisions[0].decision_payload.outcome = "approve";
  approved.source_fingerprint = sourceFingerprint(approved);
  assert.throws(() => validateSourcePreviewInput(approved), /name_only_approval_forbidden/);
  const stale = fixture(); stale.rows[0].normalized_payload.name_snapshot = "변경"; stale.rows[0].raw_payload.name_snapshot = "변경";
  assert.throws(() => validateSourcePreviewInput(stale), /fingerprint_mismatch/);
});

test("raw payload cannot contain undeclared provider or contact fields", () => {
  const input = fixture(); input.rows[0].raw_payload.provider_body = "forbidden"; input.source_fingerprint = sourceFingerprint(input);
  assert.throws(() => validateSourcePreviewInput(input), /raw_allowlist_mismatch/);
});

test("decision coverage rejects an extra kind before manifest creation", () => {
  const input = fixture();
  input.rows[0].decisions.unshift({ decision_kind: "period_materialization", decision_payload: { outcome: "quarantine", period_code: "TEST", starts_at: "2026-01-01T00:00:00+09:00", ends_at: null, boundary_source_code: "TEST", boundary_coordinate_key: "test:boundary", boundary_content_digest: "b".repeat(64) } });
  input.source_fingerprint = sourceFingerprint(input);
  assert.throws(() => validateSourcePreviewInput(input), /decision_coverage_mismatch/);
});
