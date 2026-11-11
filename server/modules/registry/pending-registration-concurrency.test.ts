import { developmentDbSkip, getDevelopmentDbPool } from "../../tests/development-db-target";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

test(
  "development PostgreSQL keeps one pending row across concurrent login retries",
  {
    skip: developmentDbSkip,
  },
  async (t) => {
    const pool = await getDevelopmentDbPool();
    const { storage } = await import("../../storage");

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

    t.after(async () => {
      try {
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
      } finally {
        await pool.end();
      }
    });

    await Promise.all(
      Array.from({ length: 12 }, (_, index) => {
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
      }),
    );

    const rows = await pool.query<{ count: number; status: string }>(
      `select count(*)::int as count, min(status) as status
       from pending_registrations
      where kakao_id = any($1::text[]) or email = $2`,
      [[kakaoId, `${kakaoId}-alternate`], email],
    );
    assert.deepEqual(rows.rows[0], { count: 1, status: "pending" });
  },
);
