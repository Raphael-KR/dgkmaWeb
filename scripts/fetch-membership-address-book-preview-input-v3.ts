import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { google } from "googleapis";
import { normalizeMembershipIdentityRowV3 } from "../server/accounting/adapters/membership-integrated-address-book-v3";
import { sourceFingerprint, validateSourcePreviewInput, type SourcePreviewInput } from "../server/accounting/source-preview-contract-v2";

const SPREADSHEET_ID = "1YBu0MtJ3lt2AB1-DB3-u7NP-TSgehKmGK3Ox4PJCzLw";
const SHEET_ID = 876761083;
const TITLE = "통합주소록";
const RANGE = "'통합주소록'!A1:L3459";
const PROFILE_PATH = "docs/source-contracts/profiles/membership-integrated-address-book-v3.json";
const PLAN_PATH = "docs/source-contracts/releases/membership-address-book-development-release-plan-v3.json";
const SOURCE_UID = "5a47bd83-4d99-59bf-8525-7d0f4667ec75";
type Profile = { observed_at: string; source_revision: string; tabs: Array<{ header_candidates: Array<{ row: number; values_sha256: string }>; max_column: number; max_row: number; tab_id: string; title: string }> };

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " "); }
function sha(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function deterministicUuidV4(seed: string): string { const bytes = createHash("sha256").update(seed).digest().subarray(0, 16); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80; const hex = bytes.toString("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`; }
function reason(error: unknown): string { const message = error instanceof Error ? error.message : "unknown"; return message.startsWith("mapping_review_required:") ? message : "membership_address_book_row_invalid"; }

async function main() {
  const output = arg("--output");
  if (!(output.startsWith("/tmp/") || output.startsWith("/private/tmp/")) || existsSync(output)) fail("membership_address_book_output_invalid");
  const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8")) as Profile;
  const plan = JSON.parse(readFileSync(PLAN_PATH, "utf8")) as { release_uid: string };
  const credentials = { type: "service_account", project_id: "dynamic-waters-446615-e5", private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"), client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, token_uri: "https://oauth2.googleapis.com/token" };
  if (!credentials.private_key || !credentials.client_email) fail("google_service_account_unavailable");
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly", "https://www.googleapis.com/auth/drive.metadata.readonly"] });
  const [driveResult, sheetResult, sentinelResult, valuesResult] = await Promise.all([
    google.drive({ version: "v3", auth }).files.get({ fileId: SPREADSHEET_ID, fields: "version,modifiedTime" }),
    google.sheets({ version: "v4", auth }).spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))" }),
    google.sheets({ version: "v4", auth }).spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: "'통합주소록'!A1:L10" }),
    google.sheets({ version: "v4", auth }).spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: RANGE, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" }),
  ]);
  const revision = `drive-version:${driveResult.data.version};modified:${driveResult.data.modifiedTime}`;
  if (revision !== profile.source_revision) fail("membership_address_book_source_profile_stale");
  const tabProfile = profile.tabs[0]; const tabs = (sheetResult.data.sheets ?? []).filter((sheet) => sheet.properties?.sheetId === SHEET_ID);
  if (profile.tabs.length !== 1 || tabs.length !== 1 || tabProfile.tab_id !== String(SHEET_ID) || tabProfile.title !== TITLE || tabs[0].properties?.title !== TITLE || tabs[0].properties?.gridProperties?.rowCount !== tabProfile.max_row || tabs[0].properties?.gridProperties?.columnCount !== tabProfile.max_column) fail("membership_address_book_tab_profile_drift");
  const providerRows = valuesResult.data.values ?? []; const sentinelRows = sentinelResult.data.values ?? [];
  for (const candidate of tabProfile.header_candidates) if (sha(sentinelRows[candidate.row - 1] ?? []) !== candidate.values_sha256) fail("membership_address_book_header_candidate_drift");
  const headers = (providerRows[0] ?? []).map(text); const required = ["성명", "기수", "입학일자", "졸업일자", "그룹", "상태"];
  const indices: Record<string, number> = {};
  for (const header of required) { const found = headers.flatMap((value, index) => value === header ? [index] : []); if (found.length !== 1) fail("membership_address_book_header_contract_mismatch"); indices[header] = found[0]; }
  const rows: SourcePreviewInput["rows"] = []; const blockers: Record<string, number> = {};
  for (let rowNumber = 2; rowNumber <= tabProfile.max_row; rowNumber += 1) {
    const providerRow = providerRows[rowNumber - 1] ?? []; if (providerRow.every((value) => text(value) === "")) continue;
    const sourceRow = Object.fromEntries(required.map((header) => [header, providerRow[indices[header]]]));
    try {
      const payload = normalizeMembershipIdentityRowV3(sourceRow);
      rows.push({ coordinate_key: `sheet:${SPREADSHEET_ID}:${SHEET_ID}:row:${rowNumber}`, coordinate_normalization_version: "coordinate-v1", issue_status: "warning", normalization_version: "membership-integrated-address-book-v3@3.0.0+numeric-source-cells-v1", normalized_payload: payload, raw_payload: payload, source_display_snapshot: TITLE, decisions: [{ decision_kind: "member_match", decision_payload: { candidate_member_uid_or_null: null, case_uid: deterministicUuidV4(`membership-address-book-member-match\n${rowNumber}`), evidence_digest: payload.name_key_digest, evidence_kind: "name_only", outcome: "quarantine", score_basis: "name_only_unapprovable" } }] });
    } catch (error) { const code = reason(error); blockers[code] = (blockers[code] ?? 0) + 1; }
  }
  if (Object.keys(blockers).length > 0 || rows.length !== 3458) { console.error(JSON.stringify({ schema_version: "membership-address-book-preview-input-error-v3", blocker_counts: blockers, provider_row_count: providerRows.length, normalized_row_count: rows.length, output_created: false, result: "blocked_mapping" })); process.exitCode = 2; return; }
  const dates = rows.flatMap((row) => [row.normalized_payload.admitted_on, row.normalized_payload.graduated_on]).filter((value): value is string => typeof value === "string").sort(); if (dates.length === 0) fail("membership_address_book_coverage_start_missing");
  const input: SourcePreviewInput = { schema_version: "accounting-source-preview-input-v2", source_code: "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK", source_uid: SOURCE_UID, release_uid: plan.release_uid, source_revision: revision, source_fingerprint: "0".repeat(64), operation_uid: randomUUID(), batch_uid: randomUUID(), decision_set_uid: randomUUID(), captured_timezone: "Asia/Seoul", coverage_from: `${dates[0]}T00:00:00+09:00`, coverage_through: profile.observed_at, rows };
  input.source_fingerprint = sourceFingerprint(input); validateSourcePreviewInput(input); writeFileSync(output, `${JSON.stringify(input)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(output, 0o600);
  console.log(JSON.stringify({ schema_version: "membership-address-book-preview-input-result-v3", source_code: input.source_code, source_fingerprint: input.source_fingerprint, row_count: rows.length, decision_item_count: rows.length, proposed_outcome: "quarantine", source_revision_sha256: createHash("sha256").update(revision).digest("hex"), output_created: true, result: "materialized" }));
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "membership-address-book-preview-input-error-v3", error_code: error instanceof Error ? error.message : "unknown", output_created: false, result: "rejected" })); process.exitCode = 1; });
