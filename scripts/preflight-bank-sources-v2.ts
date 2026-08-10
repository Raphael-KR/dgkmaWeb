import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { google } from "googleapis";

const SPREADSHEET_ID = "1d9C3cMd_0MomQtF5cfAk-9doVKRxsy8OKiO1MqvYqA0";
const SOURCES = [
  { code: "BANK_TOSS_2026", profile: "docs/source-contracts/profiles/bank-toss-2026.json", mapping: "docs/source-contracts/mappings/bank-toss-2026-v2.json", expectedRows: 200, required: ["거래 일시", "거래 금액", "거래 후 잔액"], allowed: ["거래 일시", "거래 금액", "거래 후 잔액", "적요", "거래 유형", "거래 기관", "메모"] },
  { code: "BANK_IBK_2026", profile: "docs/source-contracts/profiles/bank-ibk-2026.json", mapping: "docs/source-contracts/mappings/bank-ibk-2026-v2.json", expectedRows: 175, required: ["거래일시", "출금", "입금", "거래후 잔액"], allowed: ["거래일시", "출금", "입금", "거래후 잔액", "상대계좌예금주명", "거래내용", "상대은행", "메모"] },
] as const;
type Profile = { source_revision: string; tabs: Array<{ header_candidates: Array<{ row: number; values_sha256: string }>; max_column: number; max_row: number; tab_id: string; title: string }> };
type Mapping = { record_selectors: Array<{ a1_range_or_null: string; data_start_row_or_null: number; header_row_or_null: number; tab_id_or_null: string; tab_title_snapshot_or_null: string }> };
function fail(code: string): never { throw new Error(code); }
function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " "); }
function sha(value: unknown): string { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function columnName(column: number): string { let value = column; let result = ""; while (value > 0) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); } return result; }
function tabRange(title: string, range: string): string { return `'${title.replaceAll("'", "''")}'!${range}`; }
function money(value: unknown): number | null { const normalized = text(value).replaceAll(",", "").replaceAll("원", "").replace(/[^0-9.-]/g, ""); return /^-?\d+(?:\.0+)?$/.test(normalized) ? Number(normalized) : null; }

async function main() {
  const credentials = { type: "service_account", project_id: "dynamic-waters-446615-e5", private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"), client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, token_uri: "https://oauth2.googleapis.com/token" };
  if (!credentials.private_key || !credentials.client_email) fail("google_service_account_unavailable");
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly", "https://www.googleapis.com/auth/drive.metadata.readonly"] }); const sheets = google.sheets({ version: "v4", auth });
  const [driveResult, spreadsheetResult] = await Promise.all([google.drive({ version: "v3", auth }).files.get({ fileId: SPREADSHEET_ID, fields: "version,modifiedTime" }), sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID, fields: "sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))" })]);
  const revision = `drive-version:${driveResult.data.version};modified:${driveResult.data.modifiedTime}`; const summaries = [];
  for (const source of SOURCES) {
    const profile = JSON.parse(readFileSync(source.profile, "utf8")) as Profile; const mapping = JSON.parse(readFileSync(source.mapping, "utf8")) as Mapping; const tab = profile.tabs[0]; const selector = mapping.record_selectors[0];
    if (profile.source_revision !== revision) fail(`${source.code.toLowerCase()}_profile_revision_stale`);
    const provider = (spreadsheetResult.data.sheets ?? []).filter((sheet) => String(sheet.properties?.sheetId) === tab.tab_id);
    if (provider.length !== 1 || provider[0].properties?.title !== tab.title || provider[0].properties?.gridProperties?.rowCount !== tab.max_row || provider[0].properties?.gridProperties?.columnCount !== tab.max_column) fail(`${source.code.toLowerCase()}_tab_profile_drift`);
    const header = (await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: tabRange(tab.title, `A${selector.header_row_or_null}:${columnName(tab.max_column)}${selector.header_row_or_null}`), valueRenderOption: "FORMATTED_VALUE" })).data.values?.[0] ?? [];
    const positions = Object.fromEntries(source.allowed.map((name) => [name, header.flatMap((value, index) => text(value) === name ? [index + 1] : [])]));
    const missingRequired = source.required.filter((name) => positions[name].length !== 1); const duplicateAllowed = source.allowed.filter((name) => positions[name].length > 1);
    const a1End = selector.a1_range_or_null.match(/:(?:[A-Z]+)(\d+)$/)?.[1]; if (!a1End) fail("bank_preflight_selector_range_invalid");
    const selected = source.allowed.filter((name) => positions[name].length === 1); const ranges = selected.map((name) => tabRange(tab.title, `${columnName(positions[name][0])}${selector.data_start_row_or_null}:${columnName(positions[name][0])}${a1End}`));
    const columns = (await sheets.spreadsheets.values.batchGet({ spreadsheetId: SPREADSHEET_ID, ranges, valueRenderOption: "UNFORMATTED_VALUE", dateTimeRenderOption: "SERIAL_NUMBER" })).data.valueRanges ?? [];
    const values = Object.fromEntries(selected.map((name, index) => [name, (columns[index].values ?? []).map((row) => row[0] ?? null)])); const length = Math.max(0, ...Object.values(values).map((column) => column.length));
    const rows = Array.from({ length }, (_, index) => Object.fromEntries(selected.map((name) => [name, values[name][index] ?? null]))).filter((row) => Object.values(row).some((value) => text(value) !== ""));
    let dateNumbers = 0; let dateStrings = 0; let amountValid = 0; let balanceValid = 0; let exclusiveDirection = 0; let displayPresent = 0;
    for (const row of rows) {
      const date = row[source.code === "BANK_TOSS_2026" ? "거래 일시" : "거래일시"]; if (typeof date === "number") dateNumbers += 1; else if (text(date)) dateStrings += 1;
      if (source.code === "BANK_TOSS_2026") { const amount = money(row["거래 금액"]); if (amount !== null && amount !== 0) { amountValid += 1; exclusiveDirection += 1; } if (money(row["거래 후 잔액"]) !== null) balanceValid += 1; if (["적요", "거래 유형", "거래 기관", "메모"].some((name) => text(row[name]))) displayPresent += 1; }
      else { const debit = money(row["출금"]); const credit = money(row["입금"]); if ((debit !== null && debit !== 0) !== (credit !== null && credit !== 0)) { amountValid += 1; exclusiveDirection += 1; } if (money(row["거래후 잔액"]) !== null) balanceValid += 1; if (["상대계좌예금주명", "거래내용", "상대은행", "메모"].some((name) => text(row[name]))) displayPresent += 1; }
    }
    summaries.push({ source_code: source.code, source_revision_sha256: createHash("sha256").update(revision).digest("hex"), observed_header_sha256: sha(header), approved_header_sha256: tab.header_candidates[0].values_sha256, header_hash_match: sha(header) === tab.header_candidates[0].values_sha256, missing_required_headers: missingRequired, duplicate_allowed_headers: duplicateAllowed, allowed_columns_read: selected.length, excluded_columns_read: 0, nonempty_row_count: rows.length, expected_row_count: source.expectedRows, date_number_count: dateNumbers, date_string_count: dateStrings, valid_amount_count: amountValid, valid_balance_count: balanceValid, exclusive_direction_count: exclusiveDirection, display_present_count: displayPresent });
  }
  console.log(JSON.stringify({ schema_version: "bank-source-preflight-result-v2", spreadsheet_revision_sha256: createHash("sha256").update(revision).digest("hex"), sources: summaries, original_write_count: 0, result: "profiled" }));
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "bank-source-preflight-error-v2", error_code: error instanceof Error ? error.message : "unknown", original_write_count: 0, result: "rejected" })); process.exitCode = 1; });
