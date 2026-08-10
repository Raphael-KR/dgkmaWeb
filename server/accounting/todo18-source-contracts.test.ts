import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

const sourceCodes = [
  "AGM36_PERIOD_BOUNDARY",
  "BANK_IBK_2026",
  "BANK_TOSS_2026",
  "GROUP_FOREIGN_FACULTY_2025",
  "LEDGER_DUES_POLICY_2024_2025",
  "LEDGER_FINAL_2022_2025",
  "LEGACY_PAYMENTS",
  "NOTION_DUES_REGULATION_DRAFT",
] as const;

const expected = {
  AGM36_PERIOD_BOUNDARY: ["boundary_content_digest", "boundary_coordinate_key", "boundary_source_code", "ends_at", "period_code", "starts_at"],
  BANK_IBK_2026: ["amount", "balance_after", "direction", "occurred_at", "payer_digest", "posted_date", "provider_row_id"],
  BANK_TOSS_2026: ["amount", "balance_after", "direction", "occurred_at", "payer_digest", "posted_date", "provider_row_id"],
  GROUP_FOREIGN_FACULTY_2025: ["generation", "group_digest", "member_name_digest", "proposed_amount"],
  LEDGER_DUES_POLICY_2024_2025: ["annual_minimum", "due_day", "dues_year", "monthly_minimum", "reminder_day", "tier_code"],
  LEDGER_FINAL_2022_2025: ["amount", "boundary_content_digest", "boundary_coordinate_key", "boundary_source_code", "coordinate_key", "coordinate_kind", "description_digest", "direction", "dues_year", "ends_at", "occurred_at", "occurred_date", "payer_digest", "period_code", "starts_at"],
  LEGACY_PAYMENTS: ["amount_parse", "created_at", "payment_id", "source_amount_signed", "source_timezone", "status", "type", "user_id", "year"],
  NOTION_DUES_REGULATION_DRAFT: ["annual_minimum", "due_day", "dues_year", "monthly_minimum", "reminder_day", "tier_code"],
} as const;

const slug = (code: string) => code.toLowerCase().replaceAll("_", "-");
const approvalTextSha256 = "4deadf14f86ef47173597801c8daa072cc065c2fd6c93708ac802ebd0e665cff";
const readCanonical = (path: string) => {
  const bytes = readFileSync(path, "utf8");
  const value = JSON.parse(bytes) as Record<string, CanonicalValue>;
  assert.equal(bytes, `${canonicalJson(value)}\n`, `${path}:canonical_json_lf`);
  return { bytes, value };
};

test("Todo 18 deferred profiles and mappings are canonical, self-bound, and complete", () => {
  for (const sourceCode of sourceCodes) {
    const profile = readCanonical(`docs/source-contracts/profiles/${slug(sourceCode)}.json`);
    const mapping = readCanonical(`docs/source-contracts/mappings/${slug(sourceCode)}-v1.json`);
    const approval = readCanonical(`docs/source-contracts/approvals/${slug(sourceCode)}-v1.json`);
    const profilePreimage = { ...profile.value };
    delete profilePreimage.profile_sha256;
    assert.equal(profile.value.profile_sha256, sha256(canonicalJson(profilePreimage)), `${sourceCode}:profile_self_hash`);
    assert.equal(mapping.value.source_code, sourceCode);
    assert.equal(mapping.value.source_profile_sha256, profile.value.profile_sha256);
    assert.equal(mapping.value.locator, profile.value.locator);
    assert.equal(mapping.value.surface, profile.value.surface);
    const columns = mapping.value.columns as Array<Record<string, CanonicalValue>>;
    const targets = columns.map((entry) => String(entry.target_field));
    assert.deepEqual(targets, [...expected[sourceCode]].sort((a, b) => a.localeCompare(b)), `${sourceCode}:target_coverage`);
    assert.equal(new Set(targets).size, targets.length, `${sourceCode}:duplicate_target`);
    const parsers = mapping.value.parsers as Record<string, CanonicalValue>;
    for (const entry of columns) assert.ok(Object.hasOwn(parsers, String(entry.parser_code)), `${sourceCode}:parser_missing`);
    assert.doesNotMatch(mapping.bytes, /receipt_url.*target_field|상대계좌번호.*target_field|계좌번호.*target_field|CMS코드.*target_field/);
    const approvalPreimage = { ...approval.value };
    delete approvalPreimage.receipt_sha256;
    assert.equal(approval.value.receipt_sha256, sha256(canonicalJson(approvalPreimage)), `${sourceCode}:approval_self_hash`);
    assert.equal(approval.value.schema_version, "source-mapping-approval-v1");
    assert.equal(approval.value.provider, "codex-app");
    assert.equal(approval.value.platform_thread_id, "019fe3d1-7669-7911-b30f-2ebc99d3245a");
    assert.equal(approval.value.platform_message_id, "item-368");
    assert.equal(approval.value.platform_message_created_at, "2026-08-10T05:15:03Z");
    assert.equal(approval.value.approved_at, "2026-08-10T05:15:03Z");
    assert.equal(approval.value.approval_text_sha256, approvalTextSha256);
    assert.equal(approval.value.source_profile_sha256, profile.value.profile_sha256);
    assert.equal(approval.value.mapping_sha256, sha256(mapping.bytes));
  }
});

test("foreign faculty rows remain candidate-only and cannot imply allocation approval", () => {
  const mapping = readCanonical("docs/source-contracts/mappings/group-foreign-faculty-2025-v1.json").value;
  const constants = mapping.constants as Record<string, CanonicalValue>;
  assert.equal(constants.candidate_only, true);
  assert.equal(constants.proposed_amount, "50000");
  assert.equal(constants.proposed_amount_basis, "LEDGER_DUES_POLICY_2024_2025:2025:member");
  assert.equal(canonicalJson(mapping).includes("auto_approve"), false);
});

test("Notion regulation remains draft-only and legacy import excludes receipt URL", () => {
  const notion = readCanonical("docs/source-contracts/mappings/notion-dues-regulation-draft-v1.json").value;
  assert.equal((notion.constants as Record<string, CanonicalValue>).status_effect, "draft_only");
  const legacy = readCanonical("docs/source-contracts/mappings/legacy-payments-v1.json").value;
  assert.equal((legacy.constants as Record<string, CanonicalValue>).receipt_url_excluded, true);
});
