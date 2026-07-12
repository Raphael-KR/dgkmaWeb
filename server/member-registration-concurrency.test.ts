import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const isProduction =
  process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const hasDatabaseEnvironment = Boolean(
  (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
    || process.env.DATABASE_URL,
);

test("development PostgreSQL serializes concurrent member creation by normalized phone", {
  skip: isProduction
    ? "운영 환경에서는 동시성 회귀 테스트를 실행하지 않습니다."
    : !hasDatabaseEnvironment
      ? "PostgreSQL 개발 DB 환경변수가 없어 건너뜁니다."
      : false,
}, async () => {
  const { pool } = await import("./db");
  const databaseResult = await pool.query<{ database: string }>(
    "select current_database() as database",
  );
  assert.equal(
    databaseResult.rows[0]?.database,
    "heliumdb",
    "Development Database(heliumdb)가 아니므로 테스트를 거부합니다.",
  );

  const { PhoneRegistrationConflictError, storage } = await import("./storage");
  const token = randomUUID().replaceAll("-", "");
  const phoneDigits = String(BigInt(`0x${token.slice(0, 12)}`) % 100000000n).padStart(8, "0");
  const domesticPhone = `010-${phoneDigits.slice(0, 4)}-${phoneDigits.slice(4)}`;
  const kakaoPhone = `+82 10-${phoneDigits.slice(0, 4)}-${phoneDigits.slice(4)}`;
  const name = `동시성테스트${token.slice(0, 8)}`;
  const emails = [
    `task2-${token}-a@example.invalid`,
    `task2-${token}-b@example.invalid`,
  ];
  const kakaoIds = [`task2-${token}-a`, `task2-${token}-b`];

  try {
    await pool.query(
      `insert into alumni_database
        (department, generation, name, mobile, is_matched, matched_user_id)
       values ($1, $2, $3, $4, false, null)`,
      ["한의학과", "TASK2", name, domesticPhone],
    );
    const pendingResult = await pool.query<{ id: number }>(
      `insert into pending_registrations (kakao_id, email, name, user_data, status)
       values
         ($1, $2, $3, $4::jsonb, 'pending'),
         ($5, $6, $3, $7::jsonb, 'pending')
       returning id`,
      [
        kakaoIds[0],
        emails[0],
        name,
        JSON.stringify({ phoneNumber: kakaoPhone }),
        kakaoIds[1],
        emails[1],
        JSON.stringify({ phoneNumber: kakaoPhone }),
      ],
    );

    const results = await Promise.allSettled(emails.map((email, index) =>
      storage.createUserWithAlumniClaim({
        kakaoId: kakaoIds[index],
        email,
        name,
        phoneNumber: kakaoPhone,
        isVerified: true,
      }, name, kakaoPhone),
    ));
    const successes = results.filter((result) => result.status === "fulfilled");
    const failures = results.filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );

    assert.equal(successes.length, 1);
    assert.ok(successes[0].value, "성공 트랜잭션은 생성된 사용자를 반환해야 합니다.");
    assert.equal(failures.length, 1);
    assert.ok(failures[0].reason instanceof PhoneRegistrationConflictError);

    const userCount = await pool.query<{ count: number }>(
      "select count(*)::int as count from users where email = any($1::text[])",
      [emails],
    );
    assert.equal(userCount.rows[0]?.count, 1);

    await assert.rejects(
      storage.updatePendingRegistrationStatus(pendingResult.rows[0].id, "approved"),
      PhoneRegistrationConflictError,
    );
    const pendingStatus = await pool.query<{ status: string }>(
      "select status from pending_registrations where id = $1",
      [pendingResult.rows[0].id],
    );
    assert.equal(pendingStatus.rows[0]?.status, "pending");
  } finally {
    try {
      await pool.query("begin");
      await pool.query("delete from alumni_database where mobile = $1", [domesticPhone]);
      await pool.query("delete from pending_registrations where email = any($1::text[])", [emails]);
      await pool.query("delete from users where email = any($1::text[])", [emails]);
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
         (select count(*)::int from users where email = any($1::text[])) as users_count,
         (select count(*)::int from alumni_database where mobile = $2) as alumni_count,
         (select count(*)::int from pending_registrations where email = any($1::text[])) as pending_count`,
      [emails, domesticPhone],
    );
    assert.deepEqual(residue.rows[0], {
      users_count: 0,
      alumni_count: 0,
      pending_count: 0,
    });
    await pool.end();
  }
});
