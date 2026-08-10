import type { Pool } from "pg";
import {
  createOrResumeDisposableTarget,
  closeDisposableTarget,
  createTargetPool,
  resolveDevelopmentTarget,
  resolveDisposableControlTarget,
  shutdownPool,
  teardownDisposableTarget,
  verifyDevelopmentTarget,
} from "../server/db-target";
import { readManifest, sha256 } from "./schema-ledger";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`);
  return process.argv[index + 1];
}

async function verifyCatalog(pool: Pool, target: "development" | "disposable-test") {
  const manifest = readManifest(arg("--manifest"));
  await pool.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const tables = await pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' ORDER BY table_name,column_name
    `);
    const ledger = await pool.query<{ sequence_no: number; artifact_id: string; artifact_sha256: string }>(`
      SELECT sequence_no,artifact_id,artifact_sha256 FROM public.schema_change_ledger ORDER BY sequence_no
    `);
    const referenceSeeds = await pool.query<{
      logical_sources: number; source_releases: number; seed_source_releases: number; historical_source_releases: number; bank_accounts: number;
      bank_source_mappings: number; draft_policies: number; approved_policies: number;
      draft_position_mappings: number; approved_position_mappings: number;
      draft_category_roots: number; approved_category_tips: number; release_codes: string[];
    }>(`
      SELECT
        (SELECT count(*)::int FROM public.accounting_logical_sources) AS logical_sources,
        (SELECT count(*)::int FROM public.accounting_source_releases) AS source_releases,
        (SELECT count(*)::int FROM public.accounting_source_releases
          WHERE adapter_version='1.0.0'
            AND adapter_code IN ('membership-integrated-address-book-v1','notion-organization-role-history-v1')) AS seed_source_releases,
        (SELECT count(*)::int FROM public.accounting_source_releases release
          JOIN public.accounting_logical_sources source ON source.id=release.logical_source_id
          WHERE source.source_code NOT IN ('MEMBERSHIP_INTEGRATED_ADDRESS_BOOK','NOTION_ORGANIZATION_ROLE_HISTORY')) AS historical_source_releases,
        (SELECT count(*)::int FROM public.bank_accounts) AS bank_accounts,
        (SELECT count(*)::int FROM public.bank_source_account_mappings) AS bank_source_mappings,
        (SELECT count(*)::int FROM public.dues_policies WHERE status='draft' AND version=1) AS draft_policies,
        (SELECT count(*)::int FROM public.dues_policies WHERE status='approved') AS approved_policies,
        (SELECT count(*)::int FROM public.dues_position_tier_mappings WHERE status='draft' AND version=1) AS draft_position_mappings,
        (SELECT count(*)::int FROM public.dues_position_tier_mappings WHERE status='approved') AS approved_position_mappings,
        (SELECT count(*)::int FROM public.accounting_categories WHERE status='draft' AND version=1) AS draft_category_roots,
        (SELECT count(*)::int FROM public.accounting_categories c WHERE c.status='approved'
          AND NOT EXISTS (SELECT 1 FROM public.accounting_categories child WHERE child.supersedes_id=c.id)) AS approved_category_tips,
        (SELECT array_agg(adapter_code ORDER BY adapter_code) FROM public.accounting_source_releases
          WHERE adapter_version='1.0.0'
            AND adapter_code IN ('membership-integrated-address-book-v1','notion-organization-role-history-v1')) AS release_codes
    `);
    const transaction = await pool.query<{ read_only: string; isolation: string }>(`
      SELECT current_setting('transaction_read_only') AS read_only,
             current_setting('transaction_isolation') AS isolation
    `);
    await pool.query("ROLLBACK");
    const observed = new Set(tables.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const expectedTables = manifest.value.tables as Array<{ table: string; columns: Array<{ name: string }> }>;
    const missing = expectedTables
      .flatMap((table) => table.columns.map((column) => `${table.table}.${column.name}`))
      .filter((key) => !observed.has(key));
    if (missing.length) throw new Error(`catalog_manifest_column_missing:${missing[0]}`);
    const required = [1, 10, 15, 20, 30, 40, 50, 60, 70];
    if (ledger.rows.length !== required.length || ledger.rows.some((row, index) => row.sequence_no !== required[index])) {
      throw new Error("catalog_ledger_sequence_mismatch");
    }
    const seeds = referenceSeeds.rows[0];
    const expectedSeedCounts = {
      logical_sources: 10,
      seed_source_releases: 2,
      bank_accounts: 2,
      bank_source_mappings: 2,
      draft_policies: 16,
      approved_policies: 0,
      draft_position_mappings: 46,
      approved_position_mappings: 0,
      draft_category_roots: 6,
    } as const;
    for (const [key, expected] of Object.entries(expectedSeedCounts)) {
      const observed = seeds[key as keyof typeof expectedSeedCounts];
      if (observed !== expected) {
        throw new Error(`catalog_reference_seed_count_mismatch:${key}:${observed}:${expected}`);
      }
    }
    if (target === "disposable-test" && (seeds.source_releases !== 2 || seeds.historical_source_releases !== 0)) {
      throw new Error("catalog_disposable_release_scope_mismatch");
    }
    if (target === "development" && seeds.source_releases < 2) {
      throw new Error("catalog_development_release_scope_mismatch");
    }
    const expectedApprovedCategoryTips = target === "development" ? 6 : process.argv.includes("--categories-approved") ? 6 : 0;
    if (seeds.approved_category_tips !== expectedApprovedCategoryTips) throw new Error("catalog_category_tip_mismatch");
    const expectedReleaseCodes = ["membership-integrated-address-book-v1", "notion-organization-role-history-v1"];
    if (JSON.stringify(seeds.release_codes) !== JSON.stringify(expectedReleaseCodes)) {
      throw new Error("catalog_source_release_scope_mismatch");
    }
    if (transaction.rows[0]?.read_only !== "on" || transaction.rows[0]?.isolation !== "repeatable read") {
      throw new Error("catalog_transaction_mode_mismatch");
    }
    return {
      manifestSha256: manifest.sha256,
      required,
      observedColumns: tables.rows.length,
      catalogSha256: sha256(JSON.stringify(tables.rows)),
      approvedCategoryTips: expectedApprovedCategoryTips,
      releaseCodes: expectedReleaseCodes,
    };
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function main(): Promise<void> {
  const target = arg("--target");
  if (target === "development") {
    if (process.argv.includes("--teardown")) throw new Error("catalog_development_teardown_forbidden");
    const resolved = resolveDevelopmentTarget(process.env, "migration");
    const pool = createTargetPool(resolved);
    try {
      const development = await verifyDevelopmentTarget(pool, resolved);
      const result = await verifyCatalog(pool, "development");
      console.log(JSON.stringify({
        schema_version: "dgkma-schema-catalog-verification-v1",
        target: "development",
        target_fingerprint: development.targetFingerprint,
        manifest_sha256: result.manifestSha256,
        ledger_sequences: result.required,
        observed_columns: result.observedColumns,
        approved_category_tips: result.approvedCategoryTips,
        draft_policy_roots: 16,
        approved_policies: 0,
        draft_position_mapping_roots: 46,
        approved_position_mappings: 0,
        release_codes: result.releaseCodes,
        catalog_sha256: result.catalogSha256,
        transaction_isolation: "repeatable read",
        transaction_terminal: "ROLLBACK",
        schema_writes: 0,
        result: "approved",
      }));
    } finally {
      await shutdownPool(pool);
    }
    return;
  }
  if (target !== "disposable-test") throw new Error("catalog_target_not_supported");
  const runUid = arg("--run-uid");
  const controlResolved = resolveDisposableControlTarget(process.env, runUid);
  const controlPool = createTargetPool(controlResolved);
  let disposable: Awaited<ReturnType<typeof createOrResumeDisposableTarget>> | undefined;
  let tornDown = false;
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...controlResolved, kind: "development" });
    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const result = await verifyCatalog(disposable.pool, "disposable-test");
    if (process.argv.includes("--teardown")) {
      await teardownDisposableTarget(controlPool, disposable);
      tornDown = true;
    }
    console.log(JSON.stringify({
      schema_version: "dgkma-schema-catalog-verification-v1",
      target: "disposable-test",
      run_uid: runUid,
      target_fingerprint: disposable.targetFingerprint,
      manifest_sha256: result.manifestSha256,
      ledger_sequences: result.required,
      observed_columns: result.observedColumns,
      approved_category_tips: result.approvedCategoryTips,
      draft_policy_roots: 16,
      approved_policies: 0,
      draft_position_mapping_roots: 46,
      approved_position_mappings: 0,
      release_codes: result.releaseCodes,
      catalog_sha256: result.catalogSha256,
      transaction_isolation: "repeatable read",
      transaction_terminal: "ROLLBACK",
      schema_writes: 0,
      cleanup: tornDown ? { absent: true } : null,
      result: "approved",
    }));
  } finally {
    if (disposable) await closeDisposableTarget(controlPool, disposable);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({
    schema_version: "dgkma-schema-catalog-error-v1",
    error_code: error instanceof Error ? error.message : "unknown",
    result: "rejected",
  }));
  process.exitCode = 1;
});
