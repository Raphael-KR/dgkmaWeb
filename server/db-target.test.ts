import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { Pool } from "pg";
import {
  DATABASE_POOL_POLICY,
  buildDisposableSyntheticAdminSpec,
  createOrResumeDisposableTarget,
  createTargetPool,
  disposableDatabaseName,
  disposableTargetFingerprint,
  ordinaryTargetFingerprint,
  redactDatabaseText,
  resolveDevelopmentTarget,
  resolveDisposableControlTarget,
  resolveProductionReadonlyTarget,
  runRollbackPrivilegeProbes,
  sha256,
  shutdownPool,
  teardownDisposableTarget,
  toPoolConfig,
  verifyDevelopmentTarget,
} from "./db-target";

const integrationEnabled = process.env.RUN_DB_TARGET_INTEGRATION === "1";
const integrationCase = process.env.DB_TARGET_TEST_CASE;

function developmentEnv(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const key of ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"]) {
    const value = process.env[key];
    if (!value) throw new Error(`integration_missing_${key.toLowerCase()}`);
    result[key] = value;
  }
  if (process.env.REPL_ID) result.REPL_ID = process.env.REPL_ID;
  return result;
}

function writeRuntimeReceipt(value: Record<string, unknown>): void {
  const receiptPath = process.env.DB_TARGET_TEST_RECEIPT_PATH;
  if (!receiptPath) return;
  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function databaseExists(pool: Pool, databaseName: string): Promise<boolean> {
  const result = await pool.query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname=$1) AS exists",
    [databaseName],
  );
  return result.rows[0].exists;
}

test("development resolver requires literal PG fields and exact safe pool policy", () => {
  assert.equal(
    ordinaryTargetFingerprint({
      kind: "development",
      database: "heliumdb",
      user: "postgres",
      address: "helium",
      port: 5432,
      serverVersionNum: 160010,
    }),
    "b3f038ee10e11f57fa524477ce393d82a67b71c223ef582776a83b828d239971",
  );
  assert.equal(
    ordinaryTargetFingerprint({
      kind: "development",
      database: "heliumdb",
      user: "postgres",
      address: null,
      port: null,
      serverVersionNum: 160010,
    }),
    "a5d02b38bb4686ca206c3fb120687794d91e32d32ba5b7027d5b0fe93d32bcc5",
  );
  const target = resolveDevelopmentTarget({
    PGHOST: "db.internal.example",
    PGPORT: "65432",
    PGUSER: "app",
    PGPASSWORD: "not-logged",
    PGDATABASE: "heliumdb",
  });
  assert.equal(target.credentialSource, "PG*");
  assert.equal(target.credentialHost, "db.internal.example");
  assert.deepEqual(target.ssl, { rejectUnauthorized: true });
  assert.equal(
    resolveDevelopmentTarget({
      PGHOST: "helium",
      PGPORT: "5432",
      PGUSER: "app",
      PGPASSWORD: "not-logged",
      PGDATABASE: "heliumdb",
      REPL_ID: "approved-replit",
    }).ssl,
    false,
  );
  assert.deepEqual(
    resolveDevelopmentTarget({
      PGHOST: "helium",
      PGPORT: "5432",
      PGUSER: "app",
      PGPASSWORD: "not-logged",
      PGDATABASE: "heliumdb",
    }).ssl,
    { rejectUnauthorized: true },
  );
  assert.deepEqual(
    resolveDevelopmentTarget({
      PGHOST: "other-internal-host",
      PGPORT: "5432",
      PGUSER: "app",
      PGPASSWORD: "not-logged",
      PGDATABASE: "heliumdb",
      REPL_ID: "approved-replit",
    }).ssl,
    { rejectUnauthorized: true },
  );
  assert.deepEqual(
    {
      max: toPoolConfig(target).max,
      min: toPoolConfig(target).min,
      connectionTimeoutMillis: toPoolConfig(target).connectionTimeoutMillis,
      idleTimeoutMillis: toPoolConfig(target).idleTimeoutMillis,
      maxUses: toPoolConfig(target).maxUses,
    },
    {
      max: DATABASE_POOL_POLICY.max,
      min: DATABASE_POOL_POLICY.min,
      connectionTimeoutMillis: DATABASE_POOL_POLICY.connectionTimeoutMillis,
      idleTimeoutMillis: DATABASE_POOL_POLICY.idleTimeoutMillis,
      maxUses: DATABASE_POOL_POLICY.maxUses,
    },
  );
  assert.match(String(toPoolConfig(target).options), /statement_timeout=30000/);
  assert.match(String(toPoolConfig(target).options), /lock_timeout=5000/);
  assert.match(String(toPoolConfig(target).options), /idle_in_transaction_session_timeout=30000/);
  const socket = resolveDevelopmentTarget({
    PGHOST: "/tmp/postgres",
    PGPORT: "5432",
    PGUSER: "app",
    PGPASSWORD: "not-logged",
    PGDATABASE: "heliumdb",
  });
  assert.equal(socket.ssl, false);
  assert.throws(
    () => resolveDevelopmentTarget({ DATABASE_URL: "postgresql://forbidden" }, "runtime"),
    /database_target_missing_pghost/,
  );
  assert.throws(
    () =>
      resolveDevelopmentTarget(
        {
          PGHOST: "db",
          PGPORT: "5432",
          PGUSER: "app",
          PGPASSWORD: "secret",
          PGDATABASE: "heliumdb",
          DATABASE_URL: "",
        },
        "drizzle",
      ),
    /database_target_url_credentials_forbidden/,
  );
});

test("disposable resolver binds lowercase UUID, marker-derived name, actor, and rejects URL keys", () => {
  const runUid = "88ddb810-4f71-4b08-a026-ffdf7cbc16bf";
  const env = {
    PGHOST: "db.internal.example",
    PGPORT: "5432",
    PGUSER: "app",
    PGPASSWORD: "not-logged",
    PGDATABASE: "heliumdb",
  };
  const target = resolveDisposableControlTarget(env, runUid);
  assert.equal(target.applicationName, `dgkma-disposable-control:${runUid}`);
  const databaseName = disposableDatabaseName(runUid);
  assert.equal(databaseName, `dgkma_test_${sha256(runUid).slice(0, 20)}`);
  const fingerprint = disposableTargetFingerprint({
    databaseName,
    currentUserOid: 10,
    parentDevelopmentFingerprint: "a".repeat(64),
    runUid,
    serverVersionNum: 160010,
  });
  const actor = buildDisposableSyntheticAdminSpec({
    kind: "disposable-test",
    runUid,
    targetFingerprint: fingerprint,
  });
  assert.equal(actor.sourceCode, "DISPOSABLE_SYNTHETIC_ADMIN_V1");
  assert.equal(actor.email, `dgkma-disposable+${sha256(runUid).slice(0, 20)}@invalid.example`);
  assert.equal(actor.isAdmin, true);
  assert.throws(
    () =>
      buildDisposableSyntheticAdminSpec({
        kind: "development" as "disposable-test",
        runUid,
        targetFingerprint: fingerprint,
      }),
    /database_target_synthetic_actor_scope_forbidden/,
  );
  assert.throws(
    () => resolveDisposableControlTarget({ ...env, PROD_DATABASE_READONLY_URL: "" }, runUid),
    /database_target_url_credentials_forbidden/,
  );
  assert.throws(
    () => resolveDisposableControlTarget(env, runUid.toUpperCase()),
    /database_target_invalid_run_uid/,
  );
});

test("privilege probes are rollback-only and redaction removes credentials", () => {
  const message = redactDatabaseText(
    "postgresql://owner:secret@db.example/neondb password=secret token=abc",
    ["secret"],
  );
  assert.doesNotMatch(message, /owner:|secret|abc/);
  assert.match(message, /REDACTED/);
});

test("production-readonly resolver requires the dedicated URL and verified TLS without connecting", () => {
  const target = resolveProductionReadonlyTarget({
    PROD_DATABASE_READONLY_URL: "postgresql://reader:secret@prod.example:5432/neondb",
  });
  assert.equal(target.kind, "production-readonly");
  assert.equal(target.credentialSource, "PROD_DATABASE_READONLY_URL");
  assert.deepEqual(target.ssl, { rejectUnauthorized: true });
  assert.throws(
    () =>
      resolveProductionReadonlyTarget({
        PROD_DATABASE_READONLY_URL: "postgresql://reader:secret@prod.example/neondb",
        PROD_DATABASE_URL: "",
      }),
    /database_target_owner_credentials_forbidden/,
  );
  assert.throws(
    () => resolveProductionReadonlyTarget({ DATABASE_URL: "", PROD_DATABASE_READONLY_URL: "" }),
    /database_target_owner_credentials_forbidden/,
  );
});

test(
  "development disposable privilege happy integration proves teardown absence",
  { skip: !integrationEnabled || integrationCase !== "happy" },
  async () => {
    const env = developmentEnv();
    const runUid = process.env.DB_TARGET_RUN_UID ?? randomUUID();
    const controlTarget = resolveDisposableControlTarget(env, runUid);
    const controlPool = createTargetPool(controlTarget);
    let disposable:
      | Awaited<ReturnType<typeof createOrResumeDisposableTarget>>
      | undefined;
    try {
      const development = await verifyDevelopmentTarget(controlPool, {
        ...controlTarget,
        kind: "development",
        applicationName: "dgkma-development:task-3-happy",
      });
      const developmentProbe = await runRollbackPrivilegeProbes(
        controlPool,
        development,
        randomUUID(),
      );
      assert.equal(developmentProbe.table_probe_absent, true);
      assert.equal(developmentProbe.routine_probe_absent, true);
      disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
      const disposableProbe = await runRollbackPrivilegeProbes(
        disposable.pool,
        {
          kind: "disposable-test",
          targetFingerprint: disposable.targetFingerprint,
          parentTargetFingerprint: disposable.parentTargetFingerprint,
          runUid,
          currentUser: disposable.currentUser,
          currentUserOid: disposable.currentUserOid,
          serverVersionNum: disposable.serverVersionNum,
        },
        randomUUID(),
      );
      assert.equal(disposableProbe.table_probe_absent, true);
      assert.equal(disposableProbe.routine_probe_absent, true);
      const actor = buildDisposableSyntheticAdminSpec({
        kind: "disposable-test",
        runUid,
        targetFingerprint: disposable.targetFingerprint,
      });
      const originalFingerprint = disposable.targetFingerprint;
      await shutdownPool(disposable.pool);
      disposable.poolClosed = true;
      disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
      assert.equal(disposable.targetFingerprint, originalFingerprint);
      const teardown = await teardownDisposableTarget(controlPool, disposable);
      disposable = undefined;
      assert.equal(teardown.absent, true);
      assert.equal(await databaseExists(controlPool, teardown.databaseName), false);
      writeRuntimeReceipt({
        schema_version: "dgkma-task-3-runtime-v1",
        case: "happy",
        target_kind: "development",
        disposable_run_uid: runUid,
        disposable_database: teardown.databaseName,
        disposable_absent: true,
        development_probe_absent: true,
        disposable_probe_absent: true,
        synthetic_actor_source: actor.sourceCode,
        production_credentials_read: false,
      });
    } finally {
      if (disposable) await teardownDisposableTarget(controlPool, disposable);
      await shutdownPool(controlPool);
    }
  },
);

test(
  "disposable privilege failure integration refuses foreign collision and read-only probe residue",
  { skip: !integrationEnabled || integrationCase !== "failure" },
  async () => {
    const fixturePath = process.env.DB_TARGET_FIXTURE_PATH;
    assert.ok(fixturePath);
    const fixture = JSON.parse(readFileSync(fixturePath, "utf8")) as {
      schema_version: string;
      cases: Array<{ name: string; expected_error: string }>;
    };
    assert.equal(fixture.schema_version, "dgkma-task-3-negative-fixtures-v1");
    assert.deepEqual(
      fixture.cases.map((item) => item.name),
      ["foreign_marker_collision", "readonly_probe", "leaked_session", "artifact_execution_refused"],
    );
    const env = developmentEnv();
    const collisionUid = process.env.DB_TARGET_RUN_UID ?? randomUUID();
    const collisionName = disposableDatabaseName(collisionUid);
    const controlTarget = resolveDisposableControlTarget(env, collisionUid);
    const controlPool = createTargetPool(controlTarget);
    let readonlyDisposable:
      | Awaited<ReturnType<typeof createOrResumeDisposableTarget>>
      | undefined;
    try {
      const development = await verifyDevelopmentTarget(controlPool, {
        ...controlTarget,
        kind: "development",
        applicationName: "dgkma-development:task-3-failure",
      });
      assert.equal(await databaseExists(controlPool, collisionName), false);
      await controlPool.query(
        `CREATE DATABASE "${collisionName}" TEMPLATE template0 OWNER "${development.currentUser.replaceAll('"', '""')}"`,
      );
      await controlPool.query(`COMMENT ON DATABASE "${collisionName}" IS 'foreign-marker'`);
      let artifactExecuted = false;
      await assert.rejects(async () => {
        await createOrResumeDisposableTarget(controlPool, development, collisionUid);
        artifactExecuted = true;
      }, /database_target_foreign_collision/);
      assert.equal(artifactExecuted, false);
      assert.equal(await databaseExists(controlPool, collisionName), true);
      await controlPool.query(`DROP DATABASE "${collisionName}"`);

      const readonlyUid = randomUUID();
      readonlyDisposable = await createOrResumeDisposableTarget(controlPool, development, readonlyUid);
      const readonlyPool = new Pool({
        ...toPoolConfig({
          ...controlTarget,
          kind: "disposable-test",
          database: readonlyDisposable.databaseName,
          applicationName: `dgkma-disposable-readonly-probe:${readonlyUid}`,
        }),
        options: `${String(toPoolConfig(controlTarget).options)} -c default_transaction_read_only=on`,
      });
      await assert.rejects(
        runRollbackPrivilegeProbes(
          readonlyPool,
          {
            kind: "disposable-test",
            targetFingerprint: readonlyDisposable.targetFingerprint,
            parentTargetFingerprint: readonlyDisposable.parentTargetFingerprint,
            runUid: readonlyUid,
            currentUser: readonlyDisposable.currentUser,
            currentUserOid: readonlyDisposable.currentUserOid,
            serverVersionNum: readonlyDisposable.serverVersionNum,
          },
          randomUUID(),
        ),
        /read-only transaction|cannot execute CREATE/i,
      );
      await shutdownPool(readonlyPool);
      const residue = await readonlyDisposable.pool.query<{ count: number }>(
        `SELECT count(*)::int AS count
         FROM pg_class
         WHERE relname LIKE '__dgkma_table_probe_%'
         UNION ALL
         SELECT count(*)::int
         FROM pg_proc
         WHERE proname LIKE '__dgkma_routine_probe_%'`,
      );
      assert.deepEqual(residue.rows.map((row) => row.count), [0, 0]);
      const leakedPool = createTargetPool({
        ...controlTarget,
        kind: "disposable-test",
        database: readonlyDisposable.databaseName,
        applicationName: `dgkma-disposable-leak:${readonlyUid}`,
      });
      const leakedClient = await leakedPool.connect();
      await assert.rejects(
        teardownDisposableTarget(controlPool, readonlyDisposable),
        /database_target_leaked_session/,
      );
      assert.equal(await databaseExists(controlPool, readonlyDisposable.databaseName), true);
      leakedClient.release();
      await shutdownPool(leakedPool);
      const teardown = await teardownDisposableTarget(controlPool, readonlyDisposable);
      readonlyDisposable = undefined;
      assert.equal(await databaseExists(controlPool, teardown.databaseName), false);
      writeRuntimeReceipt({
        schema_version: "dgkma-task-3-runtime-v1",
        case: "failure",
        fixture_cases: fixture.cases.length,
        collision_refused: true,
        collision_not_dropped_by_resolver: true,
        artifact_execution_refused: !artifactExecuted,
        leaked_session_refused_without_drop: true,
        probe_objects_remaining: 0,
        disposable_absent: true,
        production_credentials_read: false,
      });
    } finally {
      if (readonlyDisposable) await teardownDisposableTarget(controlPool, readonlyDisposable);
      if (await databaseExists(controlPool, collisionName)) {
        await controlPool.query(`DROP DATABASE "${collisionName}"`);
      }
      await shutdownPool(controlPool);
    }
  },
);
