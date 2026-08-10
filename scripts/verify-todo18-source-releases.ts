import { createTargetPool, resolveDevelopmentTarget, shutdownPool, verifyDevelopmentTarget } from "../server/db-target";

const SOURCES = ["AGM36_PERIOD_BOUNDARY", "BANK_IBK_2026", "BANK_TOSS_2026", "GROUP_FOREIGN_FACULTY_2025", "LEDGER_DUES_POLICY_2024_2025", "LEDGER_FINAL_2022_2025", "LEGACY_PAYMENTS", "NOTION_DUES_REGULATION_DRAFT"];
async function main() {
  const resolved = resolveDevelopmentTarget(process.env, "migration"); const pool = createTargetPool(resolved);
  try {
    const target = await verifyDevelopmentTarget(pool, resolved);
    await pool.query("BEGIN TRANSACTION READ ONLY");
    try {
      const result = await pool.query<{ all_releases: number; historical_active: number; operation_receipts: number; operation_entities: number; audit_events: number; import_batches: number; decision_sets: number }>(`
        SELECT
          (SELECT count(*)::int FROM public.accounting_source_releases) AS all_releases,
          (SELECT count(*)::int FROM public.accounting_source_releases r JOIN public.accounting_logical_sources s ON s.id=r.logical_source_id WHERE s.source_code=ANY($1::text[]) AND r.status='active') AS historical_active,
          (SELECT count(*)::int FROM public.business_operation_receipts WHERE entity_type='source_release' AND canonical_payload->>'command'='source_release:create') AS operation_receipts,
          (SELECT count(*)::int FROM public.business_operation_entities WHERE entity_type='source_release' AND entity_action='create') AS operation_entities,
          (SELECT count(*)::int FROM public.accounting_audit_events WHERE entity_type='source_release' AND action='create' AND reason_code='TODO18_APPROVED_SOURCE_CONTRACT') AS audit_events,
          (SELECT count(*)::int FROM public.accounting_import_batches) AS import_batches,
          (SELECT count(*)::int FROM public.source_decision_sets) AS decision_sets
      `, [SOURCES]);
      const row = result.rows[0];
      if (row.all_releases !== 10 || row.historical_active !== 8 || row.operation_receipts !== 8 || row.operation_entities !== 8 || row.audit_events !== 8 || row.import_batches !== 0 || row.decision_sets !== 0) throw new Error("todo18_source_release_verification_mismatch");
      console.log(JSON.stringify({ schema_version: "dgkma-todo18-source-release-verification-v1", target_fingerprint: target.targetFingerprint, ...row, transaction_terminal: "ROLLBACK", result: "verified" }));
    } finally { await pool.query("ROLLBACK"); }
  } finally { await shutdownPool(pool); }
}
main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-todo18-source-release-verification-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
