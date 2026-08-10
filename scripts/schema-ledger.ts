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

export interface MigrationActor {
  userId: number;
  userUid: string;
  authorizationVersion: string;
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
const SEQUENCES = [1, 10, 15, 20, 30, 40, 50, 60, 65, 70, 80];
const EXPECTED_KINDS = new Map<number, ArtifactDescriptor["kind"]>([
  [1,"manual"],[10,"baseline"],[15,"ordinary"],[20,"ordinary"],[30,"ordinary"],[40,"manual"],[50,"ordinary"],[60,"manual"],[65,"ordinary"],[70,"manual"],[80,"manual"],
]);
const BASELINE_TABLES = [
  "alumni_database", "categories", "comments", "community_events", "event_parse_rate_limits",
  "kakao_identity_terminations", "kakao_oauth_states", "obituaries", "payments",
  "pending_registrations", "posts", "session", "users",
] as const;
const LEDGER_TABLES = ["schema_capability_receipts", "schema_change_ledger", "schema_release_runs"] as const;
// Filled from the target-neutral object catalog produced by the checked-in baseline artifact.
// The same digest must be reproduced by the frozen Development brownfield and a clean disposable apply.
const BASELINE_OBJECT_CATALOG_SHA256 = "551af090142392fbc2f56b835e1986544daa144cae89d45960ac02d992070c08";

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
  const lineage = manifest.value.manifest_lineage as { parent_manifest_sha256?: unknown; parent_manifest_path?: unknown; amendment_code?: unknown } | undefined;
  if (!lineage || typeof lineage.parent_manifest_sha256 !== "string" || !SHA.test(lineage.parent_manifest_sha256) || typeof lineage.parent_manifest_path !== "string" || lineage.amendment_code !== "group_member_source_root_v1") fail("manifest_lineage_invalid");
  const parentManifest = readManifest(lineage.parent_manifest_path);
  if (parentManifest.sha256 !== lineage.parent_manifest_sha256) fail("manifest_parent_checksum_mismatch");
  const parentLineage=parentManifest.value.manifest_lineage as {parent_manifest_sha256?:unknown;parent_manifest_path?:unknown;amendment_code?:unknown}|undefined;
  if(!parentLineage||typeof parentLineage.parent_manifest_sha256!=="string"||!SHA.test(parentLineage.parent_manifest_sha256)||typeof parentLineage.parent_manifest_path!=="string"||parentLineage.amendment_code!=="event_claim_coordinate_root_v1")fail("manifest_parent_lineage_invalid");
  const rootManifest=readManifest(parentLineage.parent_manifest_path);if(rootManifest.sha256!==parentLineage.parent_manifest_sha256)fail("manifest_root_checksum_mismatch");
  const descriptors = readdirSync(directory)
    .filter((name) => /^\d{4}_.+\.json$/.test(name) && !name.endsWith(".restore.json"))
    .sort()
    .map((name) => {
      const filePath = path.join(directory, name);
      const bytes = readFileSync(filePath);
      const value = JSON.parse(bytes.toString("utf8")) as Record<string, unknown>;
      if (`${canonicalJson(value as Json)}\n` !== bytes.toString("utf8")) fail("artifact_descriptor_not_canonical_json_lf");
      exactKeys(value, DESCRIPTOR_KEYS, "artifact_descriptor_key_mismatch");
      return value as unknown as ArtifactDescriptor;
    });
  if (descriptors.length !== 12) fail("artifact_descriptor_count_mismatch");
  if (new Set(descriptors.map((descriptor) => descriptor.artifact_id)).size !== descriptors.length) fail("artifact_descriptor_id_duplicate");
  const grouped = new Map<number, ArtifactDescriptor[]>();
  for (const descriptor of descriptors) {
    if (!SEQUENCES.includes(descriptor.sequence_no)) fail("artifact_sequence_unknown");
    grouped.set(descriptor.sequence_no, [...(grouped.get(descriptor.sequence_no) ?? []), descriptor]);
    const expectedManifestSha = descriptor.sequence_no === 80 ? manifest.sha256 : descriptor.sequence_no === 70 ? parentManifest.sha256 : rootManifest.sha256;
    if (descriptor.manifest_sha256 !== expectedManifestSha) fail("artifact_manifest_checksum_mismatch");
    if (descriptor.kind !== EXPECTED_KINDS.get(descriptor.sequence_no)) fail("artifact_kind_mismatch");
    if (!Array.isArray(descriptor.depends_on) || !["all","exactly_one"].includes(descriptor.dependency_mode)) fail("artifact_dependency_contract_invalid");
    const expectedState = "materialized";
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

export type CapabilityVariant = "preferred_btree_gist" | "deferred_trigger_fallback";

export function selectedArtifacts(
  fromSequence: number,
  throughSequence: number,
  variant: CapabilityVariant,
): ArtifactDescriptor[] {
  if (!SEQUENCES.includes(throughSequence) || !SEQUENCES.includes(fromSequence) || fromSequence > throughSequence) {
    fail("artifact_requested_boundary_invalid");
  }
  return readArtifactDescriptors().filter((descriptor) => {
    if (descriptor.sequence_no < fromSequence || descriptor.sequence_no > throughSequence) return false;
    if (descriptor.sequence_no === 65 && throughSequence !== 65) return false;
    if (descriptor.sequence_no !== 40) return true;
    return descriptor.artifact_id === (variant === "preferred_btree_gist"
      ? "accounting-temporal-preferred-v1"
      : "accounting-temporal-fallback-v1");
  });
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
    await verifyExistingBootstrap(pool, target, descriptor, descriptor.manifest_sha256);
    return { outcome: "verified_noop", releaseUid: null };
  }
  const releaseUid = randomUUID();
  await pool.query("BEGIN");
  try {
    await pool.query("SELECT pg_advisory_xact_lock($1::bigint)", [schemaLockKey(target.targetFingerprint).toString()]);
    if (await tableExists(pool)) fail("ledger_bootstrap_concurrent_change");
    for (const [key, value] of settingEntries(target, capability, descriptor.manifest_sha256, descriptor, releaseUid)) {
      await pool.query("SELECT set_config($1,$2,true)", [key, value]);
    }
    await pool.query(readFileSync(descriptor.path, "utf8"));
    await verifyExistingBootstrap(pool, target, descriptor, descriptor.manifest_sha256);
    if (options.interruptBeforeCommit) fail("ledger_simulated_interrupt");
    await pool.query("COMMIT");
    return { outcome: "applied", releaseUid };
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function existingLedgerRow(pool: Pool, sequence: number) {
  const result = await pool.query<{
    artifact_id: string; artifact_sha256: string; manifest_sha256: string; target_fingerprint: string;
    artifact_kind: string; capability_variant: string; executor_version: string; release_state: string;
  }>(`
    SELECT l.artifact_id, l.artifact_sha256, l.manifest_sha256, l.target_fingerprint,
           l.artifact_kind, l.capability_variant, l.executor_version, r.state AS release_state
    FROM public.schema_change_ledger l
    JOIN public.schema_release_runs r ON r.id=l.release_run_id
    WHERE l.sequence_no=$1
  `, [sequence]);
  if ((result.rowCount ?? 0) > 1) fail("ledger_sequence_duplicate");
  return result.rows[0] ?? null;
}

export async function baselineObjectCatalog(pool: Pool): Promise<{ sha256: string; value: Record<string, Json> }> {
  const names = [...BASELINE_TABLES];
  // Keep every query on the transaction-owning pool connection. Concurrent pool.query calls
  // can allocate other sessions that cannot see uncommitted clean-baseline DDL.
  const tables = await pool.query(`
      SELECT c.relname AS table_name, c.relkind AS table_kind, c.relpersistence AS persistence
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname = ANY($1::text[])
      ORDER BY c.relname
    `, [names]);
  const columns = await pool.query(`
      SELECT c.relname AS table_name, a.attnum::int AS position, a.attname AS column_name,
             pg_catalog.format_type(a.atttypid,a.atttypmod) AS formatted_type,
             NOT a.attnotnull AS is_nullable, pg_catalog.pg_get_expr(ad.adbin,ad.adrelid,true) AS column_default,
             NULLIF(a.attidentity,'') AS identity_kind, NULLIF(a.attgenerated,'') AS generated_kind
      FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid=a.attrelid AND ad.adnum=a.attnum
      WHERE n.nspname='public' AND c.relname = ANY($1::text[]) AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY c.relname,a.attnum
    `, [names]);
  const constraints = await pool.query(`
      SELECT c.relname AS table_name, con.conname AS constraint_name, con.contype AS constraint_type,
             con.convalidated AS is_validated, pg_catalog.pg_get_constraintdef(con.oid,true) AS definition
      FROM pg_catalog.pg_constraint con
      JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname = ANY($1::text[]) AND con.contype IN ('p','f','u','c','x')
      ORDER BY c.relname,con.contype,con.conname
    `, [names]);
  const indexes = await pool.query(`
      SELECT tbl.relname AS table_name, idx.relname AS index_name, i.indisprimary AS is_primary,
             i.indisunique AS is_unique, i.indisvalid AS is_valid, i.indisready AS is_ready,
             pg_catalog.pg_get_expr(i.indexprs,i.indrelid,true) AS expressions,
             pg_catalog.pg_get_expr(i.indpred,i.indrelid,true) AS predicate,
             pg_catalog.pg_get_indexdef(i.indexrelid,0,true) AS definition
      FROM pg_catalog.pg_index i
      JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid
      JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace
      WHERE n.nspname='public' AND tbl.relname = ANY($1::text[])
      ORDER BY tbl.relname,idx.relname
    `, [names]);
  const sequences = await pool.query(`
      SELECT c.relname AS sequence_name, pg_catalog.format_type(s.seqtypid,NULL) AS data_type,
             s.seqstart::text AS start_value, s.seqincrement::text AS increment_by,
             s.seqmin::text AS minimum_value, s.seqmax::text AS maximum_value,
             s.seqcache::text AS cache_size, s.seqcycle AS cycles
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_catalog.pg_sequence s ON s.seqrelid=c.oid
      WHERE n.nspname='public' AND c.relkind='S' AND c.relname = ANY($1::text[])
      ORDER BY c.relname
    `, [names.map((name) => `${name}_id_seq`)]);
  const publicTables = await pool.query(`
      SELECT c.relname AS table_name
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p')
      ORDER BY c.relname
    `);
  const allowed = new Set<string>([...BASELINE_TABLES, ...LEDGER_TABLES]);
  const actualPublicTables = publicTables.rows.map((row) => String(row.table_name));
  if (actualPublicTables.some((name) => !allowed.has(name))) {
    fail("baseline_catalog_unexpected_table");
  }
  const value = {
    tables: tables.rows as Json,
    columns: columns.rows as Json,
    constraints: constraints.rows as Json,
    indexes: indexes.rows as Json,
    sequences: sequences.rows as Json,
  };
  return { value, sha256: sha256(canonicalJson(value)) };
}

async function verifyBaselineObjectCatalog(pool: Pool): Promise<void> {
  const observed = await baselineObjectCatalog(pool);
  if (observed.sha256 !== BASELINE_OBJECT_CATALOG_SHA256) fail("baseline_catalog_object_drift");
}

export async function applyArtifact(
  pool: Pool,
  target: BootstrapTarget,
  capability: CapabilityReceipt,
  descriptor: ArtifactDescriptor,
  variant: CapabilityVariant,
  actor?: MigrationActor,
  interruptBeforeCommit = false,
): Promise<"applied" | "verified_noop"> {
  if (descriptor.sequence_no === 1) fail("ledger_sequence_one_requires_bootstrap_path");
  verifyArtifactBytes(descriptor);
  const existing = await existingLedgerRow(pool, descriptor.sequence_no);
  if (existing) {
    if (
      existing.artifact_id !== descriptor.artifact_id || existing.artifact_sha256 !== descriptor.artifact_sha256 ||
      existing.manifest_sha256 !== descriptor.manifest_sha256 || existing.target_fingerprint !== target.targetFingerprint ||
      existing.artifact_kind !== descriptor.kind || existing.capability_variant !== variant ||
      existing.executor_version !== "schema-ledger-v1" || existing.release_state !== "verified"
    ) fail("ledger_artifact_drift");
    return "verified_noop";
  }
  const requiredPrevious = descriptor.sequence_no === 10 ? 1
    : descriptor.sequence_no === 15 ? 10
    : descriptor.sequence_no === 20 ? 15
    : descriptor.sequence_no === 30 ? 20
    : descriptor.sequence_no === 40 ? 30
    : descriptor.sequence_no === 50 ? 40
    : descriptor.sequence_no === 60 ? 50
    : descriptor.sequence_no === 70 ? 60 : 70;
  if (!(await existingLedgerRow(pool, requiredPrevious))) fail("ledger_dependency_missing");
  const releaseUid = randomUUID();
  await pool.query("BEGIN");
  try {
    await pool.query("SELECT pg_advisory_xact_lock($1::bigint)", [schemaLockKey(target.targetFingerprint).toString()]);
    if (await existingLedgerRow(pool, descriptor.sequence_no)) fail("ledger_artifact_concurrent_change");
    if (descriptor.sequence_no === 10 && target.kind === "development") await verifyBaselineObjectCatalog(pool);
    if (descriptor.sequence_no === 50) {
      if (!actor) fail("blocked_actor");
      const liveActor = await pool.query<{ ok: boolean }>(`
        SELECT EXISTS(
          SELECT 1 FROM public.users
          WHERE id=$1 AND user_uid=$2::uuid AND is_admin=true
          FOR UPDATE
        ) AS ok
      `, [actor.userId, actor.userUid]);
      if (liveActor.rows[0]?.ok !== true) fail("blocked_actor");
      for (const [key, value] of [
        ["dgkma.actor_user_id", String(actor.userId)],
        ["dgkma.actor_user_uid", actor.userUid],
        ["dgkma.actor_authorization_version", actor.authorizationVersion],
      ] as const) {
        await pool.query("SELECT set_config($1,$2,true)", [key, value]);
      }
    } else if (actor) {
      fail("ledger_actor_only_valid_for_sequence_50");
    }
    if (descriptor.sequence_no === 70 || descriptor.sequence_no === 80) await pool.query(readFileSync(descriptor.path, "utf8"));
    const release = await pool.query<{ id: string }>(`
      INSERT INTO public.schema_release_runs
        (release_uid,manifest_sha256,target_fingerprint,requested_through_sequence_no,state,started_at,legacy_feature_state,executor_identity,executor_version)
      VALUES ($1,$2,$3,$4,'applying',clock_timestamp(),'legacy','dgkma-schema-ledger','schema-ledger-v1') RETURNING id::text
    `, [releaseUid, descriptor.manifest_sha256, target.targetFingerprint, descriptor.sequence_no]);
    const receipt = await pool.query<{ id: string }>(`
      SELECT id::text FROM public.schema_capability_receipts
      WHERE target_fingerprint=$1 ORDER BY id DESC LIMIT 1
    `, [target.targetFingerprint]);
    if (!receipt.rows[0]) fail("ledger_capability_receipt_missing");
    if (descriptor.sequence_no !== 70 && descriptor.sequence_no !== 80) await pool.query(readFileSync(descriptor.path, "utf8"));
    if (descriptor.sequence_no === 10) await verifyBaselineObjectCatalog(pool);
    await pool.query(`
      INSERT INTO public.schema_change_ledger
        (artifact_id,artifact_sha256,artifact_kind,sequence_no,manifest_sha256,release_run_id,target_database,target_fingerprint,capability_receipt_id,capability_variant,executor_version)
      VALUES ($1,$2,$3,$4,$5,$6,current_database(),$7,$8,$9,'schema-ledger-v1')
    `, [descriptor.artifact_id, descriptor.artifact_sha256, descriptor.kind, descriptor.sequence_no, descriptor.manifest_sha256,
      release.rows[0].id, target.targetFingerprint, receipt.rows[0].id, variant]);
    await pool.query("UPDATE public.schema_release_runs SET state='verified',finished_at=clock_timestamp() WHERE id=$1", [release.rows[0].id]);
    if (interruptBeforeCommit) fail("ledger_simulated_interrupt");
    await pool.query("COMMIT");
    return "applied";
  } catch (error) {
    await pool.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
