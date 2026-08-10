import { readFileSync } from "node:fs";
import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";
import type { CanonicalValue } from "../server/accounting/source-contracts";

type Json = Record<string, CanonicalValue>;
const plan = JSON.parse(readFileSync("docs/source-contracts/releases/admin-readable-development-source-release-plan-v2.json", "utf8")) as Json;
const operations = plan.operations as Json[];
async function main() {
  const resolved = resolveDevelopmentTarget(process.env, "migration"); const pool = createTargetPool(resolved);
  try {
    const target = await verifyDevelopmentTarget(pool, resolved);
    await pool.query("BEGIN TRANSACTION READ ONLY");
    try {
      const result = await pool.query<{ all_releases: number; v1_active: number; v2_active: number; v2_operation_receipts: number; v2_operation_entities: number; v2_audit_events: number; import_batches: number; decision_sets: number }>(`
        SELECT
          (SELECT count(*)::int FROM public.accounting_source_releases) AS all_releases,
          (SELECT count(*)::int FROM public.accounting_source_releases WHERE adapter_version='1.0.0' AND status='active') AS v1_active,
          (SELECT count(*)::int FROM public.accounting_source_releases WHERE adapter_version='2.0.0' AND status='active') AS v2_active,
          (SELECT count(*)::int FROM public.business_operation_receipts WHERE operation_uid=ANY($1::uuid[])) AS v2_operation_receipts,
          (SELECT count(*)::int FROM public.business_operation_entities WHERE operation_uid=ANY($1::uuid[]) AND entity_type='source_release' AND entity_action='create') AS v2_operation_entities,
          (SELECT count(*)::int FROM public.accounting_audit_events WHERE correlation_uid=ANY($2::uuid[]) AND entity_type='source_release' AND action='create' AND reason_code='TODO18_ADMIN_READABLE_SOURCE_CONTRACT') AS v2_audit_events,
          (SELECT count(*)::int FROM public.accounting_import_batches) AS import_batches,
          (SELECT count(*)::int FROM public.source_decision_sets) AS decision_sets
      `, [operations.map((entry) => entry.operation_uid), operations.map((entry) => entry.action_correlation_uid)]);
      const row = result.rows[0];
      if (row.all_releases !== 20 || row.v1_active !== 10 || row.v2_active !== 10 || row.v2_operation_receipts !== 10 || row.v2_operation_entities !== 10 || row.v2_audit_events !== 10 || row.import_batches !== 0 || row.decision_sets !== 0) throw new Error("admin_readable_source_release_verification_mismatch");
      console.log(JSON.stringify({ schema_version: "dgkma-admin-readable-source-release-verification-v2", target_fingerprint: target.targetFingerprint, ...row, transaction_terminal: "ROLLBACK", result: "verified" }));
    } finally { await pool.query("ROLLBACK"); }
  } finally { await shutdownPool(pool); }
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-admin-readable-source-release-verification-error-v2", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
