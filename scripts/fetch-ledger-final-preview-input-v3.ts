import { createHash, randomUUID } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { google } from "googleapis";
import { ledgerPeriodRowV3, normalizeLedgerFinalRowV3 } from "../server/accounting/adapters/ledger-final-2022-2025-v3";
import { sourceFingerprint, validateSourcePreviewInput, type SourcePreviewInput } from "../server/accounting/source-preview-contract-v2";

const SPREADSHEET_ID = "1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k";
const SOURCE_UID = "73f14b07-62dc-5643-b56e-533d4415f5aa";
const RELEASE_UID = "6ec542d2-61e4-41ed-8813-946297185a99";
const PROFILE_PATH = "docs/source-contracts/profiles/ledger-final-2022-2025-v3.json";
const MAPPING_PATH = "docs/source-contracts/mappings/ledger-final-2022-2025-v3.json";
const SCHEMA_HEADERS = ["거래일시", "거래금액", "구분", "내용", "거래구분", "메모"];

type Profile = { source_revision: string; tabs: Array<{ header_candidates: Array<{ row: number; values_sha256: string }>; max_column: number; max_row: number; tab_id: string; title: string }> };
type Selector = { a1_range_or_null: string | null; data_start_row_or_null: number | null; header_row_or_null: number | null; record_kind: string; selector_code: string; tab_id_or_null: string | null; tab_title_snapshot_or_null: string | null };
type Mapping = { record_selectors: Selector[] };

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " "); }
function sha(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function columnName(column: number): string { let value = column; let result = ""; while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); } return result; }
function tabRange(title: string, range: string): string { return `'${title.replaceAll("'", "''")}'!${range}`; }
function rangeStartRow(range: string): number { const match = range.match(/^[A-Z]+(\d+):/); return match ? Number(match[1]) : fail("ledger_v3_range_invalid"); }
function classification(direction: string) {
  return { allocation_request_uid_or_null: null, category_splits: [], classification_kind: "pending_manual_source_decision", direction, dues_year_or_null: null, event_kind: direction === "credit" ? "unclassified_credit" : "unclassified_debit", event_party_uid_or_null: null, group_roster_batch_uid_or_null: null, member_uid_or_null: null, outcome: "quarantine", party_kind: "unknown", receipt_uid_or_null: null, refund_receipt_uid_or_null: null, reverses_event_uid_or_null: null };
}

async function main() {
  const output = arg("--output");
  if (!(output.startsWith("/tmp/") || output.startsWith("/private/tmp/")) || existsSync(output)) fail("ledger_v3_output_invalid");
  const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8")) as Profile;
  const mapping = JSON.parse(readFileSync(MAPPING_PATH, "utf8")) as Mapping;
  const credentials = { type: "service_account", project_id: "dynamic-waters-446615-e5", private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"), client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, token_uri: "https://oauth2.googleapis.com/token" };
  if (!credentials.private_key || !credentials.client_email) fail("google_service_account_unavailable");
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly", "https://www.googleapis.com/auth/drive.metadata.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const economic = mapping.record_selectors.filter((selector) => selector.record_kind === "economic");
  const headerRanges = profile.tabs.flatMap((tab) => tab.header_candidates.map((candidate) => tabRange(tab.title, `A${candidate.row}:${columnName(tab.max_column)}${candidate.row}`)));
  const selectorRanges = economic.map((selector) => tabRange(String(selector.tab_title_snapshot_or_null), String(selector.a1_range_or_null)));
  const [driveResult, spreadsheetResult, headerResult, valuesResult] = await Promise.all([
    google.drive({ version: "v3", auth }).files.get({ fileId: SPREADSHEET_ID, fields: "version,modifiedTime" }),
    sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))" }),
    sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: headerRanges, valueRenderOption: "FORMATTED_VALUE" }),
    sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: selectorRanges, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" }),
  ]);
  const revision = `drive-version:${driveResult.data.version};modified:${driveResult.data.modifiedTime}`;
  if (revision !== profile.source_revision) fail("ledger_v3_source_profile_stale");
  let headerOffset = 0;
  for (const tab of profile.tabs) {
    const provider = (spreadsheetResult.data.sheets ?? []).filter((sheet) => String(sheet.properties?.sheetId) === tab.tab_id);
    if (provider.length !== 1 || provider[0].properties?.title !== tab.title || provider[0].properties?.gridProperties?.rowCount !== tab.max_row || provider[0].properties?.gridProperties?.columnCount !== tab.max_column) fail("ledger_v3_tab_profile_drift");
    for (const candidate of tab.header_candidates) {
      const row = headerResult.data.valueRanges?.[headerOffset]?.values?.[0] ?? [];
      if (sha(row) !== candidate.values_sha256) fail("ledger_v3_header_profile_drift");
      headerOffset += 1;
    }
  }
  const rows: SourcePreviewInput["rows"] = [];
  const blockers: Record<string, number> = {};
  for (const [selectorIndex, selector] of economic.entries()) {
    const providerRows = valuesResult.data.valueRanges?.[selectorIndex]?.values ?? [];
    const rangeFirstRow = rangeStartRow(String(selector.a1_range_or_null));
    const headerOffsetWithinRange = Number(selector.header_row_or_null) - rangeFirstRow;
    const headers = (providerRows[headerOffsetWithinRange] ?? []).map(text);
    const positions = Object.fromEntries(SCHEMA_HEADERS.map((header) => [header, headers.flatMap((value, index) => value === header ? [index] : [])]));
    if (positions["거래일시"].length !== 1 || positions["거래금액"].length !== 1 || SCHEMA_HEADERS.some((header) => positions[header].length > 1)) fail("ledger_v3_selector_header_contract_mismatch");
    const dataOffset = Number(selector.data_start_row_or_null) - rangeFirstRow;
    for (let offset = dataOffset; offset < providerRows.length; offset += 1) {
      const providerRow = providerRows[offset] ?? [];
      if (providerRow.every((value) => text(value) === "")) continue;
      const rowNumber = rangeFirstRow + offset;
      const coordinateKey = `sheet:${SPREADSHEET_ID}:${selector.tab_id_or_null}:${selector.selector_code}:row:${rowNumber}`;
      const sourceValues = Object.fromEntries(SCHEMA_HEADERS.map((header) => [header, positions[header].length === 1 ? providerRow[positions[header][0]] ?? null : null]));
      try {
        const payload = normalizeLedgerFinalRowV3({ coordinateKey, values: sourceValues });
        rows.push({ coordinate_key: coordinateKey, coordinate_normalization_version: "coordinate-v2", issue_status: "warning", normalization_version: "final-ledger-v3@3.0.0+reproducible-profile-v1", normalized_payload: payload, raw_payload: payload, source_display_snapshot: String(selector.tab_title_snapshot_or_null), decisions: [{ decision_kind: "classification", decision_payload: classification(payload.direction) }] });
      } catch (error) {
        const code = error instanceof Error && error.message.startsWith("ledger_v3_") ? error.message : "ledger_v3_row_invalid";
        blockers[code] = (blockers[code] ?? 0) + 1;
      }
    }
  }
  for (const year of [2022, 2023, 2024, 2025]) {
    const payload = ledgerPeriodRowV3(year);
    rows.push({ coordinate_key: payload.boundary_coordinate_key, coordinate_normalization_version: "coordinate-v1", issue_status: "accepted", normalization_version: "final-ledger-v3@3.0.0+reproducible-profile-v1", normalized_payload: payload, raw_payload: payload, source_display_snapshot: `CALENDAR_${year}`, decisions: [{ decision_kind: "period_materialization", decision_payload: { boundary_content_digest: payload.boundary_content_digest, boundary_coordinate_key: payload.boundary_coordinate_key, boundary_source_code: payload.boundary_source_code, ends_at: payload.ends_at, outcome: "approve", period_code: payload.period_code, starts_at: payload.starts_at } }] });
  }
  if (Object.keys(blockers).length > 0 || rows.length !== 3018) { console.error(JSON.stringify({ schema_version: "ledger-final-preview-input-error-v3", blocker_counts: blockers, normalized_row_count: rows.length, expected_row_count: 3018, output_created: false, original_write_count: 0, result: "blocked_mapping" })); process.exitCode = 2; return; }
  const input: SourcePreviewInput = { schema_version: "accounting-source-preview-input-v2", source_code: "LEDGER_FINAL_2022_2025", source_uid: SOURCE_UID, release_uid: RELEASE_UID, source_revision: revision, source_fingerprint: "0".repeat(64), operation_uid: randomUUID(), batch_uid: randomUUID(), decision_set_uid: randomUUID(), captured_timezone: "Asia/Seoul", coverage_from: "2022-01-01T00:00:00+09:00", coverage_through: "2026-01-01T00:00:00+09:00", rows };
  input.source_fingerprint = sourceFingerprint(input); validateSourcePreviewInput(input);
  writeFileSync(output, `${JSON.stringify(input)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(output, 0o600);
  console.log(JSON.stringify({ schema_version: "ledger-final-preview-input-result-v3", source_code: input.source_code, source_fingerprint: input.source_fingerprint, economic_row_count: rows.length - 4, period_row_count: 4, quarantine_classification_count: rows.length - 4, period_candidate_count: 4, source_revision_sha256: createHash("sha256").update(revision).digest("hex"), output_created: true, original_write_count: 0, result: "materialized" }));
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "ledger-final-preview-input-error-v3", error_code: error instanceof Error ? error.message : "unknown", output_created: false, original_write_count: 0, result: "rejected" })); process.exitCode = 1; });
