import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export type RestoreTargetKind = "development" | "disposable-test";

export interface SyntheticSequence60Descriptor {
  schema_version: "dgkma-synthetic-sequence-60-v1";
  sequence_no: 60;
  artifact_id: "database-security-v1";
  artifact_path: string;
  artifact_sha256: string;
  restore_reconcile_path: string;
  restore_reconcile_sha256: string;
  materialization_state: "materialized";
}

export interface RestoreValidationReceipt {
  schema_version: "dgkma-restore-validation-v1";
  source_target_fingerprint: string;
  disposable_target_fingerprint: string;
  restore_run_uid: string;
  source_server_version_num: number;
  pg_dump_version: string;
  pg_restore_version: string;
  source_snapshot_observed_at: string;
  source_snapshot_id_sha256: string;
  source_txid_snapshot: string;
  source_snapshot_started_at: string;
  source_snapshot_finished_at: string;
  source_current_wal_lsn: string;
  dump_started_at: string;
  dump_finished_at: string;
  dump_duration_ms: number;
  restore_started_at: string;
  restore_finished_at: string;
  restore_duration_ms: number;
  dump_sha256: string;
  source_manifest_sha256: string;
  sequence_60_artifact_id: string;
  sequence_60_artifact_sha256: string;
  restore_reconcile_sha256: string;
  pre_security_catalog_sha256: string;
  post_security_catalog_sha256: string;
  schema_catalog_sha256: string;
  data_catalog_sha256: string;
  observed_at: string;
  result: "verified" | "rejected";
  receipt_sha256: string;
}

const SHA = /^[0-9a-f]{64}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const WAL_LSN = /^[0-9a-f]+\/[0-9a-f]+$/;
const RECEIPT_KEYS = [
  "data_catalog_sha256","disposable_target_fingerprint","dump_duration_ms","dump_finished_at","dump_sha256","dump_started_at",
  "observed_at","pg_dump_version","pg_restore_version","post_security_catalog_sha256","pre_security_catalog_sha256","receipt_sha256",
  "restore_duration_ms","restore_finished_at","restore_reconcile_sha256","restore_run_uid","restore_started_at","result",
  "schema_catalog_sha256","schema_version","sequence_60_artifact_id","sequence_60_artifact_sha256","source_current_wal_lsn",
  "source_manifest_sha256","source_server_version_num","source_snapshot_finished_at","source_snapshot_id_sha256",
  "source_snapshot_observed_at","source_snapshot_started_at","source_target_fingerprint","source_txid_snapshot",
].sort();
const DESCRIPTOR_KEYS = [
  "artifact_id","artifact_path","artifact_sha256","materialization_state","restore_reconcile_path","restore_reconcile_sha256",
  "schema_version","sequence_no",
].sort();
const RESTORE_SIDECAR_KEYS = [
  "artifact_id","artifact_path","artifact_sha256","restore_reconcile_path","restore_reconcile_sha256","schema_version","sequence_no",
].sort();

export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

export function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fail(code: string): never {
  throw new Error(code);
}

function exactKeys(value: Record<string, unknown>, expected: string[], code: string): void {
  const keys = Object.keys(value).sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) fail(code);
}

function readCanonicalJson(filePath: string, code: string): Record<string, unknown> {
  const bytes = readFileSync(filePath, "utf8");
  const value = JSON.parse(bytes) as Record<string, unknown>;
  if (`${canonicalJson(value as Json)}\n` !== bytes) fail(`${code}_not_canonical_json_lf`);
  return value;
}

function instant(value: unknown, code: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) fail(code);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) fail(code);
  return parsed;
}

export function readRestoreReceipt(filePath: string): RestoreValidationReceipt {
  const value = readCanonicalJson(filePath, "restore_receipt");
  exactKeys(value, RECEIPT_KEYS, "restore_receipt_key_mismatch");
  if (value.schema_version !== "dgkma-restore-validation-v1") fail("restore_receipt_schema_version_mismatch");
  const receipt = value as unknown as RestoreValidationReceipt;
  for (const key of RECEIPT_KEYS.filter((key) => key.endsWith("_sha256") || key.endsWith("_fingerprint"))) {
    if (!SHA.test(String((receipt as unknown as Record<string, unknown>)[key]))) fail(`restore_receipt_sha_invalid:${key}`);
  }
  if (!UUID_V4.test(receipt.restore_run_uid)) fail("restore_receipt_run_uid_invalid");
  if (!Number.isInteger(receipt.source_server_version_num) || receipt.source_server_version_num < 150000) fail("restore_receipt_server_version_invalid");
  if (!Number.isInteger(receipt.dump_duration_ms) || receipt.dump_duration_ms < 0 || !Number.isInteger(receipt.restore_duration_ms) || receipt.restore_duration_ms < 0) fail("restore_receipt_duration_invalid");
  if (!/^pg_dump \(PostgreSQL\) \d+(?:\.\d+)+$/.test(receipt.pg_dump_version) || !/^pg_restore \(PostgreSQL\) \d+(?:\.\d+)+$/.test(receipt.pg_restore_version)) fail("restore_receipt_tool_version_invalid");
  if (!WAL_LSN.test(receipt.source_current_wal_lsn)) fail("restore_receipt_wal_lsn_invalid");
  if (receipt.source_target_fingerprint === receipt.disposable_target_fingerprint) fail("restore_receipt_target_identity_collision");
  if (receipt.sequence_60_artifact_id !== "database-security-v1") fail("restore_receipt_sequence_60_id_mismatch");
  if (receipt.result !== "verified" && receipt.result !== "rejected") fail("restore_receipt_result_invalid");
  const snapshotStart = instant(receipt.source_snapshot_started_at, "restore_receipt_snapshot_start_invalid");
  const snapshotObserved = instant(receipt.source_snapshot_observed_at, "restore_receipt_snapshot_observed_invalid");
  const dumpStart = instant(receipt.dump_started_at, "restore_receipt_dump_start_invalid");
  const dumpFinish = instant(receipt.dump_finished_at, "restore_receipt_dump_finish_invalid");
  const snapshotFinish = instant(receipt.source_snapshot_finished_at, "restore_receipt_snapshot_finish_invalid");
  const restoreStart = instant(receipt.restore_started_at, "restore_receipt_restore_start_invalid");
  const restoreFinish = instant(receipt.restore_finished_at, "restore_receipt_restore_finish_invalid");
  const observed = instant(receipt.observed_at, "restore_receipt_observed_invalid");
  if (!(snapshotStart <= snapshotObserved && snapshotObserved <= dumpStart && dumpStart <= dumpFinish && dumpFinish <= snapshotFinish && snapshotFinish <= restoreStart && restoreStart <= restoreFinish && restoreFinish <= observed)) fail("restore_receipt_timeline_invalid");
  const unsigned = { ...value };
  delete unsigned.receipt_sha256;
  if (sha256(canonicalJson(unsigned as Json)) !== receipt.receipt_sha256) fail("restore_receipt_self_hash_mismatch");
  return receipt;
}

export function readSyntheticSequence60Descriptor(filePath: string): SyntheticSequence60Descriptor {
  const value = readCanonicalJson(filePath, "sequence_60_descriptor");
  const isRuntimeSidecar = value.schema_version === "dgkma-restore-security-sidecar-v1";
  exactKeys(value, isRuntimeSidecar ? RESTORE_SIDECAR_KEYS : DESCRIPTOR_KEYS, "sequence_60_descriptor_key_mismatch");
  const descriptor = {
    ...value,
    materialization_state: isRuntimeSidecar ? "materialized" : value.materialization_state,
  } as unknown as SyntheticSequence60Descriptor;
  if (!["dgkma-synthetic-sequence-60-v1", "dgkma-restore-security-sidecar-v1"].includes(String(value.schema_version)) || descriptor.sequence_no !== 60 || descriptor.artifact_id !== "database-security-v1" || descriptor.materialization_state !== "materialized") fail("sequence_60_descriptor_identity_mismatch");
  if (!SHA.test(descriptor.artifact_sha256) || !SHA.test(descriptor.restore_reconcile_sha256)) fail("sequence_60_descriptor_sha_invalid");
  return descriptor;
}

const RECONCILE_STATEMENT_ALLOWLIST = new Set([
  "REVOKE ALL ON SCHEMA public FROM PUBLIC",
  "REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC",
  "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC",
  "REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC",
  "REVOKE ALL PRIVILEGES ON ALL PROCEDURES IN SCHEMA public FROM PUBLIC",
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM PUBLIC",
  "ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM PUBLIC",
  "ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON ROUTINES FROM PUBLIC",
  [
    "DO $dgkma_restore$",
    "BEGIN",
    "EXECUTE pg_catalog.format('GRANT CONNECT ON DATABASE %I TO PUBLIC', pg_catalog.current_database());",
    "EXECUTE pg_catalog.format('REVOKE CREATE,TEMPORARY ON DATABASE %I FROM PUBLIC', pg_catalog.current_database());",
    "END",
    "$dgkma_restore$",
  ].join(" "),
].map((statement) => statement.replace(/\s+/g, " ").trim().toLowerCase()));

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let start = 0;
  let quote: "single" | "double" | string | null = null;
  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote === "single") {
      if (character === "'" && sql[index + 1] === "'") index += 1;
      else if (character === "'") quote = null;
      continue;
    }
    if (quote === "double") {
      if (character === '"' && sql[index + 1] === '"') index += 1;
      else if (character === '"') quote = null;
      continue;
    }
    if (quote?.startsWith("$")) {
      if (sql.startsWith(quote, index)) {
        index += quote.length - 1;
        quote = null;
      }
      continue;
    }
    if (character === "'") quote = "single";
    else if (character === '"') quote = "double";
    else if (character === "$") {
      const tag = sql.slice(index).match(/^\$[a-z_][a-z0-9_]*\$/i)?.[0] ?? null;
      if (tag) {
        quote = tag;
        index += tag.length - 1;
      }
    } else if (character === ";") {
      statements.push(sql.slice(start, index).trim());
      start = index + 1;
    }
  }
  if (quote !== null) fail("restore_reconcile_unterminated_quote");
  const trailing = sql.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements.filter(Boolean);
}

function validateReconcileSql(sql: string): void {
  if (sql.includes("/*")) fail("restore_reconcile_block_comment_forbidden");
  const withoutComments = sql.replace(/--[^\n]*/g, "").trim();
  if (!withoutComments) fail("restore_reconcile_empty");
  const statements = splitSqlStatements(withoutComments);
  if (statements.length === 0) fail("restore_reconcile_empty");
  const observed = new Set<string>();
  for (const statement of statements) {
    const normalized = statement.replace(/\s+/g, " ").trim().toLowerCase();
    if (!RECONCILE_STATEMENT_ALLOWLIST.has(normalized)) {
      fail("restore_reconcile_statement_not_allowlisted");
    }
    if (observed.has(normalized)) fail("restore_reconcile_statement_duplicate");
    observed.add(normalized);
  }
  if (
    observed.size !== RECONCILE_STATEMENT_ALLOWLIST.size ||
    [...RECONCILE_STATEMENT_ALLOWLIST].some((statement) => !observed.has(statement))
  ) {
    fail("restore_reconcile_statement_set_mismatch");
  }
}

export function authorizeRestoreReconcile(input: {
  targetKind: RestoreTargetKind;
  descriptorPath: string | null;
  receiptPath: string;
}): { result: "authorized"; sql_executions: 0; restore_reconcile_sha256: string } {
  if (input.targetKind !== "disposable-test") fail("restore_reconcile_target_forbidden");
  if (!input.descriptorPath) fail("restore_reconcile_sequence_60_missing");
  const descriptor = readSyntheticSequence60Descriptor(input.descriptorPath);
  const receipt = readRestoreReceipt(input.receiptPath);
  let artifactBytes: Buffer;
  let reconcileBytes: Buffer;
  try {
    artifactBytes = readFileSync(descriptor.artifact_path);
    reconcileBytes = readFileSync(descriptor.restore_reconcile_path);
  } catch {
    fail("restore_reconcile_bound_file_missing");
  }
  if (sha256(artifactBytes) !== descriptor.artifact_sha256) fail("restore_reconcile_sequence_60_artifact_drift");
  if (sha256(reconcileBytes) !== descriptor.restore_reconcile_sha256) fail("restore_reconcile_bytes_drift");
  if (receipt.sequence_60_artifact_sha256 !== descriptor.artifact_sha256 || receipt.restore_reconcile_sha256 !== descriptor.restore_reconcile_sha256) fail("restore_reconcile_receipt_binding_mismatch");
  validateReconcileSql(reconcileBytes.toString("utf8"));
  return { result: "authorized", sql_executions: 0, restore_reconcile_sha256: descriptor.restore_reconcile_sha256 };
}

export const RESTORE_READINESS = "pending Todo 22 measured drill";
