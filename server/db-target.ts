import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PoolClient, PoolConfig } from "pg";
import { Pool } from "pg";

export type DatabaseTargetKind = "development" | "disposable-test" | "production-readonly";
export type DatabasePurpose = "runtime" | "drizzle" | "migration";
export type EnvironmentMap = Readonly<Record<string, string | undefined>>;

export const DATABASE_POOL_POLICY = Object.freeze({
  max: 10,
  min: 0,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 30_000,
  maxUses: 10_000,
  statementTimeoutMillis: 30_000,
  lockTimeoutMillis: 5_000,
  idleInTransactionSessionTimeoutMillis: 30_000,
  shutdownTimeoutMillis: 10_000,
});

export const DEVELOPMENT_DATABASE = "heliumdb";
export const PRODUCTION_READONLY_DATABASE = "neondb";
export const DEVELOPMENT_TARGET_RECEIPT_PATH = "docs/database-targets/development-approved.json";
export const DISPOSABLE_SYNTHETIC_ADMIN_SOURCE = "DISPOSABLE_SYNTHETIC_ADMIN_V1";

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_DISPOSABLE_NAME = /^dgkma_test_[0-9a-f]{20}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const DEVELOPMENT_FINGERPRINT = "b3f038ee10e11f57fa524477ce393d82a67b71c223ef582776a83b828d239971";
const DEVELOPMENT_USER_OID = 10;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface ResolvedDatabaseTarget {
  kind: DatabaseTargetKind;
  credentialSource: "PG*" | "PROD_DATABASE_READONLY_URL";
  credentialHost: string;
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  applicationName: string;
  ssl: false | { rejectUnauthorized: true };
}

export interface VerifiedDevelopmentTarget {
  resolved: ResolvedDatabaseTarget;
  targetFingerprint: string;
  currentDatabase: "heliumdb";
  currentUser: string;
  currentUserOid: number;
  serverVersionNum: number;
  address: string;
  serverPort: number | "local";
}

export interface DisposableTarget {
  kind: "disposable-test";
  runUid: string;
  databaseName: string;
  targetFingerprint: string;
  parentTargetFingerprint: string;
  currentUserOid: number;
  currentUser: string;
  serverVersionNum: number;
  applicationName: string;
  controlResolved: ResolvedDatabaseTarget;
  pool: Pool;
  poolClosed: boolean;
}

interface DevelopmentReceipt {
  schema_version: "dgkma-development-target-v1";
  target_kind: "development";
  target_fingerprint: string;
  current_database: "heliumdb";
  current_user_name: string;
  current_user_oid: number;
  server_version_num: number;
  pg_tuple_digest: string;
  approval_source_commit: string;
  observed_at: string;
  receipt_sha256: string;
}

export function canonicalJson(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function fail(code: string): never {
  throw new Error(code);
}

function hasEnvironmentKey(env: EnvironmentMap, key: string): boolean {
  return Object.keys(env).includes(key);
}

function rejectEnvironmentKeys(env: EnvironmentMap, keys: readonly string[], code: string): void {
  if (keys.some((key) => hasEnvironmentKey(env, key))) fail(code);
}

function requireEnvironmentValue(env: EnvironmentMap, key: string): string {
  const value = env[key];
  if (typeof value !== "string" || value.length === 0) fail(`database_target_missing_${key.toLowerCase()}`);
  return value;
}

function parsePort(value: string): number {
  if (!/^[0-9]+$/.test(value)) fail("database_target_invalid_pgport");
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) fail("database_target_invalid_pgport");
  return port;
}

function isUnixSocket(host: string): boolean {
  return host.startsWith("/");
}

function isApprovedReplitDevelopmentTransport(env: EnvironmentMap, credentialHost: string): boolean {
  return credentialHost === "helium" && typeof env.REPL_ID === "string" && env.REPL_ID.length > 0;
}

function developmentTransport(
  env: EnvironmentMap,
  credentialHost: string,
): false | { rejectUnauthorized: true } {
  if (isUnixSocket(credentialHost)) return false;
  if (isApprovedReplitDevelopmentTransport(env, credentialHost)) return false;
  return { rejectUnauthorized: true };
}

export function resolveDevelopmentTarget(
  env: EnvironmentMap = process.env,
  purpose: DatabasePurpose = "runtime",
): ResolvedDatabaseTarget {
  if (purpose !== "runtime") {
    rejectEnvironmentKeys(
      env,
      ["DATABASE_URL", "PROD_DATABASE_URL", "PROD_DATABASE_READONLY_URL"],
      "database_target_url_credentials_forbidden",
    );
  }
  const credentialHost = requireEnvironmentValue(env, "PGHOST");
  const port = parsePort(requireEnvironmentValue(env, "PGPORT"));
  const user = requireEnvironmentValue(env, "PGUSER");
  const password = requireEnvironmentValue(env, "PGPASSWORD");
  const database = requireEnvironmentValue(env, "PGDATABASE");
  if (database.toLowerCase() !== DEVELOPMENT_DATABASE) fail("database_target_development_database_mismatch");
  return {
    kind: "development",
    credentialSource: "PG*",
    credentialHost,
    host: credentialHost,
    port,
    user,
    password,
    database: DEVELOPMENT_DATABASE,
    applicationName: `dgkma-development:${purpose}`,
    ssl: developmentTransport(env, credentialHost),
  };
}

export function resolveDisposableControlTarget(
  env: EnvironmentMap,
  runUid: string,
): ResolvedDatabaseTarget {
  validateRunUid(runUid);
  rejectEnvironmentKeys(
    env,
    ["DATABASE_URL", "PROD_DATABASE_URL", "PROD_DATABASE_READONLY_URL"],
    "database_target_url_credentials_forbidden",
  );
  const development = resolveDevelopmentTarget(env, "runtime");
  return {
    ...development,
    applicationName: `dgkma-disposable-control:${runUid}`,
  };
}

export function resolveProductionReadonlyTarget(env: EnvironmentMap): ResolvedDatabaseTarget {
  rejectEnvironmentKeys(
    env,
    ["DATABASE_URL", "PROD_DATABASE_URL"],
    "database_target_owner_credentials_forbidden",
  );
  const rawUrl = requireEnvironmentValue(env, "PROD_DATABASE_READONLY_URL");
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    fail("database_target_invalid_readonly_url");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
    fail("database_target_invalid_readonly_url");
  }
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (database.toLowerCase() !== PRODUCTION_READONLY_DATABASE) {
    fail("database_target_production_database_mismatch");
  }
  const port = parsePort(parsed.port || "5432");
  const host = parsed.hostname;
  if (!host || !parsed.username || !parsed.password || isUnixSocket(host)) {
    fail("database_target_production_tls_required");
  }
  return {
    kind: "production-readonly",
    credentialSource: "PROD_DATABASE_READONLY_URL",
    credentialHost: host,
    host,
    port,
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
    database: PRODUCTION_READONLY_DATABASE,
    applicationName: "dgkma-production-readonly",
    ssl: { rejectUnauthorized: true },
  };
}

export function toPoolConfig(target: ResolvedDatabaseTarget): PoolConfig {
  return {
    host: target.host,
    port: target.port,
    user: target.user,
    password: target.password,
    database: target.database,
    application_name: target.applicationName,
    ssl: target.ssl,
    max: DATABASE_POOL_POLICY.max,
    min: DATABASE_POOL_POLICY.min,
    connectionTimeoutMillis: DATABASE_POOL_POLICY.connectionTimeoutMillis,
    idleTimeoutMillis: DATABASE_POOL_POLICY.idleTimeoutMillis,
    maxUses: DATABASE_POOL_POLICY.maxUses,
    options: [
      `-c statement_timeout=${DATABASE_POOL_POLICY.statementTimeoutMillis}`,
      `-c lock_timeout=${DATABASE_POOL_POLICY.lockTimeoutMillis}`,
      `-c idle_in_transaction_session_timeout=${DATABASE_POOL_POLICY.idleInTransactionSessionTimeoutMillis}`,
    ].join(" "),
  };
}

export function createTargetPool(target: ResolvedDatabaseTarget): Pool {
  return new Pool(toPoolConfig(target));
}

export type VerifiedDevelopmentPool = Pool & {
  readonly targetVerification: Promise<VerifiedDevelopmentTarget>;
};

export function createVerifiedDevelopmentPool(target: ResolvedDatabaseTarget): VerifiedDevelopmentPool {
  if (target.kind !== "development") fail("database_target_development_required");
  const pool = createTargetPool(target) as VerifiedDevelopmentPool;
  const originalQuery = pool.query.bind(pool);
  const originalConnect = pool.connect.bind(pool);
  const targetVerification = verifyDevelopmentTarget(pool, target);
  Object.defineProperty(pool, "targetVerification", {
    configurable: false,
    enumerable: false,
    writable: false,
    value: targetVerification,
  });
  pool.query = ((...args: unknown[]) =>
    targetVerification.then(() => originalQuery(...(args as Parameters<typeof originalQuery>)))) as typeof pool.query;
  pool.connect = ((...args: unknown[]) =>
    targetVerification.then(() => originalConnect(...(args as Parameters<typeof originalConnect>)))) as typeof pool.connect;
  return pool;
}

export async function shutdownPool(pool: Pool, timeoutMillis = DATABASE_POOL_POLICY.shutdownTimeoutMillis): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      pool.end(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("database_pool_shutdown_borrowers_remain")), timeoutMillis);
        timer.unref();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function ordinaryTargetFingerprint(input: {
  kind: "development" | "production-readonly";
  database: string;
  user: string;
  address: string | null;
  port: number | null;
  serverVersionNum: number;
}): string {
  const fields = [
    "dgkma-target-v1",
    input.kind.toLowerCase(),
    input.database.toLowerCase(),
    input.user.toLowerCase(),
    input.address?.toLowerCase() ?? "local",
    input.port === null ? "local" : String(input.port),
    String(input.serverVersionNum),
  ];
  return sha256(fields.join("\n"));
}

export function validateRunUid(runUid: string): void {
  if (!UUID_V4.test(runUid)) fail("database_target_invalid_run_uid");
}

export function disposableDatabaseName(runUid: string): string {
  validateRunUid(runUid);
  return `dgkma_test_${sha256(runUid).slice(0, 20)}`;
}

export function disposableTargetFingerprint(input: {
  databaseName: string;
  currentUserOid: number;
  parentDevelopmentFingerprint: string;
  runUid: string;
  serverVersionNum: number;
}): string {
  validateRunUid(input.runUid);
  if (!SAFE_DISPOSABLE_NAME.test(input.databaseName)) fail("database_target_invalid_disposable_name");
  if (!SHA256.test(input.parentDevelopmentFingerprint)) fail("database_target_invalid_parent_fingerprint");
  return sha256(
    [
      "dgkma-disposable-target-v1",
      input.databaseName,
      String(input.currentUserOid),
      input.parentDevelopmentFingerprint,
      input.runUid,
      String(input.serverVersionNum),
    ].join("\n"),
  );
}

function exactKeys(object: Record<string, unknown>, expected: readonly string[], code: string): void {
  const actual = Object.keys(object).sort();
  const keys = [...expected].sort();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index])) fail(code);
}

export function readDevelopmentTargetReceipt(filePath = DEVELOPMENT_TARGET_RECEIPT_PATH): DevelopmentReceipt {
  const receipt = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, unknown>;
  exactKeys(
    receipt,
    [
      "schema_version",
      "target_kind",
      "target_fingerprint",
      "current_database",
      "current_user_name",
      "current_user_oid",
      "server_version_num",
      "pg_tuple_digest",
      "approval_source_commit",
      "observed_at",
      "receipt_sha256",
    ],
    "database_target_receipt_key_mismatch",
  );
  const withoutHash = { ...receipt };
  delete withoutHash.receipt_sha256;
  if (receipt.receipt_sha256 !== sha256(canonicalJson(withoutHash as Json))) {
    fail("database_target_receipt_self_hash_mismatch");
  }
  if (
    receipt.schema_version !== "dgkma-development-target-v1" ||
    receipt.target_kind !== "development" ||
    receipt.current_database !== DEVELOPMENT_DATABASE ||
    receipt.target_fingerprint !== DEVELOPMENT_FINGERPRINT ||
    receipt.current_user_oid !== DEVELOPMENT_USER_OID
  ) {
    fail("database_target_receipt_mismatch");
  }
  return receipt as unknown as DevelopmentReceipt;
}

export async function verifyDevelopmentTarget(
  pool: Pool,
  resolved: ResolvedDatabaseTarget,
  receipt = readDevelopmentTargetReceipt(),
): Promise<VerifiedDevelopmentTarget> {
  if (resolved.kind !== "development") fail("database_target_development_required");
  const result = await pool.query<{
    current_database: string;
    current_user_name: string;
    current_user_oid: number;
    server_version_num: number;
    server_address: string | null;
    server_port: number | null;
  }>(`
    SELECT current_database() AS current_database,
           current_user AS current_user_name,
           current_user::regrole::oid::int AS current_user_oid,
           current_setting('server_version_num')::int AS server_version_num,
           inet_server_addr()::text AS server_address,
           inet_server_port()::int AS server_port
  `);
  const row = result.rows[0];
  const targetFingerprint = ordinaryTargetFingerprint({
    kind: "development",
    database: row.current_database,
    user: row.current_user_name,
    address: isUnixSocket(resolved.host) ? null : resolved.credentialHost,
    port: isUnixSocket(resolved.host) ? null : resolved.port,
    serverVersionNum: row.server_version_num,
  });
  const pgTupleDigest = sha256(
    canonicalJson({
      host: resolved.credentialHost.toLowerCase(),
      port: String(resolved.port),
      database: resolved.database.toLowerCase(),
      user: resolved.user.toLowerCase(),
    }),
  );
  if (row.current_database !== receipt.current_database) fail("database_target_development_database_receipt_mismatch");
  if (row.current_user_name !== receipt.current_user_name) fail("database_target_development_user_receipt_mismatch");
  if (row.current_user_oid !== receipt.current_user_oid) fail("database_target_development_user_oid_receipt_mismatch");
  if (row.server_version_num !== receipt.server_version_num) fail("database_target_development_version_receipt_mismatch");
  if (targetFingerprint !== receipt.target_fingerprint) fail("database_target_development_fingerprint_receipt_mismatch");
  if (pgTupleDigest !== receipt.pg_tuple_digest) fail("database_target_development_tuple_receipt_mismatch");
  return {
    resolved,
    targetFingerprint,
    currentDatabase: DEVELOPMENT_DATABASE,
    currentUser: row.current_user_name,
    currentUserOid: row.current_user_oid,
    serverVersionNum: row.server_version_num,
    address: row.server_address ?? "local",
    serverPort: row.server_port ?? "local",
  };
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function disposableComment(runUid: string, parentFingerprint: string, ownerOid: number): string {
  return `dgkma-disposable-v1|run_uid=${runUid}|parent=${parentFingerprint}|owner_oid=${ownerOid}`;
}

async function disposableCatalogRow(controlPool: Pool, databaseName: string) {
  const result = await controlPool.query<{
    database_oid: number;
    owner_oid: number;
    marker: string | null;
    session_count: number;
  }>(
    `
      SELECT d.oid::int AS database_oid,
             d.datdba::int AS owner_oid,
             shobj_description(d.oid, 'pg_database') AS marker,
             (SELECT count(*)::int FROM pg_stat_activity a WHERE a.datid=d.oid) AS session_count
      FROM pg_database d
      WHERE d.datname=$1
    `,
    [databaseName],
  );
  return result.rows[0] ?? null;
}

export async function createOrResumeDisposableTarget(
  controlPool: Pool,
  development: VerifiedDevelopmentTarget,
  runUid: string,
): Promise<DisposableTarget> {
  validateRunUid(runUid);
  const verifiedDevelopment = await verifyDevelopmentTarget(controlPool, development.resolved);
  if (
    verifiedDevelopment.targetFingerprint !== development.targetFingerprint ||
    verifiedDevelopment.currentUserOid !== development.currentUserOid
  ) {
    fail("database_target_development_context_mismatch");
  }
  development = verifiedDevelopment;
  const privilege = await controlPool.query<{ allowed: boolean }>(
    "SELECT (rolcreatedb OR rolsuper) AS allowed FROM pg_roles WHERE oid=current_user::regrole::oid",
  );
  if (privilege.rows[0]?.allowed !== true) fail("database_target_createdb_privilege_required");
  const databaseName = disposableDatabaseName(runUid);
  const expectedComment = disposableComment(runUid, development.targetFingerprint, development.currentUserOid);
  const existing = await disposableCatalogRow(controlPool, databaseName);
  if (existing) {
    if (
      existing.marker !== expectedComment ||
      existing.owner_oid !== development.currentUserOid ||
      existing.session_count !== 0
    ) {
      fail(existing.session_count === 0 ? "database_target_foreign_collision" : "database_target_leaked_session");
    }
  } else {
    await controlPool.query(
      `CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0 OWNER ${quoteIdentifier(development.currentUser)}`,
    );
    await controlPool.query(
      `COMMENT ON DATABASE ${quoteIdentifier(databaseName)} IS ${quoteLiteral(expectedComment)}`,
    );
  }
  const targetResolved: ResolvedDatabaseTarget = {
    ...development.resolved,
    kind: "disposable-test",
    database: databaseName,
    applicationName: `dgkma-disposable:${runUid}`,
  };
  const pool = createTargetPool(targetResolved);
  try {
    const result = await pool.query<{
      current_database: string;
      current_user_oid: number;
      server_version_num: number;
      application_name: string;
    }>(`
      SELECT current_database() AS current_database,
             current_user::regrole::oid::int AS current_user_oid,
             current_setting('server_version_num')::int AS server_version_num,
             current_setting('application_name') AS application_name
    `);
    const row = result.rows[0];
    if (
      row.current_database !== databaseName ||
      row.current_user_oid !== development.currentUserOid ||
      row.server_version_num !== development.serverVersionNum ||
      row.application_name !== targetResolved.applicationName
    ) {
      fail("database_target_disposable_identity_mismatch");
    }
    return {
      kind: "disposable-test",
      runUid,
      databaseName,
      targetFingerprint: disposableTargetFingerprint({
        databaseName,
        currentUserOid: row.current_user_oid,
        parentDevelopmentFingerprint: development.targetFingerprint,
        runUid,
        serverVersionNum: row.server_version_num,
      }),
      parentTargetFingerprint: development.targetFingerprint,
      currentUserOid: row.current_user_oid,
      currentUser: development.currentUser,
      serverVersionNum: row.server_version_num,
      applicationName: targetResolved.applicationName,
      controlResolved: development.resolved,
      pool,
      poolClosed: false,
    };
  } catch (error) {
    await shutdownPool(pool).catch(() => undefined);
    throw error;
  }
}

export async function teardownDisposableTarget(
  controlPool: Pool,
  target: DisposableTarget,
): Promise<{ databaseName: string; absent: true }> {
  if (target.kind !== "disposable-test" || !SAFE_DISPOSABLE_NAME.test(target.databaseName)) {
    fail("database_target_disposable_required");
  }
  const verifiedControl = await verifyDevelopmentTarget(controlPool, target.controlResolved);
  if (
    verifiedControl.targetFingerprint !== target.parentTargetFingerprint ||
    verifiedControl.currentUserOid !== target.currentUserOid
  ) {
    fail("database_target_development_context_mismatch");
  }
  if (!target.poolClosed) {
    await shutdownPool(target.pool);
    target.poolClosed = true;
  }
  const before = await disposableCatalogRow(controlPool, target.databaseName);
  if (!before) return { databaseName: target.databaseName, absent: true };
  if (before.session_count !== 0) fail("database_target_leaked_session");
  const expectedComment = disposableComment(
    target.runUid,
    target.parentTargetFingerprint,
    target.currentUserOid,
  );
  if (before.marker !== expectedComment || before.owner_oid !== target.currentUserOid) {
    fail("database_target_foreign_collision");
  }
  await controlPool.query(`ALTER DATABASE ${quoteIdentifier(target.databaseName)} ALLOW_CONNECTIONS false`);
  const afterRevoke = await disposableCatalogRow(controlPool, target.databaseName);
  if (!afterRevoke || afterRevoke.session_count !== 0) fail("database_target_leaked_session");
  await controlPool.query(`DROP DATABASE ${quoteIdentifier(target.databaseName)}`);
  if (await disposableCatalogRow(controlPool, target.databaseName)) fail("database_target_teardown_absence_failed");
  return { databaseName: target.databaseName, absent: true };
}

async function runProbeTransaction(client: PoolClient, statements: readonly string[]): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const statement of statements) await client.query(statement);
  } finally {
    await client.query("ROLLBACK");
  }
}

export async function runRollbackPrivilegeProbes(
  pool: Pool,
  target: Pick<VerifiedDevelopmentTarget, "targetFingerprint" | "serverVersionNum" | "currentUser" | "currentUserOid"> & {
    kind?: "development" | "disposable-test";
    parentTargetFingerprint?: string | null;
    runUid?: string | null;
  },
  preflightRunUid = randomUUID(),
) {
  validateRunUid(preflightRunUid);
  const probeToken = sha256(`probe-v1\n${target.targetFingerprint}\n${preflightRunUid}`).slice(0, 12);
  if (!/^[0-9a-f]{12}$/.test(probeToken)) fail("database_target_invalid_probe_token");
  const tableName = `__dgkma_table_probe_${probeToken}`;
  const routineName = `__dgkma_routine_probe_${probeToken}`;
  const privilege = await pool.query<{
    gen_random_uuid_available: boolean;
    btree_gist_installed: boolean;
    btree_gist_available: boolean;
    btree_gist_create_privilege: boolean;
    database_create_privilege: boolean;
    public_schema_create_privilege: boolean;
    table_create_privilege: boolean;
    routine_create_privilege: boolean;
  }>(`
    SELECT to_regprocedure('gen_random_uuid()') IS NOT NULL AS gen_random_uuid_available,
           EXISTS (SELECT 1 FROM pg_extension WHERE extname='btree_gist') AS btree_gist_installed,
           EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='btree_gist') AS btree_gist_available,
           has_database_privilege(current_user,current_database(),'CREATE') AS btree_gist_create_privilege,
           has_database_privilege(current_user,current_database(),'CREATE') AS database_create_privilege,
           has_schema_privilege(current_user,'public','CREATE') AS public_schema_create_privilege,
           has_schema_privilege(current_user,'public','CREATE') AS table_create_privilege,
           has_schema_privilege(current_user,'public','CREATE') AS routine_create_privilege
  `);
  const tableClient = await pool.connect();
  try {
    await runProbeTransaction(tableClient, [
      `CREATE TABLE public.${quoteIdentifier(tableName)} (id bigint PRIMARY KEY)`,
      `DROP TABLE public.${quoteIdentifier(tableName)}`,
    ]);
  } finally {
    tableClient.release();
  }
  const routineClient = await pool.connect();
  try {
    await runProbeTransaction(routineClient, [
      `CREATE FUNCTION public.${quoteIdentifier(routineName)}() RETURNS integer LANGUAGE sql SET search_path = pg_catalog, public AS 'SELECT 1'`,
      `REVOKE ALL ON FUNCTION public.${quoteIdentifier(routineName)}() FROM PUBLIC`,
      `DROP FUNCTION public.${quoteIdentifier(routineName)}()`,
    ]);
  } finally {
    routineClient.release();
  }
  const absenceClient = await pool.connect();
  let absence: { table_absent: boolean; routine_absent: boolean };
  try {
    const result = await absenceClient.query<{ table_absent: boolean; routine_absent: boolean }>(
      `SELECT to_regclass($1) IS NULL AS table_absent,
              to_regprocedure($2) IS NULL AS routine_absent`,
      [`public.${tableName}`, `public.${routineName}()`],
    );
    absence = result.rows[0];
  } finally {
    absenceClient.release();
  }
  if (!absence.table_absent || !absence.routine_absent) fail("database_target_probe_residue");
  const catalogObservation = {
    ...privilege.rows[0],
    table_probe_absent: absence.table_absent,
    routine_probe_absent: absence.routine_absent,
  };
  const observed = {
    target_kind: target.kind ?? "development",
    parent_target_fingerprint: target.parentTargetFingerprint ?? null,
    disposable_run_uid: target.runUid ?? null,
    preflight_run_uid: preflightRunUid,
    probe_token: probeToken,
    server_version_num: target.serverVersionNum,
    current_user_name: target.currentUser,
    current_user_oid: target.currentUserOid,
    gen_random_uuid_available: privilege.rows[0].gen_random_uuid_available,
    btree_gist_installed: privilege.rows[0].btree_gist_installed,
    btree_gist_available: privilege.rows[0].btree_gist_available,
    btree_gist_create_privilege: privilege.rows[0].btree_gist_create_privilege,
    database_create_privilege: privilege.rows[0].database_create_privilege,
    public_schema_create_privilege: privilege.rows[0].public_schema_create_privilege,
    table_create_privilege: privilege.rows[0].table_create_privilege,
    routine_create_privilege: privilege.rows[0].routine_create_privilege,
    table_create_probe_passed: true,
    routine_create_probe_passed: true,
    table_probe_absent: absence.table_absent,
    routine_probe_absent: absence.routine_absent,
    observed_catalog_sha256: sha256(canonicalJson(catalogObservation as Json)),
    observed_at: new Date().toISOString(),
  };
  return { ...observed, receipt_sha256: sha256(canonicalJson(observed as Json)) };
}

export async function withProductionReadonly<T>(
  env: EnvironmentMap,
  operation: (client: PoolClient, fingerprint: string) => Promise<T>,
): Promise<T> {
  const resolved = resolveProductionReadonlyTarget(env);
  const pool = createTargetPool({ ...resolved, applicationName: "dgkma-production-readonly" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await client.query<{
      current_database: string;
      current_user_name: string;
      current_user_oid: number;
      server_version_num: number;
      server_address: string | null;
      server_port: number | null;
      transaction_read_only: string;
      database_create: boolean;
      schema_create: boolean;
    }>(`
      SELECT current_database() AS current_database,
             current_user AS current_user_name,
             current_user::regrole::oid::int AS current_user_oid,
             current_setting('server_version_num')::int AS server_version_num,
             inet_server_addr()::text AS server_address,
             inet_server_port()::int AS server_port,
             current_setting('transaction_read_only') AS transaction_read_only,
             has_database_privilege(current_user,current_database(),'CREATE') AS database_create,
             has_schema_privilege(current_user,'public','CREATE') AS schema_create
    `);
    const row = result.rows[0];
    if (
      row.current_database !== PRODUCTION_READONLY_DATABASE ||
      row.transaction_read_only !== "on" ||
      row.database_create ||
      row.schema_create
    ) {
      fail("database_target_production_readonly_contract_failed");
    }
    const fingerprint = ordinaryTargetFingerprint({
      kind: "production-readonly",
      database: row.current_database,
      user: row.current_user_name,
      address: resolved.credentialHost,
      port: resolved.port,
      serverVersionNum: row.server_version_num,
    });
    return await operation(client, fingerprint);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    client.release();
    await shutdownPool(pool);
  }
}

export function buildDisposableSyntheticAdminSpec(target: {
  kind: "disposable-test";
  runUid: string;
  targetFingerprint: string;
}) {
  if (target.kind !== "disposable-test") fail("database_target_synthetic_actor_scope_forbidden");
  validateRunUid(target.runUid);
  if (!SHA256.test(target.targetFingerprint)) fail("database_target_invalid_disposable_fingerprint");
  const token = sha256(target.runUid).slice(0, 20);
  return {
    sourceCode: DISPOSABLE_SYNTHETIC_ADMIN_SOURCE,
    runUid: target.runUid,
    targetFingerprint: target.targetFingerprint,
    email: `dgkma-disposable+${token}@invalid.example`,
    name: "Disposable Migration Admin",
    kakaoId: null,
    graduationYear: null,
    isVerified: true,
    isAdmin: true,
    kakaoSyncEnabled: false,
    profileImage: null,
    phoneNumber: null,
    birthday: null,
    birthdayType: null,
    isLeapMonth: null,
    activityRegion: null,
  } as const;
}

export function disposableSyntheticAuthorizationVersion(input: {
  runUid: string;
  targetFingerprint: string;
  userId: number;
  userUid: string;
  isAdmin: true;
}): string {
  buildDisposableSyntheticAdminSpec({
    kind: "disposable-test",
    runUid: input.runUid,
    targetFingerprint: input.targetFingerprint,
  });
  if (!Number.isSafeInteger(input.userId) || input.userId <= 0 || !input.userUid) {
    fail("database_target_invalid_synthetic_actor");
  }
  return sha256(
    [
      "authz-v1",
      input.targetFingerprint,
      String(input.userId),
      input.userUid.toLowerCase(),
      "migration_admin",
      input.isAdmin ? "1" : "0",
      "",
    ].join("\n"),
  );
}

export function redactDatabaseText(value: unknown, secrets: readonly string[] = []): string {
  let text = value instanceof Error ? value.message : String(value);
  text = text
    .replace(/\bpostgres(?:ql)?:\/\/[^\s]+/gi, "[REDACTED_DATABASE_URL]")
    .replace(/\b(password|secret|token|authorization|api[_-]?key)\s*[:=]\s*\S+/gi, "$1=[REDACTED]");
  for (const secret of secrets) {
    if (secret) text = text.split(secret).join("[REDACTED]");
  }
  return text;
}
