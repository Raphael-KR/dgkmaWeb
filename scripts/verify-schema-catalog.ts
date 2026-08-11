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
    const writeFence = await pool.query<{ trigger_name: string; trigger_definition: string; function_name: string; is_row: boolean; is_before: boolean; on_insert: boolean; on_delete: boolean; on_update: boolean; on_truncate: boolean }>(`
      SELECT trigger_row.tgname AS trigger_name,
             pg_catalog.pg_get_triggerdef(trigger_row.oid, true) AS trigger_definition,
             function_namespace.nspname || '.' || function_row.proname || '()' AS function_name,
             (trigger_row.tgtype & 1) <> 0 AS is_row,
             (trigger_row.tgtype & 2) <> 0 AS is_before,
             (trigger_row.tgtype & 4) <> 0 AS on_insert,
             (trigger_row.tgtype & 8) <> 0 AS on_delete,
             (trigger_row.tgtype & 16) <> 0 AS on_update,
             (trigger_row.tgtype & 32) <> 0 AS on_truncate
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_proc AS function_row ON function_row.oid=trigger_row.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace ON function_namespace.oid=function_row.pronamespace
      WHERE trigger_row.tgrelid='public.payments'::regclass
        AND trigger_row.tgname='legacy_payments_write_fence_v1'
        AND NOT trigger_row.tgisinternal
    `);
    const reasonTransitions = await pool.query<{ table_name:string; trigger_name:string; function_name:string; is_row:boolean; is_before:boolean; on_insert:boolean; on_delete:boolean; on_update:boolean; on_truncate:boolean }>(`
      SELECT table_row.relname AS table_name, trigger_row.tgname AS trigger_name,
             function_namespace.nspname || '.' || function_row.proname || '()' AS function_name,
             (trigger_row.tgtype & 1) <> 0 AS is_row, (trigger_row.tgtype & 2) <> 0 AS is_before,
             (trigger_row.tgtype & 4) <> 0 AS on_insert, (trigger_row.tgtype & 8) <> 0 AS on_delete,
             (trigger_row.tgtype & 16) <> 0 AS on_update, (trigger_row.tgtype & 32) <> 0 AS on_truncate
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_class AS table_row ON table_row.oid=trigger_row.tgrelid
      JOIN pg_catalog.pg_namespace AS table_namespace ON table_namespace.oid=table_row.relnamespace
      JOIN pg_catalog.pg_proc AS function_row ON function_row.oid=trigger_row.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace ON function_namespace.oid=function_row.pronamespace
      WHERE table_namespace.nspname='public' AND function_namespace.nspname='public'
        AND function_row.proname='dgkma_validate_business_reason_transition_v1'
        AND NOT trigger_row.tgisinternal ORDER BY table_row.relname
    `);
    const exceptionRegistry = await pool.query<{ trigger_name:string; function_name:string; is_row:boolean; is_before:boolean; on_insert:boolean; on_delete:boolean; on_update:boolean; on_truncate:boolean; constraint_count:number; exception_count:number }>(`
      SELECT trigger_row.tgname AS trigger_name,
             function_namespace.nspname || '.' || function_row.proname || '()' AS function_name,
             (trigger_row.tgtype & 1) <> 0 AS is_row, (trigger_row.tgtype & 2) <> 0 AS is_before,
             (trigger_row.tgtype & 4) <> 0 AS on_insert, (trigger_row.tgtype & 8) <> 0 AS on_delete,
             (trigger_row.tgtype & 16) <> 0 AS on_update, (trigger_row.tgtype & 32) <> 0 AS on_truncate,
             (SELECT count(*)::int FROM pg_catalog.pg_constraint
               WHERE conrelid='public.schema_data_exceptions'::regclass
                 AND conname=ANY(ARRAY['schema_data_exceptions__rule_code_registry__check','schema_data_exceptions__rule_class_registry__check','schema_data_exceptions__status_resolution__check','schema_data_exceptions__resolution_duplicate__check','schema_data_exceptions__lifecycle_actor__check','schema_data_exceptions__capture_chain__check'])) AS constraint_count,
             (SELECT count(*)::int FROM public.schema_data_exceptions) AS exception_count
      FROM pg_catalog.pg_trigger AS trigger_row
      JOIN pg_catalog.pg_proc AS function_row ON function_row.oid=trigger_row.tgfoid
      JOIN pg_catalog.pg_namespace AS function_namespace ON function_namespace.oid=function_row.pronamespace
      WHERE trigger_row.tgrelid='public.schema_data_exceptions'::regclass
        AND trigger_row.tgname='schema_data_exceptions__registry_transition_v1'
        AND NOT trigger_row.tgisinternal
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
    const required = [1, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130];
    if (ledger.rows.length !== required.length || ledger.rows.some((row, index) => row.sequence_no !== required[index])) {
      throw new Error("catalog_ledger_sequence_mismatch");
    }
    if (
      writeFence.rowCount !== 1 ||
      writeFence.rows[0]?.trigger_name !== "legacy_payments_write_fence_v1" ||
      writeFence.rows[0]?.function_name !== "public.dgkma_guard_legacy_payments_write_v1()" ||
      !writeFence.rows[0]?.is_row || !writeFence.rows[0]?.is_before ||
      !writeFence.rows[0]?.on_insert || !writeFence.rows[0]?.on_delete || !writeFence.rows[0]?.on_update ||
      writeFence.rows[0]?.on_truncate
    ) {
      throw new Error("catalog_legacy_payments_write_fence_mismatch");
    }
    const expectedReasonTriggers={dues_receipt_reversals:"dues_receipt_reversals__business_reason_transition_v1",economic_event_authority_decisions:"economic_event_authority_decisions__business_reason__87a9478ac7",economic_event_canonicalizations:"economic_event_canonicalizations__business_reason_transition_v1",economic_event_collisions:"economic_event_collisions__business_reason_transition_v1",legacy_payment_decisions:"legacy_payment_decisions__business_reason_transition_v1",member_identity_link_history:"member_identity_link_history__business_reason_transition_v1",member_match_cases:"member_match_cases__business_reason_transition_v1",mutable_entity_action_history:"mutable_entity_action_history__business_reason_transition_v1"} as const;
    const expectedReasonTables=Object.keys(expectedReasonTriggers);
    if(reasonTransitions.rowCount!==8||JSON.stringify(reasonTransitions.rows.map((row)=>row.table_name))!==JSON.stringify(expectedReasonTables)||reasonTransitions.rows.some((row)=>row.trigger_name!==expectedReasonTriggers[row.table_name as keyof typeof expectedReasonTriggers]||row.function_name!=="public.dgkma_validate_business_reason_transition_v1()"||!row.is_row||!row.is_before||!row.on_insert||!row.on_update||row.on_delete||row.on_truncate)){
      throw new Error("catalog_business_reason_transition_mismatch");
    }
    const exceptionObject=exceptionRegistry.rows[0];
    if(exceptionRegistry.rowCount!==1||exceptionObject.trigger_name!=="schema_data_exceptions__registry_transition_v1"||exceptionObject.function_name!=="public.dgkma_validate_schema_exception_transition_v1()"||!exceptionObject.is_row||!exceptionObject.is_before||!exceptionObject.on_insert||!exceptionObject.on_update||!exceptionObject.on_delete||exceptionObject.on_truncate||exceptionObject.constraint_count!==6||exceptionObject.exception_count!==0){
      throw new Error("catalog_schema_exception_registry_mismatch");
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
    if (target === "disposable-test") {
      const expectedDisposableReleases = process.argv.includes("--legacy-v3")
        ? { total: 5, historical: 3 }
        : process.argv.includes("--legacy-baseline")
          ? { total: 4, historical: 2 }
          : { total: 2, historical: 0 };
      if (seeds.source_releases !== expectedDisposableReleases.total || seeds.historical_source_releases !== expectedDisposableReleases.historical) {
        throw new Error("catalog_disposable_release_scope_mismatch");
      }
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
      writeFenceTrigger: writeFence.rows[0].trigger_name,
      writeFenceFunction: writeFence.rows[0].function_name,
      reasonTransitionFunction: reasonTransitions.rows[0].function_name,
      reasonTransitionTables: expectedReasonTables,
      schemaExceptionFunction: exceptionObject.function_name,
      schemaExceptionConstraintCount: exceptionObject.constraint_count,
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
        write_fence_trigger: result.writeFenceTrigger,
        write_fence_function: result.writeFenceFunction,
        business_reason_transition_function: result.reasonTransitionFunction,
        business_reason_transition_tables: result.reasonTransitionTables,
        schema_exception_transition_function: result.schemaExceptionFunction,
        schema_exception_constraint_count: result.schemaExceptionConstraintCount,
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
      write_fence_trigger: result.writeFenceTrigger,
      write_fence_function: result.writeFenceFunction,
      schema_exception_transition_function: result.schemaExceptionFunction,
      schema_exception_constraint_count: result.schemaExceptionConstraintCount,
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
