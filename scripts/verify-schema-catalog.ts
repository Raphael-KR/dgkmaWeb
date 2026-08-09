import {
  createOrResumeDisposableTarget, createTargetPool, resolveDisposableControlTarget,
  shutdownPool, teardownDisposableTarget, verifyDevelopmentTarget,
} from "../server/db-target";
import { readManifest, sha256 } from "./schema-ledger";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`);
  return process.argv[index + 1];
}

async function main() {
  if (arg("--target") !== "disposable-test") throw new Error("catalog_target_not_supported");
  const runUid = arg("--run-uid");
  const controlResolved = resolveDisposableControlTarget(process.env, runUid);
  const controlPool = createTargetPool(controlResolved);
  let disposable: Awaited<ReturnType<typeof createOrResumeDisposableTarget>> | undefined;
  let tornDown = false;
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...controlResolved, kind: "development" });
    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const manifest = readManifest(arg("--manifest"));
    await disposable.pool.query("BEGIN TRANSACTION READ ONLY");
    const tables = await disposable.pool.query<{ table_name: string; column_name: string }>(`
      SELECT table_name,column_name FROM information_schema.columns
      WHERE table_schema='public' ORDER BY table_name,column_name
    `);
    const ledger = await disposable.pool.query<{ sequence_no: number; artifact_id: string; artifact_sha256: string }>(`
      SELECT sequence_no,artifact_id,artifact_sha256 FROM public.schema_change_ledger ORDER BY sequence_no
    `);
    const referenceSeeds = await disposable.pool.query<{
      logical_sources: number; source_releases: number; historical_source_releases: number; bank_accounts: number;
      bank_source_mappings: number; draft_policies: number; draft_position_mappings: number; draft_categories: number;
      release_codes: string[];
    }>(`
      SELECT
        (SELECT count(*)::int FROM public.accounting_logical_sources) AS logical_sources,
        (SELECT count(*)::int FROM public.accounting_source_releases) AS source_releases,
        (SELECT count(*)::int FROM public.accounting_source_releases release
          JOIN public.accounting_logical_sources source ON source.id=release.logical_source_id
          WHERE source.source_code NOT IN ('MEMBERSHIP_INTEGRATED_ADDRESS_BOOK','NOTION_ORGANIZATION_ROLE_HISTORY')) AS historical_source_releases,
        (SELECT count(*)::int FROM public.bank_accounts) AS bank_accounts,
        (SELECT count(*)::int FROM public.bank_source_account_mappings) AS bank_source_mappings,
        (SELECT count(*)::int FROM public.dues_policies WHERE status='draft' AND version=1) AS draft_policies,
        (SELECT count(*)::int FROM public.dues_position_tier_mappings WHERE status='draft' AND version=1) AS draft_position_mappings,
        (SELECT count(*)::int FROM public.accounting_categories WHERE status='draft' AND version=1) AS draft_categories,
        (SELECT array_agg(adapter_code ORDER BY adapter_code) FROM public.accounting_source_releases) AS release_codes
    `);
    await disposable.pool.query("ROLLBACK");
    const observed = new Set(tables.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const expectedTables = manifest.value.tables as Array<{ table: string; columns: Array<{ name: string }> }>;
    const missing = expectedTables.flatMap((table) => table.columns.map((column) => `${table.table}.${column.name}`)).filter((key) => !observed.has(key));
    if (missing.length) throw new Error(`catalog_manifest_column_missing:${missing[0]}`);
    const required = [1,10,15,20,30,40,50,60];
    if (ledger.rows.length !== required.length || ledger.rows.some((row, index) => row.sequence_no !== required[index])) {
      throw new Error("catalog_ledger_sequence_mismatch");
    }
    const seeds = referenceSeeds.rows[0];
    const expectedSeedCounts = [10,2,0,2,2,16,46,6];
    const observedSeedCounts = [seeds.logical_sources,seeds.source_releases,seeds.historical_source_releases,seeds.bank_accounts,
      seeds.bank_source_mappings,seeds.draft_policies,seeds.draft_position_mappings,seeds.draft_categories];
    if (observedSeedCounts.some((count, index) => count !== expectedSeedCounts[index])) throw new Error("catalog_reference_seed_count_mismatch");
    const expectedReleaseCodes = ["membership-integrated-address-book-v1","notion-organization-role-history-v1"];
    if (JSON.stringify(seeds.release_codes) !== JSON.stringify(expectedReleaseCodes)) throw new Error("catalog_source_release_scope_mismatch");
    const catalogDigest = sha256(JSON.stringify(tables.rows));
    if (process.argv.includes("--teardown")) {
      await teardownDisposableTarget(controlPool, disposable);
      tornDown = true;
    }
    console.log(JSON.stringify({ schema_version: "dgkma-schema-catalog-verification-v1", target: "disposable-test", run_uid: runUid,
      manifest_sha256: manifest.sha256, ledger_sequences: required, observed_columns: tables.rows.length,
      reference_seed_counts: { logical_sources:10, source_releases:2, historical_source_releases:0, bank_accounts:2,
        bank_source_mappings:2, draft_policies:16, draft_position_mappings:46, draft_categories:6 },
      release_codes: expectedReleaseCodes,
      catalog_sha256: catalogDigest, transaction_terminal: "ROLLBACK", schema_writes: 0,
      cleanup: tornDown ? { absent: true } : null, result: "approved" }));
  } finally {
    if (disposable && !disposable.poolClosed) await shutdownPool(disposable.pool);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-schema-catalog-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
