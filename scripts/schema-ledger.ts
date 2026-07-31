import { createHash, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Pool } from "pg";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type MaterializationState = "materialized" | "not_materialized";

export interface ArtifactDescriptor {
  artifact_id: string;
  artifact_sha256: string | null;
  capability_predicate: string;
  dependency_mode: "all" | "exactly_one";
  depends_on: string[];
  kind: "manual" | "baseline" | "ordinary";
  manifest_sha256: string;
  materialization_state: MaterializationState;
  owner: string;
  path: string;
  required_for_production: boolean;
  required_for_startup: boolean;
  sequence_no: number;
}

export interface BootstrapTarget {
  kind: "development" | "disposable-test";
  targetFingerprint: string;
  parentTargetFingerprint: string | null;
  runUid: string | null;
  currentDatabase: string;
  currentUser: string;
  currentUserOid: number;
  serverVersionNum: number;
  applicationName: string;
}

export interface CapabilityReceipt {
  target_kind: "development" | "disposable-test";
  parent_target_fingerprint: string | null;
  disposable_run_uid: string | null;
  preflight_run_uid: string;
  probe_token: string;
  server_version_num: number;
  gen_random_uuid_available: boolean;
  btree_gist_installed: boolean;
  btree_gist_available: boolean;
  btree_gist_create_privilege: boolean;
  current_user_name: string;
  current_user_oid: number;
  database_create_privilege: boolean;
  public_schema_create_privilege: boolean;
  table_create_privilege: boolean;
  routine_create_privilege: boolean;
  table_create_probe_passed: boolean;
  routine_create_probe_passed: boolean;
  table_probe_absent: boolean;
  routine_probe_absent: boolean;
  observed_catalog_sha256: string;
  observed_at: string;
  receipt_sha256: string;
}

const SHA = /^[0-9a-f]{64}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DESCRIPTOR_KEYS = [
  "artifact_id","artifact_sha256","capability_predicate","dependency_mode","depends_on","kind","manifest_sha256",
  "materialization_state","owner","path","required_for_production","required_for_startup","sequence_no",
].sort();
const SEQUENCES = [1, 10, 15, 20, 30, 40, 50, 60, 65];
const EXPECTED_KINDS = new Map<number, ArtifactDescriptor["kind"]>([
  [1,"manual"],[10,"baseline"],[15,"ordinary"],[20,"ordinary"],[30,"ordinary"],[40,"manual"],[50,"ordinary"],[60,"manual"],[65,"ordinary"],
]);

export function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
}

function fail(code: string): never {
  throw new Error(code);
}

function exactKeys(value: Record<string, unknown>, expected: string[], code: string): void {
  const actual = Object.keys(value).sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) fail(code);
}

export function readManifest(filePath = "docs/database-manifest.yaml"): { bytes: Buffer; value: Record<string, unknown>; sha256: string } {
  const bytes = readFileSync(filePath);
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("manifest_not_deterministic_json_yaml");
  }
  if (`${canonicalJson(value as Json)}\n` !== bytes.toString("utf8")) fail("manifest_not_canonical_json_lf");
  if (value.schema_version !== "dgkma-database-manifest-v1") fail("manifest_schema_version_mismatch");
  if (/\b(?:ACTOR|AUDIT_ACTOR|OPTIONAL_ACTOR|VCHAIN|CANONICAL_PHONE|DEFAULT_ACTOR)\b|<[a-z][a-z0-9_-]*>/.test(bytes.toString("utf8"))) {
    fail("manifest_unexpanded_token");
  }
  return { bytes, value, sha256: sha256(bytes) };
}

export function readArtifactDescriptors(directory = "migrations/artifacts", manifestPath = "docs/database-manifest.yaml"): ArtifactDescriptor[] {
  const manifest = readManifest(manifestPath);
  const descriptors = readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const filePath = path.join(directory, name);
      const bytes = readFileSync(filePath);
      const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
      if (`${canonicalJson(value as Json)}\n` !== bytes.toString("utf8")) fail("artifact_descriptor_not_canonical_json_lf");
      exactKeys(value, DESCRIPTOR_KEYS, "artifact_descriptor_key_mismatch");
      return value as unknown as ArtifactDescriptor;
    });
  if (descriptors.length !== 10) fail("artifact_descriptor_count_mismatch");
  if (new Set(descriptors.map((descriptor) => descriptor.artifact_id)).size !== descriptors.length) fail("artifact_descriptor_id_duplicate");
  const grouped = new Map<number, ArtifactDescriptor[]>();
  for (const descriptor of descriptors) {
    if (!SEQUENCES.includes(descriptor.sequence_no)) fail("artifact_sequence_unknown");
    grouped.set(descriptor.sequence_no, [...(grouped.get(descriptor.sequence_no) ?? []), descriptor]);
    if (descriptor.manifest_sha256 !== manifest.sha256) fail("artifact_manifest_checksum_mismatch");
    if (descriptor.kind !== EXPECTED_KINDS.get(descriptor.sequence_no)) fail("artifact_kind_mismatch");
    if (!Array.isArray(descriptor.depends_on) || !["all","exactly_one"].includes(descriptor.dependency_mode)) fail("artifact_dependency_contract_invalid");
    const expectedState = descriptor.sequence_no === 1 ? "materialized" : "not_materialized";
    if (descriptor.materialization_state !== expectedState) fail("artifact_materialization_state_mismatch");
    if (descriptor.sequence_no === 65 && (descriptor.required_for_startup || !descriptor.required_for_production)) fail("artifact_sequence_65_route_mismatch");
    if (descriptor.sequence_no !== 65 && (!descriptor.required_for_startup || !descriptor.required_for_production)) fail("artifact_required_route_mismatch");
    if (descriptor.materialization_state === "materialized") {
      if (!descriptor.artifact_sha256 || !SHA.test(descriptor.artifact_sha256)) fail("artifact_checksum_missing");
      if (sha256(readFileSync(descriptor.path)) !== descriptor.artifact_sha256) fail("checksum_mismatch");
    } else {
      if (descriptor.artifact_sha256 !== null) fail("artifact_unmaterialized_checksum_present");
      try {
        readFileSync(descriptor.path);
        fail("artifact_not_materialized_path_exists");
      } catch (error) {
        if (error instanceof Error && error.message === "artifact_not_materialized_path_exists") throw error;
      }
    }
  }
  for (const sequence of SEQUENCES) {
    const count = grouped.get(sequence)?.length ?? 0;
    if (count !== (sequence === 40 ? 2 : 1)) fail("artifact_sequence_descriptor_count_mismatch");
  }
  const byId = new Map(descriptors.map((descriptor) => [descriptor.artifact_id, descriptor]));
  for (const descriptor of descriptors) {
    if (descriptor.sequence_no === 1 && descriptor.depends_on.length !== 0) fail("artifact_bootstrap_dependency_mismatch");
    if (descriptor.sequence_no !== 1 && descriptor.depends_on.length === 0) fail("artifact_dependency_missing");
    for (const dependency of descriptor.depends_on) {
      const prior = byId.get(dependency);
      if (!prior || prior.sequence_no >= descriptor.sequence_no) fail("artifact_dependency_order_mismatch");
    }
    if ((descriptor.sequence_no === 50) !== (descriptor.dependency_mode === "exactly_one")) fail("artifact_dependency_mode_mismatch");
  }
  return descriptors.sort((a, b) => a.sequence_no - b.sequence_no || a.artifact_id.localeCompare(b.artifact_id));
}

export function verifyArtifactBytes(descriptor: ArtifactDescriptor, artifactPath = descriptor.path): void {
  if (descriptor.materialization_state !== "materialized" || !descriptor.artifact_sha256) fail("artifact_not_materialized");
  if (sha256(readFileSync(artifactPath)) !== descriptor.artifact_sha256) fail("checksum_mismatch");
}

export function schemaLockKey(targetFingerprint: string): bigint {
  if (!SHA.test(targetFingerprint)) fail("schema_target_fingerprint_invalid");
  const hex = sha256(`dgkma-schema-lock-v1\n${targetFingerprint}`).slice(0, 16);
  const unsigned = BigInt(`0x${hex}`);
  return unsigned >= 0x8000000000000000n ? unsigned - 0x10000000000000000n : unsigned;
}

export function plannedArtifacts(throughSequence = 1): ArtifactDescriptor[] {
  if (!SEQUENCES.includes(throughSequence)) fail("artifact_requested_boundary_invalid");
  return readArtifactDescriptors().filter((descriptor) => descriptor.sequence_no <= throughSequence);
}

async function tableExists(pool: Pool): Promise<boolean> {
  const result = await pool.query<{ present: boolean }>("SELECT to_regclass('public.schema_change_ledger') IS NOT NULL AS present");
  return result.rows[0]?.present === true;
}

async function verifyExistingBootstrap(pool: Pool, target: BootstrapTarget, descriptor: ArtifactDescriptor, manifestSha: string): Promise<void> {
  const result = await pool.query<{
    artifact_id: string; artifact_sha256: string; manifest_sha256: string; target_fingerprint: string;
    sequence_no: number; release_state: string; capability_receipt_sha256: string;
  }>(`
    SELECT l.artifact_id, l.artifact_sha256, l.manifest_sha256, l.target_fingerprint,
           l.sequence_no, r.state AS release_state, c.receipt_sha256 AS capability_receipt_sha256
    FROM public.schema_change_ledger l
    JOIN public.schema_release_runs r ON r.id=l.release_run_id
    JOIN public.schema_capability_receipts c ON c.id=l.capability_receipt_id
    WHERE l.sequence_no=1
  `);
  if (result.rowCount !== 1) fail(`ledger_bootstrap_row_count_mismatch:${result.rowCount ?? "null"}`);
  const row = result.rows[0];
  const mismatches = [
    row.artifact_id !== descriptor.artifact_id ? "artifact_id" : null,
    row.artifact_sha256 !== descriptor.artifact_sha256 ? "artifact_sha256" : null,
    row.manifest_sha256 !== manifestSha ? "manifest_sha256" : null,
    row.target_fingerprint !== target.targetFingerprint ? "target_fingerprint" : null,
    row.sequence_no !== 1 ? "sequence_no" : null,
    row.release_state !== "verified" ? "release_state" : null,
    !SHA.test(row.capability_receipt_sha256) ? "capability_receipt_sha256_format" : null,
  ].filter((value): value is string => value !== null);
  if (mismatches.length > 0) fail(`ledger_bootstrap_drift:${mismatches.join(",")}`);
}

function settingEntries(target: BootstrapTarget, capability: CapabilityReceipt, manifestSha: string, descriptor: ArtifactDescriptor, releaseUid: string): Array<[string,string]> {
  const observed = { ...capability } as Record<string, unknown>;
  delete observed.receipt_sha256;
  return [
    ["dgkma.target_kind", target.kind], ["dgkma.target_fingerprint", target.targetFingerprint],
    ["dgkma.parent_target_fingerprint", target.parentTargetFingerprint ?? ""], ["dgkma.disposable_run_uid", target.runUid ?? ""],
    ["dgkma.preflight_run_uid", capability.preflight_run_uid], ["dgkma.probe_token", capability.probe_token],
    ["dgkma.server_version_num", String(capability.server_version_num)], ["dgkma.gen_random_uuid_available", String(capability.gen_random_uuid_available)],
    ["dgkma.btree_gist_installed", String(capability.btree_gist_installed)], ["dgkma.btree_gist_available", String(capability.btree_gist_available)],
    ["dgkma.btree_gist_create_privilege", String(capability.btree_gist_create_privilege)], ["dgkma.current_user_name", capability.current_user_name],
    ["dgkma.current_user_oid", String(capability.current_user_oid)], ["dgkma.database_create_privilege", String(capability.database_create_privilege)],
    ["dgkma.public_schema_create_privilege", String(capability.public_schema_create_privilege)], ["dgkma.table_create_privilege", String(capability.table_create_privilege)],
    ["dgkma.routine_create_privilege", String(capability.routine_create_privilege)], ["dgkma.table_create_probe_passed", String(capability.table_create_probe_passed)],
    ["dgkma.routine_create_probe_passed", String(capability.routine_create_probe_passed)], ["dgkma.observed_catalog_sha256", capability.observed_catalog_sha256],
    ["dgkma.observed_json", canonicalJson(observed as Json)], ["dgkma.observed_at", capability.observed_at],
    ["dgkma.capability_receipt_sha256", capability.receipt_sha256], ["dgkma.release_uid", releaseUid],
    ["dgkma.manifest_sha256", manifestSha], ["dgkma.artifact_sha256", descriptor.artifact_sha256!],
    ["dgkma.executor_identity", "dgkma-schema-ledger"], ["dgkma.executor_version", "schema-ledger-v1"],
  ];
}

export async function applySequenceOne(
  pool: Pool,
  target: BootstrapTarget,
  capability: CapabilityReceipt,
  options: { interruptBeforeCommit?: boolean } = {},
): Promise<{ outcome: "applied" | "verified_noop"; releaseUid: string | null }> {
  const manifest = readManifest();
  const descriptors = readArtifactDescriptors();
  const descriptor = descriptors.find((entry) => entry.sequence_no === 1)!;
  if (capability.target_kind !== target.kind || capability.server_version_num !== target.serverVersionNum || capability.current_user_name !== target.currentUser || capability.current_user_oid !== target.currentUserOid || !capability.table_create_probe_passed || !capability.routine_create_probe_passed || !capability.table_probe_absent || !capability.routine_probe_absent) fail("capability_receipt_target_mismatch");
  if (capability.parent_target_fingerprint !== target.parentTargetFingerprint || capability.disposable_run_uid !== target.runUid) fail("capability_receipt_route_mismatch");
  const identity = await pool.query<{ database_name: string; user_name: string; user_oid: number; version_num: number; application_name: string }>(`
    SELECT current_database() AS database_name, current_user AS user_name,
           current_user::regrole::oid::int AS user_oid,
           current_setting('server_version_num')::int AS version_num,
           current_setting('application_name') AS application_name
  `);
  const live = identity.rows[0];
  if (live.database_name !== target.currentDatabase || live.user_name !== target.currentUser || live.user_oid !== target.currentUserOid || live.version_num !== target.serverVersionNum || live.application_name !== target.applicationName) fail("ledger_live_target_mismatch");
  if (await tableExists(pool)) {
    await verifyExistingBootstrap(pool, target, descriptor, manifest.sha256);
    return { outcome: "verified_noop", releaseUid: null };
  }
  const releaseUid = randomUUID();
  await pool.query("BEGIN");
  try {
    await pool.query("SELECT pg_advisory_xact_lock($1::bigint)", [schemaLockKey(target.targetFingerprint).toString()]);
    if (await tableExists(pool)) fail("ledger_bootstrap_concurrent_change");
    for (const [key, value] of settingEntries(target, capability, manifest.sha256, descriptor, releaseUid)) {
      await pool.query("SELECT set_config($1,$2,true)", [key, value]);
    }
    await pool.query(readFileSync(descriptor.path, "utf8"));
    await verifyExistingBootstrap(pool, target, descriptor, manifest.sha256);
    if (options.interruptBeforeCommit) fail("ledger_simulated_interrupt");
    await pool.query("COMMIT");
    return { outcome: "applied", releaseUid };
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
