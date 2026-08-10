import { chmodSync, readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { google } from "googleapis";
import { sourceFingerprint, validateSourcePreviewInput, type SourcePreviewInput } from "../server/accounting/source-preview-contract-v2";

const SPREADSHEET_ID = "1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k";
const RANGE = "회비수입!O2:O14";
const PROFILE = "docs/source-contracts/profiles/ledger-dues-policy-2024-2025.json";
const SOURCE_UID = "256fcd87-840f-537d-8204-6a5f7ee3947e";
const RELEASE_UID = "c1b59d6a-7f9a-462f-97fb-10dc3dc27f6e";
const TIERS: Record<string, string> = {
  "회장": "president", "수석부회장": "senior_vice_president", "부회장,감사": "vice_president_auditor_chair",
  "부회장·감사": "vice_president_auditor_chair", "부회장·감사·총회의장": "vice_president_auditor_chair", "이사": "director",
  "정회원": "member", "회원": "member", "명예회원": "honorary",
};

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
function text(value: unknown): string { return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " "); }
function money(token: string): string {
  const normalized = token.replaceAll(",", "").replaceAll(" ", ""); const match = normalized.match(/^(\d+(?:\.\d+)?)(만)?원?$/);
  if (!match) fail("dues_policy_money_invalid"); const amount = Number(match[1]) * (match[2] ? 10_000 : 1);
  if (!Number.isSafeInteger(amount) || amount < 0) fail("dues_policy_money_invalid"); return String(amount);
}
function parsePolicy(value: string, year: number, rowNumber: number) {
  const tierLabel = Object.keys(TIERS).sort((left, right) => right.length - left.length).find((label) => value.includes(label));
  const monthly = value.match(/월(?:납)?\s*[:：]?\s*([0-9,.]+\s*만?\s*원?)/); const annual = value.match(/연납\s*[:：]?\s*([0-9,.]+\s*만?\s*원?)/);
  if (!tierLabel || !monthly || !annual) fail(`dues_policy_cell_unrecognized:row_${rowNumber}`);
  return { annual_minimum: money(annual[1]), due_day: 10, dues_year: year, monthly_minimum: money(monthly[1]), reminder_day: 11, tier_code: TIERS[tierLabel] };
}

async function main() {
  const output = arg("--output"); if (!(output.startsWith("/tmp/") || output.startsWith("/private/tmp/"))) fail("dues_policy_output_must_be_ephemeral");
  const profile = JSON.parse(readFileSync(PROFILE, "utf8")) as { source_revision: string };
  const credentials = { type: "service_account", project_id: "dynamic-waters-446615-e5", private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"), client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, token_uri: "https://oauth2.googleapis.com/token" };
  if (!credentials.private_key || !credentials.client_email) fail("google_service_account_unavailable");
  const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly", "https://www.googleapis.com/auth/drive.metadata.readonly"] });
  const [valuesResult, metadataResult] = await Promise.all([
    google.sheets({ version: "v4", auth }).spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: RANGE }),
    google.drive({ version: "v3", auth }).files.get({ fileId: SPREADSHEET_ID, fields: "version,modifiedTime" }),
  ]);
  const revision = `drive-version:${metadataResult.data.version};modified:${metadataResult.data.modifiedTime}`;
  if (revision !== profile.source_revision) fail("dues_policy_source_profile_stale");
  const cells = valuesResult.data.values ?? []; let currentYear: number | null = null; const rows: SourcePreviewInput["rows"] = [];
  for (let offset = 0; offset < 13; offset += 1) {
    const rowNumber = offset + 2; const value = text(cells[offset]?.[0]); if (!value) continue;
    const heading = value.match(/#?\s*(20\d{2})년\s*회비/); if (heading) { currentYear = Number(heading[1]); continue; }
    if (currentYear === null) fail(`dues_policy_heading_missing:row_${rowNumber}`);
    const payload = parsePolicy(value, currentYear, rowNumber);
    rows.push({ coordinate_key: `sheet:${SPREADSHEET_ID}:379091912:row:${rowNumber}`, coordinate_normalization_version: "coordinate-v1", issue_status: "accepted", normalization_version: "dues-policy-sheet-v2@2.0.0+admin-readable-v1", normalized_payload: payload, raw_payload: payload, source_display_snapshot: "회비수입", decisions: [] });
  }
  if (rows.length !== 10 || rows.filter((row) => row.normalized_payload.dues_year === 2024).length !== 5 || rows.filter((row) => row.normalized_payload.dues_year === 2025).length !== 5) fail("dues_policy_row_coverage_mismatch");
  const input: SourcePreviewInput = { schema_version: "accounting-source-preview-input-v2", source_code: "LEDGER_DUES_POLICY_2024_2025", source_uid: SOURCE_UID, release_uid: RELEASE_UID, source_revision: revision, source_fingerprint: "0".repeat(64), operation_uid: randomUUID(), batch_uid: randomUUID(), decision_set_uid: randomUUID(), captured_timezone: "Asia/Seoul", coverage_from: "2024-01-01T00:00:00+09:00", coverage_through: "2026-01-01T00:00:00+09:00", rows };
  input.source_fingerprint = sourceFingerprint(input); validateSourcePreviewInput(input); writeFileSync(output, `${JSON.stringify(input)}\n`, { mode: 0o600 }); chmodSync(output, 0o600);
  console.log(JSON.stringify({ schema_version: "dues-policy-preview-input-result-v2", source_code: input.source_code, source_fingerprint: input.source_fingerprint, row_count: rows.length, decision_item_count: 0, source_revision_sha256: (await import("node:crypto")).createHash("sha256").update(revision).digest("hex"), result: "materialized" }));
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "dues-policy-preview-input-error-v2", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
