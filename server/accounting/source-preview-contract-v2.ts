import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

export const SOURCE_PREVIEW_INPUT_SCHEMA = "accounting-source-preview-input-v2";
export const SOURCE_DECISION_MANIFEST_SCHEMA = "source-decision-preview-v1";

export const ACTIVE_V2_SOURCES = [
  "AGM36_PERIOD_BOUNDARY",
  "BANK_IBK_2026",
  "BANK_TOSS_2026",
  "GROUP_FOREIGN_FACULTY_2025",
  "LEDGER_DUES_POLICY_2024_2025",
  "LEDGER_FINAL_2022_2025",
  "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK",
  "NOTION_DUES_REGULATION_DRAFT",
  "NOTION_ORGANIZATION_ROLE_HISTORY",
] as const;

export type ActiveV2Source = typeof ACTIVE_V2_SOURCES[number];
export type DecisionKind = "classification" | "member_match" | "group_allocation" | "period_materialization";

type JsonObject = Record<string, CanonicalValue>;
export type SourcePreviewDecision = { decision_kind: DecisionKind; decision_payload: JsonObject };
export type SourcePreviewRow = {
  coordinate_key: string;
  coordinate_normalization_version: string;
  issue_status: "accepted" | "warning" | "blocked";
  normalization_version: string;
  normalized_payload: JsonObject;
  raw_payload: JsonObject;
  source_display_snapshot: string;
  decisions: SourcePreviewDecision[];
};
export type SourcePreviewInput = {
  schema_version: typeof SOURCE_PREVIEW_INPUT_SCHEMA;
  source_code: ActiveV2Source;
  source_uid: string;
  release_uid: string;
  source_revision: string;
  source_fingerprint: string;
  operation_uid: string;
  batch_uid: string;
  decision_set_uid: string;
  captured_timezone: "Asia/Seoul";
  coverage_from: string;
  coverage_through: string;
  rows: SourcePreviewRow[];
};

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DECISION_KINDS = new Set<DecisionKind>(["classification", "member_match", "group_allocation", "period_materialization"]);
const OUTCOMES = new Set(["approve", "reject", "quarantine"]);

const PAYLOAD_KEYS: Record<DecisionKind, string[]> = {
  classification: [
    "allocation_request_uid_or_null", "category_splits", "classification_kind", "direction", "dues_year_or_null",
    "event_kind", "event_party_uid_or_null", "group_roster_batch_uid_or_null", "member_uid_or_null", "outcome",
    "party_kind", "receipt_uid_or_null", "refund_receipt_uid_or_null", "reverses_event_uid_or_null",
  ],
  member_match: ["candidate_member_uid_or_null", "case_uid", "evidence_digest", "evidence_kind", "outcome", "score_basis"],
  group_allocation: [
    "allocation_kind_or_null", "allocation_request_uid_or_null", "amount_or_null", "assessment_uid_or_null",
    "dues_year_or_null", "group_member_uid_or_null", "member_uid_or_null", "outcome",
    "primary_bank_batch_uid_or_null", "primary_bank_coordinate_key_or_null", "receipt_uid_or_null",
  ],
  period_materialization: ["boundary_content_digest", "boundary_coordinate_key", "boundary_source_code", "ends_at", "outcome", "period_code", "starts_at"],
};

const SCORE_BASIS: Record<string, string> = {
  bank_payer_reference: "exact_bank_payer_alias",
  board_roster_row: "exact_board_name_generation_position",
  canonical_email: "exact_canonical_email",
  canonical_mobile: "exact_canonical_mobile",
  canonical_phone: "exact_canonical_phone",
  existing_fk: "exact_existing_user_fk",
  manual_document: "manual_document_reference",
  name_only: "name_only_unapprovable",
  roster_member_uid: "exact_roster_member_uid",
};

const SOURCE_PAYLOAD_KEYS: Record<Exclude<ActiveV2Source, "LEDGER_FINAL_2022_2025">, string[]> = {
  AGM36_PERIOD_BOUNDARY: ["boundary_content_digest", "boundary_coordinate_key", "boundary_source_code", "ends_at", "period_code", "starts_at"],
  BANK_IBK_2026: ["amount", "balance_after", "direction", "occurred_at", "payer_name_key_digest", "payer_name_snapshot", "posted_date", "provider_row_id", "transaction_description_digest", "transaction_description_snapshot"],
  BANK_TOSS_2026: ["amount", "balance_after", "direction", "occurred_at", "payer_name_key_digest", "payer_name_snapshot", "posted_date", "provider_row_id", "transaction_description_digest", "transaction_description_snapshot"],
  GROUP_FOREIGN_FACULTY_2025: ["generation", "group_key_digest", "group_name_snapshot", "member_name_key_digest", "member_name_snapshot", "proposed_amount"],
  LEDGER_DUES_POLICY_2024_2025: ["annual_minimum", "due_day", "dues_year", "monthly_minimum", "reminder_day", "tier_code"],
  MEMBERSHIP_INTEGRATED_ADDRESS_BOOK: ["admitted_on", "generation", "graduated_on", "member_kind_evidence_digest", "member_kind_evidence_snapshot", "name_key_digest", "name_snapshot", "source_status_digest", "source_status_snapshot", "source_timezone"],
  NOTION_DUES_REGULATION_DRAFT: ["annual_minimum", "due_day", "dues_year", "monthly_minimum", "reminder_day", "tier_code"],
  NOTION_ORGANIZATION_ROLE_HISTORY: ["administration_no", "admission_year", "appointment_basis", "date_precision", "display_position", "editorial_status", "effective_from", "effective_to", "generation", "matched_member_uid", "member_match_status", "name_key_digest", "name_snapshot", "note_digest", "note_snapshot", "organization_code", "position_code", "publication_allowed", "source_appointment_date", "source_date_text", "source_locator_digest", "source_locator_snapshot", "source_timezone", "verification_evidence_digest", "verification_evidence_snapshot"],
};
const LEDGER_ECONOMIC_KEYS = ["amount", "coordinate_key", "coordinate_kind", "description_digest", "description_snapshot", "direction", "dues_year", "occurred_at", "occurred_date", "payer_name_key_digest", "payer_name_snapshot", "period_code"];
const LEDGER_PERIOD_KEYS = ["boundary_content_digest", "boundary_coordinate_key", "boundary_source_code", "coordinate_kind", "ends_at", "period_code", "starts_at"];

function fail(code: string): never { throw new Error(code); }
function utf8Compare(left: string, right: string): number { return Buffer.compare(Buffer.from(left), Buffer.from(right)); }
function exactKeys(value: JsonObject, expected: string[], code: string): void {
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...expected].sort())) fail(code);
}
function nonempty(value: unknown, code: string): string {
  if (typeof value !== "string" || value.normalize("NFC").trim() !== value || value.length === 0) fail(code);
  return value;
}
function uuidOrNull(value: CanonicalValue, code: string): void {
  if (value !== null && (typeof value !== "string" || !UUID_V4.test(value))) fail(code);
}
function canonicalMoneyOrNull(value: CanonicalValue, code: string): void {
  if (value !== null && (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value))) fail(code);
}

export function contentDigest(payload: JsonObject): string {
  return sha256(canonicalJson(payload));
}

export function batchPreviewManifest(rows: SourcePreviewRow[]) {
  return [...rows]
    .map((row) => ({ coordinate_key: row.coordinate_key, content_digest: contentDigest(row.normalized_payload), issue_status: row.issue_status }))
    .sort((left, right) => utf8Compare(left.coordinate_key, right.coordinate_key));
}

export function sourceFingerprint(input: Pick<SourcePreviewInput, "source_uid" | "release_uid" | "source_revision" | "captured_timezone" | "coverage_from" | "coverage_through" | "rows">): string {
  return sha256(canonicalJson({
    digest_version: "source-batch-v1",
    source_uid: input.source_uid,
    release_uid: input.release_uid,
    source_revision: input.source_revision,
    captured_timezone: input.captured_timezone,
    coverage_from: input.coverage_from,
    coverage_through: input.coverage_through,
    rows: batchPreviewManifest(input.rows),
  }));
}

export function reviewDisplay(sourceCode: ActiveV2Source, payload: JsonObject): JsonObject {
  const keysBySource: Record<ActiveV2Source, string[]> = {
    AGM36_PERIOD_BOUNDARY: [],
    BANK_IBK_2026: ["payer_name_snapshot", "transaction_description_snapshot"],
    BANK_TOSS_2026: ["payer_name_snapshot", "transaction_description_snapshot"],
    GROUP_FOREIGN_FACULTY_2025: ["group_name_snapshot", "member_name_snapshot"],
    LEDGER_DUES_POLICY_2024_2025: [],
    LEDGER_FINAL_2022_2025: ["payer_name_snapshot", "description_snapshot"],
    MEMBERSHIP_INTEGRATED_ADDRESS_BOOK: ["name_snapshot", "member_kind_evidence_snapshot", "source_status_snapshot"],
    NOTION_DUES_REGULATION_DRAFT: [],
    NOTION_ORGANIZATION_ROLE_HISTORY: ["name_snapshot", "display_position", "note_snapshot", "source_locator_snapshot", "verification_evidence_snapshot"],
  };
  return Object.fromEntries(keysBySource[sourceCode].map((key) => [key, payload[key] ?? null])) as JsonObject;
}

function validateSourcePayload(sourceCode: ActiveV2Source, payload: JsonObject): void {
  const expected = sourceCode === "LEDGER_FINAL_2022_2025"
    ? payload.coordinate_kind === "economic" ? LEDGER_ECONOMIC_KEYS : payload.coordinate_kind === "period_metadata" ? LEDGER_PERIOD_KEYS : fail("source_preview_ledger_coordinate_kind_invalid")
    : SOURCE_PAYLOAD_KEYS[sourceCode];
  exactKeys(payload, expected, "source_preview_source_payload_keys_mismatch");
  if (sourceCode === "LEDGER_DUES_POLICY_2024_2025" || sourceCode === "NOTION_DUES_REGULATION_DRAFT") {
    for (const key of ["annual_minimum", "monthly_minimum"]) if (typeof payload[key] !== "string" || !/^(0|[1-9][0-9]*)$/.test(payload[key])) fail("source_preview_policy_money_invalid");
    for (const key of ["due_day", "reminder_day"]) if (!Number.isInteger(payload[key]) || Number(payload[key]) < 1 || Number(payload[key]) > 31) fail("source_preview_policy_day_invalid");
    if (!Number.isInteger(payload.dues_year) || Number(payload.dues_year) < 2024 || Number(payload.dues_year) > 2100) fail("source_preview_policy_year_invalid");
    if (!new Set(["president", "senior_vice_president", "vice_president_auditor_chair", "director", "member", "honorary"]).has(String(payload.tier_code))) fail("source_preview_policy_tier_invalid");
  }
}

function validateDecisionCoverage(sourceCode: ActiveV2Source, row: SourcePreviewRow): void {
  const kinds = row.decisions.map((decision) => decision.decision_kind).sort();
  let expected: DecisionKind[];
  if (sourceCode === "AGM36_PERIOD_BOUNDARY") expected = ["period_materialization"];
  else if (sourceCode === "GROUP_FOREIGN_FACULTY_2025") expected = ["group_allocation", "member_match"];
  else if (sourceCode === "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK" || sourceCode === "NOTION_ORGANIZATION_ROLE_HISTORY") expected = ["member_match"];
  else if (sourceCode === "LEDGER_DUES_POLICY_2024_2025" || sourceCode === "NOTION_DUES_REGULATION_DRAFT") expected = [];
  else if (sourceCode === "LEDGER_FINAL_2022_2025" && row.normalized_payload.coordinate_kind === "period_metadata") expected = ["period_materialization"];
  else {
    const classification = row.decisions.find((decision) => decision.decision_kind === "classification");
    expected = classification?.decision_payload.party_kind === "member" ? ["classification", "member_match"] : ["classification"];
  }
  if (JSON.stringify(kinds) !== JSON.stringify(expected)) fail("source_preview_decision_coverage_mismatch");
  const classification = row.decisions.find((decision) => decision.decision_kind === "classification");
  if (classification?.decision_payload.party_kind === "member" && !row.decisions.some((decision) => decision.decision_kind === "member_match")) fail("source_preview_member_match_required");
}

export function validateDecisionPayload(kind: DecisionKind, payload: JsonObject): void {
  exactKeys(payload, PAYLOAD_KEYS[kind], `source_preview_${kind}_keys_mismatch`);
  if (!OUTCOMES.has(String(payload.outcome))) fail("source_preview_outcome_invalid");
  if (kind === "classification") {
    for (const key of ["allocation_request_uid_or_null", "event_party_uid_or_null", "group_roster_batch_uid_or_null", "member_uid_or_null", "receipt_uid_or_null", "refund_receipt_uid_or_null", "reverses_event_uid_or_null"]) uuidOrNull(payload[key], `source_preview_${key}_invalid`);
    if (!Array.isArray(payload.category_splits)) fail("source_preview_category_splits_invalid");
    for (const split of payload.category_splits) {
      if (split === null || Array.isArray(split) || typeof split !== "object") fail("source_preview_category_split_invalid");
      const row = split as JsonObject; exactKeys(row, ["amount", "category_code"], "source_preview_category_split_keys_mismatch");
      canonicalMoneyOrNull(row.amount, "source_preview_category_split_amount_invalid"); nonempty(row.category_code, "source_preview_category_code_invalid");
    }
    if (payload.dues_year_or_null !== null && (!Number.isInteger(payload.dues_year_or_null) || Number(payload.dues_year_or_null) < 2022 || Number(payload.dues_year_or_null) > 2100)) fail("source_preview_dues_year_invalid");
  } else if (kind === "member_match") {
    uuidOrNull(payload.candidate_member_uid_or_null, "source_preview_candidate_member_uid_invalid");
    if (typeof payload.case_uid !== "string" || !UUID_V4.test(payload.case_uid)) fail("source_preview_case_uid_invalid");
    if (typeof payload.evidence_digest !== "string" || !SHA256.test(payload.evidence_digest)) fail("source_preview_evidence_digest_invalid");
    const evidenceKind = String(payload.evidence_kind);
    if (SCORE_BASIS[evidenceKind] !== payload.score_basis) fail("source_preview_score_basis_mismatch");
    if (evidenceKind === "name_only" && payload.outcome === "approve") fail("source_preview_name_only_approval_forbidden");
  } else if (kind === "group_allocation") {
    for (const key of ["allocation_request_uid_or_null", "assessment_uid_or_null", "group_member_uid_or_null", "member_uid_or_null", "primary_bank_batch_uid_or_null", "receipt_uid_or_null"]) uuidOrNull(payload[key], `source_preview_${key}_invalid`);
    canonicalMoneyOrNull(payload.amount_or_null, "source_preview_group_amount_invalid");
    if (payload.dues_year_or_null !== null && !Number.isInteger(payload.dues_year_or_null)) fail("source_preview_group_dues_year_invalid");
  } else {
    if (typeof payload.boundary_content_digest !== "string" || !SHA256.test(payload.boundary_content_digest)) fail("source_preview_boundary_digest_invalid");
    for (const key of ["period_code", "starts_at", "boundary_source_code", "boundary_coordinate_key"]) nonempty(payload[key], `source_preview_${key}_invalid`);
    if (payload.ends_at !== null) nonempty(payload.ends_at, "source_preview_ends_at_invalid");
  }
}

export function validateSourcePreviewInput(value: unknown): SourcePreviewInput {
  if (value === null || Array.isArray(value) || typeof value !== "object") fail("source_preview_input_invalid");
  const input = value as unknown as SourcePreviewInput;
  exactKeys(input as unknown as JsonObject, ["batch_uid", "captured_timezone", "coverage_from", "coverage_through", "decision_set_uid", "operation_uid", "release_uid", "rows", "schema_version", "source_code", "source_fingerprint", "source_revision", "source_uid"], "source_preview_input_keys_mismatch");
  if (input.schema_version !== SOURCE_PREVIEW_INPUT_SCHEMA || !ACTIVE_V2_SOURCES.includes(input.source_code)) fail("source_preview_contract_invalid");
  if (!UUID_V4.test(input.batch_uid) || !UUID_V4.test(input.decision_set_uid) || !UUID_V4.test(input.operation_uid) || !UUID_V4.test(input.release_uid) || !UUID.test(input.source_uid) || new Set([input.batch_uid, input.decision_set_uid, input.operation_uid]).size !== 3) fail("source_preview_uid_invalid");
  if (input.captured_timezone !== "Asia/Seoul" || !SHA256.test(input.source_fingerprint)) fail("source_preview_binding_invalid");
  nonempty(input.source_revision, "source_preview_revision_invalid");
  const coverageFrom = Date.parse(input.coverage_from); const coverageThrough = Date.parse(input.coverage_through);
  if (!Number.isFinite(coverageFrom) || !Number.isFinite(coverageThrough) || coverageFrom >= coverageThrough) fail("source_preview_coverage_invalid");
  if (!Array.isArray(input.rows) || input.rows.length === 0) fail("source_preview_rows_empty");
  const coordinates = new Set<string>();
  for (const row of input.rows) {
    exactKeys(row as unknown as JsonObject, ["coordinate_key", "coordinate_normalization_version", "decisions", "issue_status", "normalization_version", "normalized_payload", "raw_payload", "source_display_snapshot"], "source_preview_row_keys_mismatch");
    nonempty(row.coordinate_key, "source_preview_coordinate_invalid");
    if (coordinates.has(row.coordinate_key)) fail("source_preview_coordinate_duplicate"); coordinates.add(row.coordinate_key);
    nonempty(row.coordinate_normalization_version, "source_preview_coordinate_version_invalid"); nonempty(row.normalization_version, "source_preview_normalization_version_invalid");
    nonempty(row.source_display_snapshot, "source_preview_display_snapshot_invalid");
    if (!new Set(["accepted", "warning"]).has(row.issue_status)) fail("source_preview_issue_status_invalid");
    if (canonicalJson(row.raw_payload) !== canonicalJson(row.normalized_payload)) fail("source_preview_raw_allowlist_mismatch");
    validateSourcePayload(input.source_code, row.normalized_payload);
    const kinds = new Set<string>();
    for (const decision of row.decisions) {
      exactKeys(decision as unknown as JsonObject, ["decision_kind", "decision_payload"], "source_preview_decision_keys_mismatch");
      if (!DECISION_KINDS.has(decision.decision_kind) || kinds.has(decision.decision_kind)) fail("source_preview_decision_kind_invalid");
      kinds.add(decision.decision_kind); validateDecisionPayload(decision.decision_kind, decision.decision_payload);
    }
    validateDecisionCoverage(input.source_code, row);
  }
  if (sourceFingerprint(input) !== input.source_fingerprint) fail("source_preview_fingerprint_mismatch");
  return input;
}

export function buildDecisionManifest(input: SourcePreviewInput) {
  const items = input.rows.flatMap((row) => row.decisions.map((decision) => ({
    coordinate_key: row.coordinate_key,
    decision_kind: decision.decision_kind,
    decision_payload: decision.decision_payload,
    decision_payload_sha256: sha256(canonicalJson(decision.decision_payload)),
    source_content_digest: contentDigest(row.normalized_payload),
  }))).sort((left, right) => utf8Compare(`${left.coordinate_key}\u0000${left.decision_kind}`, `${right.coordinate_key}\u0000${right.decision_kind}`));
  const manifestItems = items.map((item, index) => ({ ordinal: index + 1, coordinate_key: item.coordinate_key, source_content_digest: item.source_content_digest, decision_kind: item.decision_kind, decision_payload_sha256: item.decision_payload_sha256 }));
  const manifest = { schema_version: SOURCE_DECISION_MANIFEST_SCHEMA, batch_uid: input.batch_uid, source_fingerprint: input.source_fingerprint, items: manifestItems };
  return { items: items.map((item, index) => ({ ...item, ordinal: index + 1 })), manifest, manifestSha256: sha256(canonicalJson(manifest)) };
}
