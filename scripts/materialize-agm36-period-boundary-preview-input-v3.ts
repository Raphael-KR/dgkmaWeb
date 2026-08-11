import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";
import { sourceFingerprint, validateSourcePreviewInput, type SourcePreviewInput } from "../server/accounting/source-preview-contract-v2";

const PAYLOAD_PATH = "docs/source-authority/22nd-officers.json";
const PROFILE_PATH = "docs/source-contracts/profiles/agm36-period-boundary.json";
const APPROVAL_PATH = "docs/source-contracts/approvals/agm36-period-boundary-v3.json";
const PLAN_PATH = "docs/source-contracts/releases/agm36-period-boundary-development-release-plan-v3.json";
const PAYLOAD_COMMIT = "9922cf3eccb65fa565380f9e7549628721602041";
const SOURCE_UID = "c620bd76-e7ee-5746-a523-5d1468039817";
type Json = Record<string, CanonicalValue>;

function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }
function deterministicUuidV4(seed: string): string { const bytes = createHash("sha256").update(seed).digest().subarray(0, 16); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80; const hex = bytes.toString("hex"); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`; }

export function materializeAgm36BoundaryV3(payloadBytes: Buffer): SourcePreviewInput {
  const committed = execFileSync("git", ["show", `${PAYLOAD_COMMIT}:${PAYLOAD_PATH}`]); if (!payloadBytes.equals(committed)) fail("agm36_v3_payload_commit_drift");
  const payload = JSON.parse(payloadBytes.toString("utf8")) as Json; const receiptPreimage = { ...payload }; delete receiptPreimage.receipt_sha256;
  if (payload.row_count !== 33 || payload.column_count !== 10 || !Array.isArray(payload.rows) || payload.rows.length !== 33 || payload.payload_sha256 !== sha256(canonicalJson(payload.rows)) || payload.receipt_sha256 !== sha256(canonicalJson(receiptPreimage))) fail("agm36_v3_payload_receipt_invalid");
  const rows = payload.rows as CanonicalValue[][]; const expectedHeaders = ["성명", "기수", "표시직위", "회비기준직책", "임기시작", "임기종료", "임명일", "임명근거", "상태", "비고"];
  if (canonicalJson(rows[0]) !== canonicalJson(expectedHeaders)) fail("agm36_v3_payload_header_invalid");
  if (rows.slice(1).filter((row) => row[2] === "회장" && row[4] === "2026-02-28" && String(row[7]).includes("제36차 총회")).length !== 1) fail("agm36_v3_president_boundary_evidence_ambiguous");
  const profile = JSON.parse(readFileSync(PROFILE_PATH, "utf8")) as Json;
  const baseRevision = `payload-sha256:${payload.payload_sha256};receipt-sha256:${payload.receipt_sha256};commit:${PAYLOAD_COMMIT}`; if (profile.source_revision !== baseRevision) fail("agm36_v3_source_profile_stale");
  const approval = JSON.parse(readFileSync(APPROVAL_PATH, "utf8")) as Json; const approvalPreimage = { ...approval }; delete approvalPreimage.receipt_sha256;
  if (approval.receipt_sha256 !== sha256(canonicalJson(approvalPreimage)) || approval.source_profile_sha256 !== profile.profile_sha256) fail("agm36_v3_approval_invalid");
  const boundaryCoordinate = String(approval.approved_boundary_coordinate_key); const boundaryDigest = String(approval.approved_boundary_content_digest);
  if (!boundaryCoordinate.startsWith("notion:page:") || !/^[0-9a-f]{64}$/.test(boundaryDigest)) fail("agm36_v3_boundary_reference_invalid");
  const plan = JSON.parse(readFileSync(PLAN_PATH, "utf8")) as Json; const planPreimage = { ...plan }; delete planPreimage.plan_sha256;
  if (plan.plan_sha256 !== sha256(canonicalJson(planPreimage)) || plan.source_code !== "AGM36_PERIOD_BOUNDARY") fail("agm36_v3_release_plan_invalid");
  const pair = [
    { period_code: "PRE_AGM36_2026", starts_at: "2026-01-01T00:00:00+09:00", ends_at: "2026-02-28T12:38:00+09:00" },
    { period_code: "AGM36_TO_AGM37", starts_at: "2026-02-28T12:38:00+09:00", ends_at: null },
  ];
  const previewRows: SourcePreviewInput["rows"] = pair.map((period) => {
    const normalized = { boundary_content_digest: boundaryDigest, boundary_coordinate_key: boundaryCoordinate, boundary_source_code: "NOTION_ORGANIZATION_ROLE_HISTORY", ends_at: period.ends_at, period_code: period.period_code, starts_at: period.starts_at };
    return { coordinate_key: `constant:agm36-period-boundary:${period.period_code}`, coordinate_normalization_version: "coordinate-v1", issue_status: "accepted", normalization_version: "agm-period-boundary-v3@3.0.0+notion-role-v4-boundary-v1", normalized_payload: normalized, raw_payload: normalized, source_display_snapshot: "AGM36 period boundary", decisions: [{ decision_kind: "period_materialization", decision_payload: { ...normalized, outcome: "approve" } }] };
  });
  const sourceRevision = `${baseRevision};boundary-source-code:NOTION_ORGANIZATION_ROLE_HISTORY;boundary-coordinate-sha256:${sha256(boundaryCoordinate)};boundary-content-digest:${boundaryDigest}`;
  const input: SourcePreviewInput = { schema_version: "accounting-source-preview-input-v2", source_code: "AGM36_PERIOD_BOUNDARY", source_uid: SOURCE_UID, release_uid: String(plan.release_uid), source_revision: sourceRevision, source_fingerprint: "0".repeat(64), operation_uid: randomUUID(), batch_uid: randomUUID(), decision_set_uid: randomUUID(), captured_timezone: "Asia/Seoul", coverage_from: "2026-01-01T00:00:00+09:00", coverage_through: String(profile.observed_at), rows: previewRows };
  input.source_fingerprint = sourceFingerprint(input); return validateSourcePreviewInput(input);
}

function main() { const output = arg("--output"); if (!(output.startsWith("/tmp/") || output.startsWith("/private/tmp/")) || existsSync(output)) fail("agm36_v3_output_invalid"); const input = materializeAgm36BoundaryV3(readFileSync(PAYLOAD_PATH)); writeFileSync(output, `${JSON.stringify(input)}\n`, { flag: "wx", mode: 0o600 }); chmodSync(output, 0o600); console.log(JSON.stringify({ schema_version: "agm36-period-boundary-preview-input-result-v3", source_code: input.source_code, source_fingerprint: input.source_fingerprint, row_count: input.rows.length, decision_item_count: input.rows.length, proposed_outcome: "approve", output_created: true, result: "materialized" })); }
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) { try { main(); } catch (error) { console.error(JSON.stringify({ schema_version: "agm36-period-boundary-preview-input-error-v3", error_code: error instanceof Error ? error.message : "unknown", output_created: false, result: "rejected" })); process.exitCode = 1; } }
