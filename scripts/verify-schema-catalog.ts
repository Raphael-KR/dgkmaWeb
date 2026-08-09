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
    await disposable.pool.query("ROLLBACK");
    const observed = new Set(tables.rows.map((row) => `${row.table_name}.${row.column_name}`));
    const expectedTables = manifest.value.tables as Array<{ table: string; columns: Array<{ name: string }> }>;
    const missing = expectedTables.flatMap((table) => table.columns.map((column) => `${table.table}.${column.name}`)).filter((key) => !observed.has(key));
    if (missing.length) throw new Error(`catalog_manifest_column_missing:${missing[0]}`);
    const required = [1,10,15,20,30,40,50,60];
    if (ledger.rows.length !== required.length || ledger.rows.some((row, index) => row.sequence_no !== required[index])) {
      throw new Error("catalog_ledger_sequence_mismatch");
    }
    const catalogDigest = sha256(JSON.stringify(tables.rows));
    if (process.argv.includes("--teardown")) {
      await teardownDisposableTarget(controlPool, disposable);
      tornDown = true;
    }
    console.log(JSON.stringify({ schema_version: "dgkma-schema-catalog-verification-v1", target: "disposable-test", run_uid: runUid,
      manifest_sha256: manifest.sha256, ledger_sequences: required, observed_columns: tables.rows.length,
      catalog_sha256: catalogDigest, transaction_terminal: "ROLLBACK", schema_writes: 0,
      cleanup: tornDown ? { absent: true } : null, result: "approved" }));
  } finally {
    if (disposable && !disposable.poolClosed) await shutdownPool(disposable.pool);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => { console.error(JSON.stringify({ schema_version: "dgkma-schema-catalog-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" })); process.exitCode = 1; });
