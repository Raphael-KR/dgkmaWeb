import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Pool, PoolClient } from "pg";
import {
  closeDisposableTarget,
  createOrResumeDisposableTarget,
  createTargetPool,
  resolveDevelopmentTarget,
  sha256,
  shutdownPool,
  teardownDisposableTarget,
  verifyDevelopmentTarget,
  type DisposableTarget,
  type ResolvedDatabaseTarget,
} from "../server/db-target";
import {
  authorizeRestoreReconcile,
  canonicalJson,
  readRestoreReceipt,
  type RestoreValidationReceipt,
} from "./database-restore-contract";
import { readManifest } from "./schema-ledger";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const RESTORE_SIDECAR = "migrations/artifacts/0060_database_security.restore.json";
const RESTORE_WORK_PREFIX = "/tmp/dgkma-restore.";

function fail(code: string): never {
  throw new Error(code);
}

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) fail(`missing_argument:${name}`);
  return process.argv[index + 1];
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function iso(): string {
  return new Date().toISOString();
}

function exactPgEnv(resolved: ResolvedDatabaseTarget, database: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.DATABASE_URL;
  delete env.PROD_DATABASE_URL;
  delete env.PROD_DATABASE_READONLY_URL;
  env.PGHOST = resolved.host;
  env.PGPORT = String(resolved.port);
  env.PGUSER = resolved.user;
  env.PGPASSWORD = resolved.password;
  env.PGDATABASE = database;
  env.PGAPPNAME = "dgkma-task22-restore-drill";
  return env;
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): string {
  const result = spawnSync(command, args, { env, encoding: "utf8" });
  if ((result.status ?? 1) !== 0) fail(`task22_command_failed:${command}:${result.status}`);
  return String(result.stdout ?? "").trim();
}

async function schemaCatalog(client: PoolClient): Promise<Json> {
  const [relations, columns, constraints, indexes, triggers, routines, types] = await Promise.all([
    client.query(`SELECT n.nspname schema_name,c.relname,c.relkind,pg_get_expr(c.relpartbound,c.oid,true) partition_bound FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relkind,c.relname`),
    client.query(`SELECT c.relname table_name,a.attname,format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull,pg_get_expr(d.adbin,d.adrelid,true) default_sql,a.attidentity,a.attgenerated FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m') AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attname`),
    client.query(`SELECT c.relname table_name,con.conname,con.contype,pg_get_constraintdef(con.oid,true) definition,con.condeferrable,con.condeferred,con.convalidated FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' ORDER BY c.relname,con.conname`),
    client.query(`SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename,indexname`),
    client.query(`SELECT c.relname table_name,t.tgname,pg_get_triggerdef(t.oid,true) definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`),
    client.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) identity_arguments,pg_get_function_result(p.oid) result_type,p.prokind,pg_get_functiondef(p.oid) definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname,identity_arguments`),
    client.query(`SELECT t.typname,t.typtype,format_type(t.typbasetype,t.typtypmod) base_type,COALESCE((SELECT jsonb_agg(e.enumlabel ORDER BY e.enumsortorder) FROM pg_enum e WHERE e.enumtypid=t.oid),'[]'::jsonb) enum_values FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype IN ('d','e') ORDER BY t.typname`),
  ]);
  return { relations: relations.rows, columns: columns.rows, constraints: constraints.rows, indexes: indexes.rows, triggers: triggers.rows, routines: routines.rows, types: types.rows } as Json;
}

async function dataCatalog(client: PoolClient): Promise<Json> {
  const tables = await client.query<{ table_name: string }>(`SELECT c.relname table_name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`);
  const result: Json[] = [];
  for (const { table_name } of tables.rows) {
    const rows = await client.query<{ row_digest: string }>(`SELECT md5(to_jsonb(t)::text) row_digest FROM public.${quoteIdentifier(table_name)} t`);
    const digests = rows.rows.map((row) => row.row_digest).sort();
    result.push({ table_name, row_count: digests.length, content_sha256: sha256(digests.join("\n")) });
  }
  return result;
}

async function securityCatalog(client: PoolClient): Promise<Json> {
  const [database, schema, relations, routines, defaults, memberships] = await Promise.all([
    client.query(`SELECT pg_get_userbyid(datdba) owner_name,COALESCE(datacl::text,'') acl FROM pg_database WHERE datname=current_database()`),
    client.query(`SELECT nspname,pg_get_userbyid(nspowner) owner_name,COALESCE(nspacl::text,'') acl FROM pg_namespace WHERE nspname='public'`),
    client.query(`SELECT c.relname,c.relkind,pg_get_userbyid(c.relowner) owner_name,COALESCE(c.relacl::text,'') acl FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S') ORDER BY c.relkind,c.relname`),
    client.query(`SELECT p.proname,pg_get_function_identity_arguments(p.oid) identity_arguments,p.prokind,pg_get_userbyid(p.proowner) owner_name,COALESCE(p.proacl::text,'') acl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname,identity_arguments`),
    client.query(`SELECT COALESCE(r.rolname,'') owner_name,d.defaclobjtype,COALESCE(n.nspname,''),COALESCE(d.defaclacl::text,'') acl FROM pg_default_acl d LEFT JOIN pg_roles r ON r.oid=d.defaclrole LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace ORDER BY owner_name,d.defaclobjtype,n.nspname`),
    client.query(`SELECT pg_get_userbyid(roleid) role_name,pg_get_userbyid(member) member_name,admin_option FROM pg_auth_members ORDER BY role_name,member_name,admin_option`),
  ]);
  return { database: database.rows, schema: schema.rows, relations: relations.rows, routines: routines.rows, defaults: defaults.rows, memberships: memberships.rows } as Json;
}

function digest(value: Json): string {
  return sha256(canonicalJson(value));
}

function mismatchedSections(expected: Json, actual: Json): string[] {
  if (expected === null || actual === null || Array.isArray(expected) || Array.isArray(actual) || typeof expected !== "object" || typeof actual !== "object") return digest(expected) === digest(actual) ? [] : ["root"];
  return [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort().filter((key) => digest(expected[key] ?? null) !== digest(actual[key] ?? null));
}

function columnMismatchSummary(expected: Json, actual: Json): string[] {
  if (!Array.isArray(expected) || !Array.isArray(actual)) return ["shape"];
  const expectedRows = expected as Array<Record<string, Json>>;
  const actualRows = actual as Array<Record<string, Json>>;
  if (expectedRows.length !== actualRows.length) return [`count:${expectedRows.length}:${actualRows.length}`];
  const differences: string[] = [];
  for (let index = 0; index < expectedRows.length; index += 1) {
    const left = expectedRows[index];
    const right = actualRows[index];
    if (digest(left) === digest(right)) continue;
    const identity = `${String(left.table_name)}.${String(left.attname)}`;
    for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) if (digest(left[key] ?? null) !== digest(right[key] ?? null)) differences.push(`${identity}:${key}`);
  }
  return differences.slice(0, 20);
}

function readRestoreSidecar() {
  const bytes = readFileSync(RESTORE_SIDECAR, "utf8");
  const sidecar = JSON.parse(bytes) as Record<string, unknown>;
  if (`${canonicalJson(sidecar as Json)}\n` !== bytes) fail("task22_restore_sidecar_not_canonical");
  if (sidecar.schema_version !== "dgkma-restore-security-sidecar-v1" || sidecar.sequence_no !== 60 || sidecar.artifact_id !== "database-security-v1") fail("task22_restore_sidecar_identity_mismatch");
  for (const key of ["artifact_path", "restore_reconcile_path"] as const) if (typeof sidecar[key] !== "string") fail(`task22_restore_sidecar_${key}_invalid`);
  for (const key of ["artifact_sha256", "restore_reconcile_sha256"] as const) if (!/^[0-9a-f]{64}$/.test(String(sidecar[key]))) fail(`task22_restore_sidecar_${key}_invalid`);
  if (sha256(readFileSync(String(sidecar.artifact_path))) !== sidecar.artifact_sha256 || sha256(readFileSync(String(sidecar.restore_reconcile_path))) !== sidecar.restore_reconcile_sha256) fail("task22_restore_sidecar_digest_mismatch");
  return sidecar as { artifact_id: string; artifact_path: string; artifact_sha256: string; restore_reconcile_path: string; restore_reconcile_sha256: string };
}

function signedReceipt(value: Omit<RestoreValidationReceipt, "receipt_sha256">): RestoreValidationReceipt {
  return { ...value, receipt_sha256: sha256(canonicalJson(value as unknown as Json)) };
}

async function main(): Promise<void> {
  if (argument("--target") !== "disposable-test") fail("task22_restore_target_forbidden");
  const receiptPath = argument("--receipt");
  if (existsSync(receiptPath)) fail("task22_restore_receipt_exists");
  const runUid = randomUUID();
  const workDir = `${RESTORE_WORK_PREFIX}${runUid}`;
  const dumpPath = path.join(workDir, "development.dump");
  if (!workDir.startsWith(RESTORE_WORK_PREFIX) || path.dirname(dumpPath) !== workDir) fail("task22_restore_work_path_invalid");
  mkdirSync(workDir, { mode: 0o700 });

  const resolved = resolveDevelopmentTarget(process.env, "runtime");
  const controlPool = createTargetPool(resolved);
  let exporter: PoolClient | undefined;
  let disposable: DisposableTarget | undefined;
  let sourceSnapshotFinishedAt = "";
  try {
    const development = await verifyDevelopmentTarget(controlPool, resolved);
    const sidecar = readRestoreSidecar();
    exporter = await controlPool.connect();
    const sourceSnapshotStartedAt = iso();
    await exporter.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = await exporter.query<{ snapshot_id: string; txid_snapshot: string; wal_lsn: string; server_version_num: number }>(`SELECT pg_export_snapshot() snapshot_id,txid_current_snapshot() txid_snapshot,lower(pg_current_wal_lsn()::text) wal_lsn,current_setting('server_version_num')::int server_version_num`);
    const sourceSnapshotObservedAt = iso();
    const dumpStartedAt = iso();
    const dumpStartedMs = Date.now();
    const pgEnv = exactPgEnv(resolved, development.currentDatabase);
    run("pg_dump", ["--format=custom", "--no-owner", "--no-acl", `--snapshot=${snapshot.rows[0].snapshot_id}`, `--file=${dumpPath}`], pgEnv);
    const dumpFinishedAt = iso();
    const dumpDurationMs = Date.now() - dumpStartedMs;
    const [sourceSchema, sourceData, sourceSecurity] = await Promise.all([schemaCatalog(exporter), dataCatalog(exporter), securityCatalog(exporter)]);
    await exporter.query("ROLLBACK");
    exporter.release();
    exporter = undefined;
    sourceSnapshotFinishedAt = iso();

    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const disposableFingerprint = disposable.targetFingerprint;
    const disposableDatabase = disposable.databaseName;
    await closeDisposableTarget(controlPool, disposable);
    const restoreStartedAt = iso();
    const restoreStartedMs = Date.now();
    const restoreEnv = exactPgEnv(resolved, disposableDatabase);
    run("pg_restore", ["--exit-on-error", "--single-transaction", "--no-owner", "--no-acl", `--dbname=${disposableDatabase}`, dumpPath], restoreEnv);
    const restoreFinishedAt = iso();
    const restoreDurationMs = Date.now() - restoreStartedMs;

    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const targetClient = await disposable.pool.connect();
    let preSecurity: Json;
    try {
      preSecurity = await securityCatalog(targetClient);
    } finally {
      targetClient.release();
    }
    await closeDisposableTarget(controlPool, disposable);

    const observedAt = iso();
    const receipt = signedReceipt({
      schema_version: "dgkma-restore-validation-v1",
      source_target_fingerprint: development.targetFingerprint,
      disposable_target_fingerprint: disposableFingerprint,
      restore_run_uid: runUid,
      source_server_version_num: snapshot.rows[0].server_version_num,
      pg_dump_version: run("pg_dump", ["--version"], pgEnv),
      pg_restore_version: run("pg_restore", ["--version"], restoreEnv),
      source_snapshot_observed_at: sourceSnapshotObservedAt,
      source_snapshot_id_sha256: sha256(snapshot.rows[0].snapshot_id),
      source_txid_snapshot: snapshot.rows[0].txid_snapshot,
      source_snapshot_started_at: sourceSnapshotStartedAt,
      source_snapshot_finished_at: sourceSnapshotFinishedAt,
      source_current_wal_lsn: snapshot.rows[0].wal_lsn,
      dump_started_at: dumpStartedAt,
      dump_finished_at: dumpFinishedAt,
      dump_duration_ms: dumpDurationMs,
      restore_started_at: restoreStartedAt,
      restore_finished_at: restoreFinishedAt,
      restore_duration_ms: restoreDurationMs,
      dump_sha256: sha256(readFileSync(dumpPath)),
      source_manifest_sha256: readManifest().sha256,
      sequence_60_artifact_id: sidecar.artifact_id,
      sequence_60_artifact_sha256: sidecar.artifact_sha256,
      restore_reconcile_sha256: sidecar.restore_reconcile_sha256,
      pre_security_catalog_sha256: digest(preSecurity),
      post_security_catalog_sha256: digest(sourceSecurity),
      schema_catalog_sha256: digest(sourceSchema),
      data_catalog_sha256: digest(sourceData),
      observed_at: observedAt,
      result: "verified",
    });
    mkdirSync(path.dirname(receiptPath), { recursive: true });
    writeFileSync(receiptPath, `${canonicalJson(receipt as unknown as Json)}\n`, { flag: "wx" });
    readRestoreReceipt(receiptPath);
    authorizeRestoreReconcile({ targetKind: "disposable-test", descriptorPath: RESTORE_SIDECAR, receiptPath });
    run("psql", ["-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", `--dbname=${disposableDatabase}`, `--file=${sidecar.restore_reconcile_path}`], restoreEnv);

    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const verifyClient = await disposable.pool.connect();
    try {
      const [targetSchema, targetData, targetSecurity] = await Promise.all([schemaCatalog(verifyClient), dataCatalog(verifyClient), securityCatalog(verifyClient)]);
      if (digest(targetSchema) !== receipt.schema_catalog_sha256) {
        const sections = mismatchedSections(sourceSchema, targetSchema);
        const columns = sourceSchema !== null && targetSchema !== null && !Array.isArray(sourceSchema) && !Array.isArray(targetSchema) && typeof sourceSchema === "object" && typeof targetSchema === "object" && sections.includes("columns")
          ? columnMismatchSummary(sourceSchema.columns, targetSchema.columns)
          : [];
        fail(`task22_restore_schema_digest_mismatch:${sections.join(",")}:${columns.join(",")}`);
      }
      if (digest(targetData) !== receipt.data_catalog_sha256) fail("task22_restore_data_digest_mismatch");
      if (digest(targetSecurity) !== receipt.post_security_catalog_sha256) fail(`task22_restore_security_digest_mismatch:${mismatchedSections(sourceSecurity, targetSecurity).join(",")}`);
      const ledger = await verifyClient.query<{ count: number }>("SELECT count(*)::int count FROM public.schema_change_ledger");
      if ((ledger.rows[0]?.count ?? 0) === 0) fail("task22_restore_ledger_missing");
    } finally {
      verifyClient.release();
    }
    await teardownDisposableTarget(controlPool, disposable);
    disposable = undefined;
    const shredded = spawnSync("shred", ["--remove=unlink", "--zero", dumpPath], { encoding: "utf8" });
    if ((shredded.status ?? 1) !== 0 || existsSync(dumpPath)) fail("task22_restore_dump_cleanup_failed");
    rmdirSync(workDir);
    if (existsSync(workDir)) fail("task22_restore_workdir_cleanup_failed");
    console.log(canonicalJson({ schema_version: "dgkma-task22-restore-drill-v1", restore_run_uid: runUid, source_target_fingerprint: development.targetFingerprint, disposable_target_fingerprint: disposableFingerprint, receipt_sha256: receipt.receipt_sha256, schema_catalog_sha256: receipt.schema_catalog_sha256, data_catalog_sha256: receipt.data_catalog_sha256, post_security_catalog_sha256: receipt.post_security_catalog_sha256, dump_duration_ms: dumpDurationMs, restore_duration_ms: restoreDurationMs, disposable_absent: true, dump_absent: true, raw_snapshot_id_exposed: false, production_operations: 0, result: "approved" } as Json));
  } catch (error) {
    if (exporter) {
      await exporter.query("ROLLBACK").catch(() => undefined);
      exporter.release();
    }
    if (disposable) await teardownDisposableTarget(controlPool, disposable).catch(() => undefined);
    if (existsSync(dumpPath)) {
      spawnSync("shred", ["--remove=unlink", "--zero", dumpPath], { encoding: "utf8" });
      if (existsSync(dumpPath)) unlinkSync(dumpPath);
    }
    if (existsSync(workDir)) rmdirSync(workDir);
    throw error;
  } finally {
    await shutdownPool(controlPool);
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ schema_version: "dgkma-task22-restore-drill-error-v1", error_code: error instanceof Error ? error.message : "unknown", result: "rejected" }));
  process.exitCode = 1;
});
