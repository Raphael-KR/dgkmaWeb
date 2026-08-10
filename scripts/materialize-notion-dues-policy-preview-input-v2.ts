import { randomUUID } from "node:crypto";
import { chmodSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { sourceFingerprint, validateSourcePreviewInput, type SourcePreviewInput } from "../server/accounting/source-preview-contract-v2";

const PAGE_ID = "3aa2225d-9c4d-8188-b661-ce08b2cfed2f";
const SOURCE_UID = "6dc3cdbe-11b4-538e-b703-ae48ddc6c7db";
const RELEASE_UID = "4604c702-3633-4a34-b389-9bc0d36aebec";
const PROFILE = "docs/source-contracts/profiles/notion-dues-regulation-draft.json";
const DISPLAY = "별표 1. 2026년 직책별 회비 기준";
const TIERS = ["president", "senior_vice_president", "vice_president_auditor_chair", "director", "member", "honorary"];
type Policy = { annual_minimum: string; due_day: number; dues_year: number; monthly_minimum: string; reminder_day: number; tier_code: string };
type Observation = { page_id: string; last_edited_time: string; source_display_snapshot: string; policies: Policy[] };

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
function ephemeral(path: string, code: string): void { if (!(path.startsWith("/tmp/") || path.startsWith("/private/tmp/"))) fail(code); }
function exactKeys(value: object, keys: string[], code: string): void { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code); }

function validateObservation(value: unknown, expectedRevision: string): Observation {
  if (value === null || Array.isArray(value) || typeof value !== "object") fail("notion_policy_observation_invalid");
  const observation = value as Observation; exactKeys(observation, ["last_edited_time", "page_id", "policies", "source_display_snapshot"], "notion_policy_observation_keys_mismatch");
  if (observation.page_id !== PAGE_ID || `notion-last-edited:${observation.last_edited_time}` !== expectedRevision || observation.source_display_snapshot !== DISPLAY) fail("notion_policy_observation_profile_drift");
  if (!Array.isArray(observation.policies) || observation.policies.length !== 6) fail("notion_policy_observation_coverage_mismatch");
  for (let index = 0; index < observation.policies.length; index += 1) {
    const policy = observation.policies[index]; exactKeys(policy, ["annual_minimum", "due_day", "dues_year", "monthly_minimum", "reminder_day", "tier_code"], "notion_policy_row_keys_mismatch");
    if (policy.tier_code !== TIERS[index] || policy.dues_year !== 2026 || policy.due_day !== 10 || policy.reminder_day !== 11) fail("notion_policy_row_order_mismatch");
  }
  return observation;
}

function main() {
  const observationPath = arg("--observation"); const outputPath = arg("--output"); ephemeral(observationPath, "notion_policy_observation_must_be_ephemeral"); ephemeral(outputPath, "notion_policy_output_must_be_ephemeral");
  if ((statSync(observationPath).mode & 0o077) !== 0) fail("notion_policy_observation_mode_invalid");
  const profile = JSON.parse(readFileSync(PROFILE, "utf8")) as { source_revision: string };
  const observation = validateObservation(JSON.parse(readFileSync(observationPath, "utf8")), profile.source_revision);
  const rows: SourcePreviewInput["rows"] = observation.policies.map((payload) => ({ coordinate_key: `notion:page:${PAGE_ID}:appendix-1:tier:${payload.tier_code}`, coordinate_normalization_version: "coordinate-v1", issue_status: "accepted", normalization_version: "notion-dues-draft-v2@2.0.0+admin-readable-v1", normalized_payload: payload, raw_payload: payload, source_display_snapshot: observation.source_display_snapshot, decisions: [] }));
  const input: SourcePreviewInput = { schema_version: "accounting-source-preview-input-v2", source_code: "NOTION_DUES_REGULATION_DRAFT", source_uid: SOURCE_UID, release_uid: RELEASE_UID, source_revision: profile.source_revision, source_fingerprint: "0".repeat(64), operation_uid: randomUUID(), batch_uid: randomUUID(), decision_set_uid: randomUUID(), captured_timezone: "Asia/Seoul", coverage_from: "2026-01-01T00:00:00+09:00", coverage_through: "2027-01-01T00:00:00+09:00", rows };
  input.source_fingerprint = sourceFingerprint(input); validateSourcePreviewInput(input); writeFileSync(outputPath, `${JSON.stringify(input)}\n`, { mode: 0o600 }); chmodSync(outputPath, 0o600);
  console.log(JSON.stringify({ schema_version: "notion-dues-policy-preview-input-result-v2", source_code: input.source_code, source_fingerprint: input.source_fingerprint, row_count: rows.length, decision_item_count: 0, source_revision: profile.source_revision, result: "materialized" }));
}
try { main(); } catch (error) { console.error(JSON.stringify({ schema_version: "notion-dues-policy-preview-input-error-v2", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; }
