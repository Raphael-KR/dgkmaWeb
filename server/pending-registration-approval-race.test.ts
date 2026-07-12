import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const isProduction =
  process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const hasDatabaseEnvironment = Boolean(
  (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
    || process.env.DATABASE_URL,
);

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

test("development PostgreSQL returns the approved member when approval wins a pending refresh race", {
  skip: isProduction
    ? "운영 환경에서는 pending 승인 경쟁 회귀 테스트를 실행하지 않습니다."
    : !hasDatabaseEnvironment
      ? "PostgreSQL 개발 DB 환경변수가 없어 건너뜁니다."
      : false,
}, async () => {
  const { pool } = await import("./db");
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

    refreshPromise = storage.createOrRefreshPendingRegistration({
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
    });
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

    try {
      await pool.query("begin");
      await pool.query("delete from alumni_database where mobile = $1", [domesticPhone]);
      await pool.query(
        "delete from pending_registrations where kakao_id = $1 or email = $2",
        [kakaoId, email],
      );
      await pool.query("delete from users where kakao_id = $1 or email = $2", [kakaoId, email]);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }

    const residue = await pool.query<{
      users_count: number;
      alumni_count: number;
      pending_count: number;
    }>(
      `select
         (select count(*)::int from users where kakao_id = $1 or email = $2) as users_count,
         (select count(*)::int from alumni_database where mobile = $3) as alumni_count,
         (select count(*)::int from pending_registrations
           where kakao_id = $1 or email = $2) as pending_count`,
      [kakaoId, email, domesticPhone],
    );
    assert.deepEqual(residue.rows[0], {
      users_count: 0,
      alumni_count: 0,
      pending_count: 0,
    });
    await pool.end();
  }
});
