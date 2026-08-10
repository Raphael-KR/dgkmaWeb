import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { google } from "googleapis";

const SPREADSHEET_ID = "1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k";
const PROFILE_PATH = "docs/source-contracts/profiles/ledger-final-2022-2025.json";
const MAPPING_PATH = "docs/source-contracts/mappings/ledger-final-2022-2025-v2.json";
const REQUIRED_HEADERS = ["거래일시", "거래금액"];
const DESCRIPTION_HEADERS = ["내용", "거래구분", "메모"];

type Profile = {
  source_revision: string;
  tabs: Array<{
    header_candidates: Array<{ row: number; values_sha256: string }>;
    max_column: number;
    max_row: number;
    tab_id: string;
    title: string;
  }>;
};
type Selector = {
  a1_range_or_null: string | null;
  data_start_row_or_null: number | null;
  header_row_or_null: number | null;
  record_kind: string;
  selector_code: string;
  tab_id_or_null: string | null;
  tab_title_snapshot_or_null: string | null;
};
type Mapping = { record_selectors: Selector[]; source_profile_sha256: string };

function fail(code: string): never { throw new Error(code); }
function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " "); }
function sha(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function columnName(column: number): string {
  let value = column; let result = "";
  while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); }
  return result;
}
function tabRange(title: string, range: string): string { return `'${title.replaceAll("'", "''")}'!${range}`; }
function rangeStartRow(range: string): number { const match = range.match(/^[A-Z]+(\d+):/); return match ? Number(match[1]) : fail("ledger_preflight_range_invalid"); }
function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = text(value).replaceAll(",", "").replaceAll("원", "").replace(/[^0-9.-]/g, "");
  return /^-?\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

async function main() {
  const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8")) as Profile;
  const mapping = JSON.parse(readFileSync(MAPPING_PATH, "utf8")) as Mapping;
  const credentials = { type: "service_account", project_id: "dynamic-waters-446615-e5", private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"), client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, token_uri: "https://oauth2.googleapis.com/token" };
  if (!credentials.private_key || !credentials.client_email) fail("google_service_account_unavailable");
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly", "https://www.googleapis.com/auth/drive.metadata.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  const [driveResult, spreadsheetResult] = await Promise.all([
    google.drive({ version: "v3", auth }).files.get({ fileId: SPREADSHEET_ID, fields: "version,modifiedTime" }),
    sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))" }),
  ]);
  const revision = `drive-version:${driveResult.data.version};modified:${driveResult.data.modifiedTime}`;
  if (revision !== profile.source_revision) fail("ledger_preflight_source_profile_stale");
  const providerTabs = spreadsheetResult.data.sheets ?? [];
  const headerRanges = profile.tabs.flatMap((tab) => tab.header_candidates.map((candidate) => tabRange(tab.title, `A${candidate.row}:${columnName(tab.max_column)}${candidate.row}`)));
  const economic = mapping.record_selectors.filter((selector) => selector.record_kind === "economic");
  const selectorRanges = economic.map((selector) => tabRange(String(selector.tab_title_snapshot_or_null), String(selector.a1_range_or_null)));
  const [headerResult, formattedResult, rawResult] = await Promise.all([
    sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: headerRanges, valueRenderOption: "FORMATTED_VALUE" }),
    sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: selectorRanges, valueRenderOption: "FORMATTED_VALUE" }),
    sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges: selectorRanges, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" }),
  ]);
  let headerOffset = 0;
  for (const tab of profile.tabs) {
    const matches = providerTabs.filter((sheet) => String(sheet.properties?.sheetId) === tab.tab_id);
    if (matches.length !== 1 || matches[0].properties?.title !== tab.title || matches[0].properties?.gridProperties?.rowCount !== tab.max_row || matches[0].properties?.gridProperties?.columnCount !== tab.max_column) fail("ledger_preflight_tab_profile_drift");
    for (const candidate of tab.header_candidates) {
      const row = headerResult.data.valueRanges?.[headerOffset]?.values?.[0] ?? [];
      if (sha(row) !== candidate.values_sha256) fail("ledger_preflight_header_candidate_drift");
      headerOffset += 1;
    }
  }
  const selectorSummaries = economic.map((selector, index) => {
    const formattedRows = formattedResult.data.valueRanges?.[index]?.values ?? [];
    const rawRows = rawResult.data.valueRanges?.[index]?.values ?? [];
    const rangeFirstRow = rangeStartRow(String(selector.a1_range_or_null));
    const headerIndex = Number(selector.header_row_or_null) - rangeFirstRow;
    const headers = (formattedRows[headerIndex] ?? []).map(text);
    const headerPositions = Object.fromEntries([...REQUIRED_HEADERS, "구분", ...DESCRIPTION_HEADERS].map((header) => [header, headers.flatMap((value, column) => value === header ? [column] : [])]));
    const missingRequired = REQUIRED_HEADERS.filter((header) => headerPositions[header].length !== 1);
    const dataOffset = Number(selector.data_start_row_or_null) - rangeFirstRow;
    const rows = rawRows.slice(dataOffset).filter((row) => row.some((value) => text(value) !== ""));
    const dateIndex = headerPositions["거래일시"].length === 1 ? headerPositions["거래일시"][0] : -1;
    const amountIndex = headerPositions["거래금액"].length === 1 ? headerPositions["거래금액"][0] : -1;
    const directionIndex = headerPositions["구분"].length === 1 ? headerPositions["구분"][0] : -1;
    const descriptionIndices = DESCRIPTION_HEADERS.flatMap((header) => headerPositions[header]);
    const counts = { date_number: 0, date_string: 0, date_blank: 0, amount_numeric: 0, amount_invalid: 0, direction_income: 0, direction_expense: 0, direction_signed_positive: 0, direction_signed_negative: 0, direction_zero_or_ambiguous: 0, description_present: 0 };
    for (const row of rows) {
      const date = dateIndex >= 0 ? row[dateIndex] : null;
      if (date === null || date === undefined || text(date) === "") counts.date_blank += 1; else if (typeof date === "number") counts.date_number += 1; else counts.date_string += 1;
      const amount = amountIndex >= 0 ? numberValue(row[amountIndex]) : null;
      if (amount === null) counts.amount_invalid += 1; else counts.amount_numeric += 1;
      const label = directionIndex >= 0 ? text(row[directionIndex]) : "";
      if (label === "수입") counts.direction_income += 1; else if (label === "지출") counts.direction_expense += 1; else if (amount !== null && amount > 0) counts.direction_signed_positive += 1; else if (amount !== null && amount < 0) counts.direction_signed_negative += 1; else counts.direction_zero_or_ambiguous += 1;
      if (descriptionIndices.some((column) => text(row[column]) !== "")) counts.description_present += 1;
    }
    return { selector_code: selector.selector_code, tab_id: selector.tab_id_or_null, range_sha256: sha(String(selector.a1_range_or_null)), header_sha256: sha(headers), missing_required_headers: missingRequired, duplicate_schema_header_count: Object.values(headerPositions).filter((positions) => positions.length > 1).length, nonempty_row_count: rows.length, ...counts };
  });
  console.log(JSON.stringify({ schema_version: "ledger-final-preflight-result-v2", source_code: "LEDGER_FINAL_2022_2025", source_revision_sha256: createHash("sha256").update(revision).digest("hex"), profile_revision_match: true, tab_count: profile.tabs.length, selector_count: selectorSummaries.length, total_nonempty_rows: selectorSummaries.reduce((sum, row) => sum + row.nonempty_row_count, 0), selectors: selectorSummaries, original_write_count: 0, result: "profiled" }));
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "ledger-final-preflight-error-v2", error_code: error instanceof Error ? error.message : "unknown", original_write_count: 0, result: "rejected" })); process.exitCode = 1; });
