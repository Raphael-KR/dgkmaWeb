import type { Pool, PoolClient } from "pg";
import {
  createOrResumeDisposableTarget,
  createTargetPool,
  resolveDisposableControlTarget,
  shutdownPool,
  teardownDisposableTarget,
  verifyDevelopmentTarget,
} from "../server/db-target";
import {
  assertClosedSecurityCatalog,
  type SecurityCatalogAggregate,
} from "../server/accounting/security-evidence-contract";
import { canonicalJson, sha256 } from "../server/accounting/source-contracts";
import type { CanonicalValue } from "../server/accounting/source-contracts";

function arg(name: string): string {
  const index = process.argv.indexOf(name);
  if (index < 0 || !process.argv[index + 1]) throw new Error(`missing_argument:${name}`);
  return process.argv[index + 1];
}

async function roleMembershipDigest(pool: Pool | PoolClient): Promise<{ count: number; digest: string }> {
  const result = await pool.query<Record<string, CanonicalValue>>(`
    SELECT roleid::regrole::text AS granted_role,
           member::regrole::text AS member_role,
           grantor::regrole::text AS grantor_role,
           admin_option,
           inherit_option,
           set_option
    FROM pg_catalog.pg_auth_members
    ORDER BY roleid, member, grantor, admin_option, inherit_option, set_option
  `);
  return {
    count: result.rowCount ?? result.rows.length,
    digest: sha256(canonicalJson(result.rows as unknown as CanonicalValue)),
  };
}

async function securityAggregate(pool: Pool | PoolClient): Promise<SecurityCatalogAggregate> {
  const membership = await roleMembershipDigest(pool);
  const result = await pool.query<Omit<SecurityCatalogAggregate, "roleMembershipCount" | "roleMembershipDigest">>(`
    SELECT
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_namespace n,
             LATERAL pg_catalog.aclexplode(COALESCE(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) acl
        WHERE n.nspname='public' AND acl.grantee=0 AND acl.privilege_type='CREATE'
      ) AS "publicSchemaCreate",
      (
        SELECT count(*)::int
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace,
             LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) acl
        WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','f') AND acl.grantee=0
      ) AS "publicRelationPrivileges",
      (
        SELECT count(*)::int
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace,
             LATERAL pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('S', c.relowner))) acl
        WHERE n.nspname='public' AND c.relkind='S' AND acl.grantee=0
      ) AS "publicSequencePrivileges",
      (
        SELECT count(*)::int
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace,
             LATERAL pg_catalog.aclexplode(COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))) acl
        WHERE n.nspname='public' AND acl.grantee=0
      ) AS "publicRoutinePrivileges",
      (
        SELECT count(*)::int
        FROM pg_catalog.pg_default_acl d,
             LATERAL pg_catalog.aclexplode(d.defaclacl) acl
        WHERE acl.grantee=0
      ) AS "defaultPublicPrivileges",
      (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relrowsecurity) AS "rlsEnabled",
      (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relforcerowsecurity) AS "rlsForced",
      (SELECT count(*)::int FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AS policies,
      (SELECT count(*)::int FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef) AS "securityDefiner",
      (
        SELECT count(*)::int
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname='public' AND p.prosecdef
          AND NOT COALESCE(p.proconfig, ARRAY[]::text[]) @> ARRAY['search_path=pg_catalog, public']::text[]
      ) AS "securityDefinerWithoutSafeSearchPath",
      (SELECT count(*)::int FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f') AND c.relowner<>current_user::regrole::oid) AS "relationOwnerMismatch",
      (SELECT count(*)::int FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proowner<>current_user::regrole::oid) AS "routineOwnerMismatch"
  `);
  return {
    ...result.rows[0],
    roleMembershipCount: membership.count,
    roleMembershipDigest: membership.digest,
  };
}

async function injectPublicRoutineGrant(pool: Pool): Promise<SecurityCatalogAggregate> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const selected = await client.query<{ routine_oid: string }>(`
      SELECT p.oid::text AS routine_oid
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.prokind='f'
      ORDER BY p.oid
      LIMIT 1
    `);
    if (selected.rowCount !== 1) throw new Error("task_21_public_routine_fixture_missing");
    await client.query(`DO $fixture$
      DECLARE target_oid oid := ${Number(selected.rows[0].routine_oid)};
      BEGIN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO PUBLIC', target_oid::regprocedure);
      END
    $fixture$`);
    const drifted = await securityAggregate(client);
    await client.query("ROLLBACK");
    return drifted;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  if (arg("--target") !== "disposable-test") throw new Error("task_21_target_forbidden");
  const runUid = arg("--run-uid");
  const controlResolved = resolveDisposableControlTarget(process.env, runUid);
  const controlPool = createTargetPool(controlResolved);
  let disposable: Awaited<ReturnType<typeof createOrResumeDisposableTarget>> | undefined;
  let tornDown = false;
  try {
    const development = await verifyDevelopmentTarget(controlPool, { ...controlResolved, kind: "development" });
    const developmentMembership = await roleMembershipDigest(controlPool);
    disposable = await createOrResumeDisposableTarget(controlPool, development, runUid);
    const baseline = await securityAggregate(disposable.pool);
    assertClosedSecurityCatalog(baseline);
    if (baseline.roleMembershipDigest !== developmentMembership.digest) {
      throw new Error("task_21_role_membership_digest_drift");
    }

    const drifted = await injectPublicRoutineGrant(disposable.pool);
    let observedError = "none";
    try {
      assertClosedSecurityCatalog(drifted);
    } catch (error) {
      observedError = error instanceof Error ? error.message : "unknown";
    }
    if (observedError !== "security_catalog_drift" || drifted.publicRoutinePrivileges < 1) {
      throw new Error("task_21_public_routine_grant_not_detected");
    }

    const restored = await securityAggregate(disposable.pool);
    assertClosedSecurityCatalog(restored);
    if (canonicalJson(restored as unknown as CanonicalValue) !== canonicalJson(baseline as unknown as CanonicalValue)) {
      throw new Error("task_21_public_routine_grant_residue");
    }

    const cleanup = await teardownDisposableTarget(controlPool, disposable);
    tornDown = cleanup.absent;
    console.log(canonicalJson({
      schema_version: "dgkma-task21-disposable-security-v1",
      run_uid: runUid,
      baseline_closed: true,
      role_membership_digest_unchanged: true,
      public_routine_grant_detected: true,
      observed_error: observedError,
      transaction_terminal: "ROLLBACK",
      catalog_restored: true,
      cleanup,
      production_operations: 0,
      result: "approved",
    } as unknown as CanonicalValue));
  } finally {
    if (disposable && !tornDown) await teardownDisposableTarget(controlPool, disposable).catch(() => undefined);
    await shutdownPool(controlPool);
  }
}

main().catch((error) => {
  console.error(canonicalJson({
    schema_version: "dgkma-task21-disposable-security-error-v1",
    error_code: error instanceof Error ? error.message : "unknown",
    result: "rejected",
  }));
  process.exitCode = 1;
});
