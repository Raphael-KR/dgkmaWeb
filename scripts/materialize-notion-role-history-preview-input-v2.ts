import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { normalizeNotionRoleRowV3 } from "../server/accounting/adapters/notion-organization-role-history-v3";
import { sourceFingerprint, validateSourcePreviewInput, type SourcePreviewInput } from "../server/accounting/source-preview-contract-v2";

const DATA_SOURCE_ID = "dae9352c-122b-4902-bdb8-31328c35940f";
const DATA_SOURCE_TITLE = "조직·직책 이력 — 개발 중 편집 권위";
const SOURCE_UID = "75dd7485-9c2b-51a9-845f-e7baa6ba8dc1";
const PROFILE_PATH = "docs/source-contracts/profiles/notion-organization-role-history.json";
const PLAN_PATH = "docs/source-contracts/releases/notion-role-history-development-release-plan-v3.json";
type JsonObject = Record<string, unknown>;
type Profile = { database_columns: string[]; observed_at: string; source_revision: string };
type Observation = { data_source_id: string; rows: JsonObject[]; source_revision: string };

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
function ephemeral(path: string, code: string): void { if (!(path.startsWith("/tmp/") || path.startsWith("/private/tmp/"))) fail(code); }
function exactKeys(value: object, keys: string[], code: string): void { if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(code); }
function deterministicUuidV4(seed: string): string { const bytes = createHash("sha256").update(seed).digest().subarray(0, 16); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80; const hex = bytes.toString("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`; }
function pageId(url: unknown): string { const value = typeof url === "string" ? url : ""; const match = value.match(/([0-9a-f]{32})(?:\?|$)/i); if (!match) fail("notion_role_page_url_invalid"); const id = match[1].toLowerCase(); return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`; }
function reasonCode(error: unknown): string { const message = error instanceof Error ? error.message : "unknown"; return message.startsWith("mapping_review_required:") ? message.split(":").slice(0, 2).join(":") : message; }

export function materializeNotionRoleHistory(value: unknown, profile: Profile): { blockers: Record<string, number>; input: SourcePreviewInput | null; rowCount: number } {
  if (value === null || Array.isArray(value) || typeof value !== "object") fail("notion_role_observation_invalid");
  const observation = value as Observation; exactKeys(observation, ["data_source_id", "rows", "source_revision"], "notion_role_observation_keys_mismatch");
  if (observation.data_source_id !== DATA_SOURCE_ID || observation.source_revision !== profile.source_revision) fail("notion_role_observation_profile_drift");
  if (!Array.isArray(observation.rows) || observation.rows.length === 0) fail("notion_role_observation_rows_empty");
  const blockers: Record<string, number> = {}; const normalizedRows: Array<{ id: string; payload: JsonObject }> = []; const seen = new Set<string>();
  for (const row of observation.rows) {
    if (row === null || Array.isArray(row) || typeof row !== "object") fail("notion_role_row_invalid");
    exactKeys(row, profile.database_columns, "notion_role_row_keys_mismatch");
    let id: string;
    try { id = pageId(row.url); } catch (error) { const code = reasonCode(error); blockers[code] = (blockers[code] ?? 0) + 1; continue; }
    if (seen.has(id)) fail("notion_role_page_duplicate"); seen.add(id);
    try { normalizedRows.push({ id, payload: normalizeNotionRoleRowV3(row) }); }
    catch (error) { const code = reasonCode(error); blockers[code] = (blockers[code] ?? 0) + 1; }
  }
  if (Object.keys(blockers).length > 0) return { blockers: Object.fromEntries(Object.entries(blockers).sort()), input: null, rowCount: observation.rows.length };
  normalizedRows.sort((left, right) => Buffer.compare(Buffer.from(left.id), Buffer.from(right.id)));
  const rows: SourcePreviewInput["rows"] = normalizedRows.map(({ id, payload }) => ({
    coordinate_key: `notion:page:${id}`, coordinate_normalization_version: "coordinate-v1", issue_status: "warning",
    normalization_version: "notion-organization-role-history-v3@3.0.0+nullable-quarantine-v1", normalized_payload: payload as SourcePreviewInput["rows"][number]["normalized_payload"], raw_payload: payload as SourcePreviewInput["rows"][number]["raw_payload"],
    source_display_snapshot: DATA_SOURCE_TITLE,
    decisions: [{ decision_kind: "member_match", decision_payload: { candidate_member_uid_or_null: null, case_uid: deterministicUuidV4(`notion-role-member-match\n${id}`), evidence_digest: String(payload.name_key_digest), evidence_kind: "name_only", outcome: "quarantine", score_basis: "name_only_unapprovable" } }],
  }));
  const starts = rows.map((row) => row.normalized_payload.effective_from).filter((value): value is string => typeof value === "string").sort(); if (starts.length === 0) fail("notion_role_coverage_start_missing");
  const plan = JSON.parse(readFileSync(PLAN_PATH, "utf8")) as { release_uid: string };
  const input: SourcePreviewInput = { schema_version: "accounting-source-preview-input-v2", source_code: "NOTION_ORGANIZATION_ROLE_HISTORY", source_uid: SOURCE_UID, release_uid: plan.release_uid, source_revision: profile.source_revision, source_fingerprint: "0".repeat(64), operation_uid: randomUUID(), batch_uid: randomUUID(), decision_set_uid: randomUUID(), captured_timezone: "Asia/Seoul", coverage_from: starts[0], coverage_through: profile.observed_at, rows };
  input.source_fingerprint = sourceFingerprint(input); validateSourcePreviewInput(input); return { blockers, input, rowCount: rows.length };
}

function main() {
  const observationPath = arg("--observation"); const outputPath = arg("--output"); if (observationPath !== "-") ephemeral(observationPath, "notion_role_observation_must_be_ephemeral"); ephemeral(outputPath, "notion_role_output_must_be_ephemeral");
  if (observationPath !== "-" && (statSync(observationPath).mode & 0o077) !== 0) fail("notion_role_observation_mode_invalid"); if (existsSync(outputPath)) fail("notion_role_output_must_not_exist");
  const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8")) as Profile; const observationBytes = readFileSync(observationPath === "-" ? 0 : observationPath, "utf8"); const result = materializeNotionRoleHistory(JSON.parse(observationBytes), profile);
  if (!result.input) { console.error(JSON.stringify({ schema_version: "notion-role-history-preview-input-error-v2", source_code: "NOTION_ORGANIZATION_ROLE_HISTORY", row_count: result.rowCount, blocker_counts: result.blockers, output_created: false, result: "blocked_mapping" })); process.exitCode = 2; return; }
  writeFileSync(outputPath, `${JSON.stringify(result.input)}\n`, { mode: 0o600 }); chmodSync(outputPath, 0o600);
  console.log(JSON.stringify({ schema_version: "notion-role-history-preview-input-result-v2", source_code: result.input.source_code, source_fingerprint: result.input.source_fingerprint, row_count: result.rowCount, decision_item_count: result.rowCount, proposed_outcome: "quarantine", output_created: true, result: "materialized" }));
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { main(); } catch (error) { console.error(JSON.stringify({ schema_version: "notion-role-history-preview-input-error-v2", error_code: error instanceof Error ? error.message : "unknown", output_created: false, result: "rejected" })); process.exitCode = 1; }
}
