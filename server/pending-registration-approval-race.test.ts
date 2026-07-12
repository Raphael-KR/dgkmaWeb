import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test, { after } from "node:test";
import type { Pool } from "pg";

const isProduction =
  process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const hasDatabaseEnvironment = Boolean(
  (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
    || process.env.DATABASE_URL,
);

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

let developmentPool: Pool | undefined;

after(async () => {
  await developmentPool?.end();
});

async function cleanupRegistrationRace(
  pool: Pool,
  identities: { kakaoIds: string[]; emails: string[]; mobiles: string[] },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      "delete from alumni_database where mobile = any($1::text[])",
      [identities.mobiles],
    );
    await client.query(
      `delete from pending_registrations
        where kakao_id = any($1::text[]) or lower(email) = any($2::text[])`,
      [identities.kakaoIds, identities.emails.map((email) => email.toLowerCase())],
    );
    await client.query(
      `delete from users
        where kakao_id = any($1::text[]) or lower(email) = any($2::text[])`,
      [identities.kakaoIds, identities.emails.map((email) => email.toLowerCase())],
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  const residue = await pool.query<{
    users_count: number;
    alumni_count: number;
    pending_count: number;
  }>(
    `select
       (select count(*)::int from users
         where kakao_id = any($1::text[]) or lower(email) = any($2::text[])) as users_count,
       (select count(*)::int from alumni_database
         where mobile = any($3::text[])) as alumni_count,
       (select count(*)::int from pending_registrations
         where kakao_id = any($1::text[]) or lower(email) = any($2::text[])) as pending_count`,
    [
      identities.kakaoIds,
      identities.emails.map((email) => email.toLowerCase()),
      identities.mobiles,
    ],
  );
  assert.deepEqual(residue.rows[0], {
    users_count: 0,
    alumni_count: 0,
    pending_count: 0,
  });
}

test("development PostgreSQL returns the approved member when approval wins a pending refresh race", {
  skip: isProduction
    ? "운영 환경에서는 pending 승인 경쟁 회귀 테스트를 실행하지 않습니다."
    : !hasDatabaseEnvironment
      ? "PostgreSQL 개발 DB 환경변수가 없어 건너뜁니다."
      : false,
}, async () => {
  const { pool } = await import("./db");
  developmentPool = pool;
  const { normalizePhoneForComparison, storage } = await import("./storage");
  const databaseResult = await pool.query<{ database: string }>(
    "select current_database() as database",
  );
  assert.equal(
    databaseResult.rows[0]?.database,
    "heliumdb",
    "Development Database(heliumdb)가 아니므로 테스트를 거부합니다.",
  );

  const token = randomUUID().replaceAll("-", "");
  const phoneDigits = String(BigInt(`0x${token.slice(0, 12)}`) % 100000000n).padStart(8, "0");
  const domesticPhone = `010-${phoneDigits.slice(0, 4)}-${phoneDigits.slice(4)}`;
  const kakaoPhone = `+82 10-${phoneDigits.slice(0, 4)}-${phoneDigits.slice(4)}`;
  const kakaoId = `approval-race-${token}`;
  const email = `approval-race-${token}@example.invalid`;
  const name = `승인경쟁${token.slice(0, 8)}`;
  const blocker = await pool.connect();
  let blockerTransactionOpen = false;
  let approvalPromise: ReturnType<typeof storage.updatePendingRegistrationStatus> | undefined;
  let refreshPromise: ReturnType<typeof storage.createOrRefreshPendingRegistration> | undefined;

  try {
    await pool.query(
      `insert into alumni_database
        (department, generation, name, mobile, is_matched, matched_user_id)
       values ($1, $2, $3, $4, false, null)`,
      ["한의학과", "RACE", name, domesticPhone],
    );
    const pendingResult = await pool.query<{ id: number }>(
      `insert into pending_registrations (kakao_id, email, name, user_data, status)
       values ($1, $2, $3, $4::jsonb, 'pending')
       returning id`,
      [
        kakaoId,
        email,
        name,
        JSON.stringify({
          kakaoId,
          email,
          name,
          phoneNumber: kakaoPhone,
          profileImage: null,
          birthday: null,
          birthdayType: null,
          isLeapMonth: null,
          conflictReason: "not_found",
        }),
      ],
    );

    await blocker.query("begin");
    blockerTransactionOpen = true;
    await blocker.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [normalizePhoneForComparison(kakaoPhone)],
    );
    const blockerPid = await blocker.query<{ pid: number }>("select pg_backend_pid() as pid");

    approvalPromise = storage.updatePendingRegistrationStatus(
      pendingResult.rows[0].id,
      "approved",
    );

    let approvalBlocked = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const blocked = await pool.query<{ count: number }>(
        `select count(*)::int as count
           from pg_stat_activity
          where $1 = any(pg_blocking_pids(pid))`,
        [blockerPid.rows[0].pid],
      );
      if ((blocked.rows[0]?.count ?? 0) > 0) {
        approvalBlocked = true;
        break;
      }
      await wait(10);
    }
    assert.equal(approvalBlocked, true, "승인 트랜잭션이 phone lock에서 대기하지 않았습니다.");

    refreshPromise = storage.createOrRefreshPendingRegistration(
      {
        kakaoId,
        email,
        name,
        userData: {
          kakaoId,
          email,
          name,
          phoneNumber: kakaoPhone,
          profileImage: null,
          birthday: null,
          birthdayType: null,
          isLeapMonth: null,
          conflictReason: "not_found",
        },
      },
      new Date(),
    );
    await wait(25);

    await blocker.query("commit");
    blockerTransactionOpen = false;

    const [approvedRegistration, refreshResult] = await Promise.all([
      approvalPromise,
      refreshPromise,
    ]);
    assert.equal(approvedRegistration?.status, "approved");
    assert.equal(refreshResult.kind, "registered");

    const finalState = await pool.query<{
      user_count: number;
      pending_count: number;
      user_id: number | null;
    }>(
      `select
         (select count(*)::int from users where kakao_id = $1) as user_count,
         (select count(*)::int from pending_registrations
           where kakao_id = $1 and status = 'pending') as pending_count,
         (select min(id)::int from users where kakao_id = $1) as user_id`,
      [kakaoId],
    );
    assert.deepEqual(finalState.rows[0], {
      user_count: 1,
      pending_count: 0,
      user_id: refreshResult.user.id,
    });
    assert.equal(refreshResult.user.kakaoId, kakaoId);
  } finally {
    if (blockerTransactionOpen) {
      await blocker.query("rollback");
    }
    blocker.release();
    await Promise.allSettled([approvalPromise, refreshPromise].filter(Boolean));

    await cleanupRegistrationRace(pool, {
      kakaoIds: [kakaoId],
      emails: [email],
      mobiles: [domesticPhone],
    });
  }
});

test("development PostgreSQL keeps a different Kakao ID with an approved email in email_conflict review", {
  skip: isProduction
    ? "운영 환경에서는 pending 이메일 경쟁 회귀 테스트를 실행하지 않습니다."
    : !hasDatabaseEnvironment
      ? "PostgreSQL 개발 DB 환경변수가 없어 건너뜁니다."
      : false,
}, async () => {
  const { pool } = await import("./db");
  const { normalizePhoneForComparison, storage } = await import("./storage");
  developmentPool = pool;
  const databaseResult = await pool.query<{ database: string }>(
    "select current_database() as database",
  );
  assert.equal(
    databaseResult.rows[0]?.database,
    "heliumdb",
    "Development Database(heliumdb)가 아니므로 테스트를 거부합니다.",
  );

  const token = randomUUID().replaceAll("-", "");
  const firstDigits = String(BigInt(`0x${token.slice(0, 12)}`) % 100000000n).padStart(8, "0");
  const secondDigits = String(BigInt(`0x${token.slice(12, 24)}`) % 100000000n).padStart(8, "0");
  const firstDomesticPhone = `010-${firstDigits.slice(0, 4)}-${firstDigits.slice(4)}`;
  const secondDomesticPhone = `011-${secondDigits.slice(0, 4)}-${secondDigits.slice(4)}`;
  const firstKakaoPhone = `+82 10-${firstDigits.slice(0, 4)}-${firstDigits.slice(4)}`;
  const secondKakaoPhone = `+82 11-${secondDigits.slice(0, 4)}-${secondDigits.slice(4)}`;
  const approvedKakaoId = `email-race-approved-${token}`;
  const competingKakaoId = `email-race-competing-${token}`;
  const sharedEmail = `email-race-${token}@example.invalid`;
  const approvedName = `이메일승인${token.slice(0, 6)}`;
  const competingName = `이메일경쟁${token.slice(6, 12)}`;
  const blocker = await pool.connect();
  let blockerTransactionOpen = false;
  let approvalPromise: ReturnType<typeof storage.updatePendingRegistrationStatus> | undefined;
  let competingCreationPromise: ReturnType<typeof storage.createUserWithAlumniClaim> | undefined;

  try {
    await pool.query(
      `insert into alumni_database
        (department, generation, name, mobile, is_matched, matched_user_id)
       values
        ($1, $2, $3, $4, false, null),
        ($1, $2, $5, $6, false, null)`,
      [
        "한의학과",
        "EMAIL-RACE",
        approvedName,
        firstDomesticPhone,
        competingName,
        secondDomesticPhone,
      ],
    );
    const pendingResult = await pool.query<{ id: number }>(
      `insert into pending_registrations (kakao_id, email, name, user_data, status)
       values ($1, $2, $3, $4::jsonb, 'pending')
       returning id`,
      [
        approvedKakaoId,
        sharedEmail,
        approvedName,
        JSON.stringify({
          kakaoId: approvedKakaoId,
          email: sharedEmail,
          name: approvedName,
          phoneNumber: firstKakaoPhone,
          profileImage: null,
          birthday: null,
          birthdayType: null,
          isLeapMonth: null,
          conflictReason: "not_found",
        }),
      ],
    );

    await blocker.query("begin");
    blockerTransactionOpen = true;
    await blocker.query(
      "select pg_advisory_xact_lock(hashtextextended($1, 0))",
      [normalizePhoneForComparison(firstKakaoPhone)],
    );
    const blockerPid = await blocker.query<{ pid: number }>("select pg_backend_pid() as pid");

    approvalPromise = storage.updatePendingRegistrationStatus(
      pendingResult.rows[0].id,
      "approved",
    );

    let approvalBlocked = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const blocked = await pool.query<{ count: number }>(
        `select count(*)::int as count
           from pg_stat_activity
          where $1 = any(pg_blocking_pids(pid))`,
        [blockerPid.rows[0].pid],
      );
      if ((blocked.rows[0]?.count ?? 0) > 0) {
        approvalBlocked = true;
        break;
      }
      await wait(10);
    }
    assert.equal(approvalBlocked, true, "승인 트랜잭션이 phone lock에서 대기하지 않았습니다.");

    competingCreationPromise = storage.createUserWithAlumniClaim(
      {
        kakaoId: competingKakaoId,
        email: sharedEmail,
        name: competingName,
        profileImage: null,
        phoneNumber: secondKakaoPhone,
        birthday: null,
        birthdayType: null,
        isLeapMonth: null,
        isVerified: true,
        kakaoSyncEnabled: true,
      },
      competingName,
      secondKakaoPhone,
    );
    await wait(25);

    await blocker.query("commit");
    blockerTransactionOpen = false;

    const approvedRegistration = await approvalPromise;
    const competingCreation = await competingCreationPromise.then(
      (user) => ({ user, error: undefined }),
      (error: unknown) => ({ user: undefined, error }),
    );
    const refreshResult = await storage.createOrRefreshPendingRegistration(
      {
        kakaoId: competingKakaoId,
        email: sharedEmail,
        name: competingName,
        userData: {
          kakaoId: competingKakaoId,
          email: sharedEmail,
          name: competingName,
          phoneNumber: secondKakaoPhone,
          profileImage: null,
          birthday: null,
          birthdayType: null,
          isLeapMonth: null,
          conflictReason: "alumni_race",
        },
      },
      new Date(),
    );

    assert.equal(approvedRegistration?.status, "approved");
    assert.equal(competingCreation.user, undefined);
    assert.equal(
      competingCreation.error instanceof Error ? competingCreation.error.name : undefined,
      "PendingRegistrationConflictError",
    );
    assert.equal(refreshResult.kind, "pending");
    if (refreshResult.kind !== "pending") return;
    assert.equal(refreshResult.registration.userData?.conflictReason, "email_conflict");

    const finalState = await pool.query<{
      approved_user_count: number;
      competing_user_count: number;
      competing_pending_count: number;
      competing_alumni_matched: boolean | null;
    }>(
      `select
         (select count(*)::int from users where kakao_id = $1) as approved_user_count,
         (select count(*)::int from users where kakao_id = $2) as competing_user_count,
         (select count(*)::int from pending_registrations
           where kakao_id = $2 and status = 'pending'
             and user_data->>'conflictReason' = 'email_conflict') as competing_pending_count,
         (select is_matched from alumni_database where mobile = $3) as competing_alumni_matched`,
      [approvedKakaoId, competingKakaoId, secondDomesticPhone],
    );
    assert.deepEqual(finalState.rows[0], {
      approved_user_count: 1,
      competing_user_count: 0,
      competing_pending_count: 1,
      competing_alumni_matched: false,
    });
  } finally {
    if (blockerTransactionOpen) {
      await blocker.query("rollback");
    }
    blocker.release();
    await Promise.allSettled(
      [approvalPromise, competingCreationPromise].filter(Boolean),
    );

    await cleanupRegistrationRace(pool, {
      kakaoIds: [approvedKakaoId, competingKakaoId],
      emails: [sharedEmail],
      mobiles: [firstDomesticPhone, secondDomesticPhone],
    });
  }
});
