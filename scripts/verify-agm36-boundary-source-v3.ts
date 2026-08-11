import { readFileSync } from "node:fs";
import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import { canonicalJson, sha256, type CanonicalValue } from "../server/accounting/source-contracts";

type Json = Record<string, CanonicalValue>;
const APPROVAL_PATH = "docs/source-contracts/approvals/agm36-period-boundary-v3.json";
function fail(code: string): never { throw new Error(code); }
function arg(name: string): string { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`); return process.argv[index + 1]; }

async function main() {
  if (arg("--target") !== "development") fail("agm36_v3_boundary_verifier_scope_mismatch");
  const approval = JSON.parse(readFileSync(APPROVAL_PATH, "utf8")) as Json; const preimage = { ...approval }; delete preimage.receipt_sha256;
  if (approval.receipt_sha256 !== sha256(canonicalJson(preimage))) fail("agm36_v3_boundary_approval_invalid");
  const resolved = resolveDevelopmentTarget(process.env, "migration"); const pool = createTargetPool(resolved);
  try {
    const target = await verifyDevelopmentTarget(pool, resolved); const client = await pool.connect();
    try {
      await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await client.query<{ coordinate_key: string; content_digest: string; administration_no: string; position_code: string; source_appointment_date: string; effective_from: string }>(`SELECT c.coordinate_key,rv.content_digest,rv.normalized_payload->>'administration_no' administration_no,rv.normalized_payload->>'position_code' position_code,rv.normalized_payload->>'source_appointment_date' source_appointment_date,rv.normalized_payload->>'effective_from' effective_from FROM public.accounting_import_batches b JOIN public.accounting_source_releases r ON r.id=b.source_release_id JOIN public.accounting_logical_sources ls ON ls.id=r.logical_source_id JOIN public.accounting_import_batch_rows br ON br.batch_id=b.id JOIN public.accounting_import_coordinates c ON c.id=br.coordinate_id JOIN public.accounting_import_row_versions rv ON rv.id=br.row_version_id WHERE ls.source_code='NOTION_ORGANIZATION_ROLE_HISTORY' AND r.adapter_version='4.0.0' AND rv.normalized_payload->>'administration_no'='22' AND rv.normalized_payload->>'position_code'='president' AND rv.normalized_payload->>'source_appointment_date'='2026-02-28'`);
      const row = result.rows[0];
      if (result.rowCount !== 1 || row.coordinate_key !== approval.approved_boundary_coordinate_key || row.content_digest !== approval.approved_boundary_content_digest || row.administration_no !== "22" || row.position_code !== "president" || row.source_appointment_date !== "2026-02-28" || !row.effective_from.startsWith("2026-02-28")) fail("agm36_v3_boundary_source_mismatch");
      await client.query("ROLLBACK");
      console.log(JSON.stringify({ schema_version: "agm36-boundary-source-verification-v3", target: "development", target_fingerprint: target.targetFingerprint, boundary_coordinate_key: row.coordinate_key, boundary_content_digest: row.content_digest, candidate_count: result.rowCount, terminal_transaction: "ROLLBACK", result: "verified" }));
    } catch (error) { await client.query("ROLLBACK").catch(() => undefined); throw error; } finally { client.release(); }
  } finally { await shutdownPool(pool); }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "agm36-boundary-source-verification-error-v3", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
