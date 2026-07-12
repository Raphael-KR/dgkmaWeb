import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const isProduction =
  process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const hasDatabaseEnvironment = Boolean(
  (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
    || process.env.DATABASE_URL,
);

test("development PostgreSQL keeps one pending row across concurrent login retries", {
  skip: isProduction
    ? "운영 환경에서는 pending 동시성 회귀 테스트를 실행하지 않습니다."
    : !hasDatabaseEnvironment
      ? "PostgreSQL 개발 DB 환경변수가 없어 건너뜁니다."
      : false,
}, async () => {
  const { pool } = await import("./db");
  const { storage } = await import("./storage");
  const databaseResult = await pool.query<{ database: string }>(
    "select current_database() as database",
  );
  assert.equal(
    databaseResult.rows[0]?.database,
    "heliumdb",
    "Development Database(heliumdb)가 아니므로 테스트를 거부합니다.",
  );

  const token = randomUUID().replaceAll("-", "");
  const kakaoId = `pending-${token}`;
  const email = `pending-${token}@example.invalid`;
  const reasons = [
    "email_conflict",
    "phone_conflict",
    "alumni_claimed",
    "alumni_race",
    "not_found",
  ] as const;

  try {
    await Promise.all(Array.from({ length: 12 }, (_, index) => {
      const attemptKakaoId = index % 2 === 0 ? kakaoId : `${kakaoId}-alternate`;
      return storage.createOrRefreshPendingRegistration(
        {
          kakaoId: attemptKakaoId,
          email,
          name: "pending concurrency test",
          userData: {
            kakaoId: attemptKakaoId,
            email,
            name: "pending concurrency test",
            phoneNumber: "+82 10-0000-0000",
            profileImage: null,
            birthday: null,
            birthdayType: null,
            isLeapMonth: null,
            conflictReason: reasons[index % reasons.length],
          },
        },
        new Date(),
      );
    }));

    const rows = await pool.query<{ count: number; status: string }>(
      `select count(*)::int as count, min(status) as status
         from pending_registrations
        where kakao_id = any($1::text[]) or email = $2`,
      [[kakaoId, `${kakaoId}-alternate`], email],
    );
    assert.deepEqual(rows.rows[0], { count: 1, status: "pending" });
  } finally {
    try {
      await pool.query("begin");
      await pool.query(
        "delete from pending_registrations where kakao_id = any($1::text[]) or email = $2",
        [[kakaoId, `${kakaoId}-alternate`], email],
      );
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }

    const residue = await pool.query<{ count: number }>(
      `select count(*)::int as count
         from pending_registrations
        where kakao_id = any($1::text[]) or email = $2`,
      [[kakaoId, `${kakaoId}-alternate`], email],
    );
    assert.equal(residue.rows[0]?.count, 0);
    await pool.end();
  }
});
