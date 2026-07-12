import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const storageSource = readFileSync(
  new URL("./storage.ts", import.meta.url),
  "utf8",
);

const isProduction =
  process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const hasDatabaseEnvironment = Boolean(
  (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
    || process.env.DATABASE_URL,
);

test("deleteUserAccount processes every approved relation in one transaction", () => {
  assert.match(storageSource, /deleteUserAccount\(user: Pick<User, "id" \| "kakaoId" \| "email">\): Promise<void>/);

  const method = storageSource.slice(storageSource.indexOf("async deleteUserAccount"));
  assert.match(method, /db\.transaction/);
  for (const table of [
    "alumniDatabase",
    "communityEvents",
    "posts",
    "comments",
    "payments",
    "pendingRegistrations",
    "obituaries",
    "users",
  ]) {
    assert.match(method, new RegExp(table));
  }
  assert.match(method, /isMatched:\s*false/);
  assert.match(method, /matchedUserId:\s*null/);

  const orderedOperations = [
    "tx.delete(communityEvents)",
    "tx.update(communityEvents)",
    "tx.update(posts)",
    "tx.update(comments)",
    "tx.update(obituaries)",
    "tx.update(payments)",
    "tx.update(alumniDatabase)",
    "tx.delete(pendingRegistrations)",
    'delete from "session"',
    "tx.delete(users)",
  ];
  let previousIndex = -1;
  for (const operation of orderedOperations) {
    const operationIndex = method.indexOf(operation);
    assert.ok(operationIndex > previousIndex, `${operation} 처리 순서가 올바르지 않습니다.`);
    previousIndex = operationIndex;
  }

  assert.match(method, /eq\(communityEvents\.status, "draft"\)/);
  assert.match(method, /sql`[\s\S]*delete from "session"[\s\S]*sess\s*->>\s*'userId'\s*=\s*\$\{String\(user\.id\)\}[\s\S]*`/);
  assert.doesNotMatch(method, /delete from "session"[^`]*\+[^`]*user\.id/);
});

test("development PostgreSQL deletes one member while preserving public content", {
  skip: isProduction
    ? "운영 환경에서는 회원 삭제 통합 테스트를 실행하지 않습니다."
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

  const { storage } = await import("./storage");
  const token = randomUUID().replaceAll("-", "");
  const email = `task4-${token}@example.invalid`;
  const mixedCaseEmail = email.toUpperCase();
  const kakaoId = `task4-${token}`;
  const otherEmail = `task4-other-${token}@example.invalid`;
  const otherKakaoId = `task4-other-${token}`;
  const marker = `TASK4-${token}`;
  const targetSessionIds = [`task4-${token}-session-a`, `task4-${token}-session-b`];
  const otherSessionId = `task4-${token}-session-other`;
  let userId: number | undefined;
  let otherUserId: number | undefined;

  try {
    const usersResult = await pool.query<{ id: number }>(
      `insert into users (kakao_id, email, name, phone_number)
       values ($1, $2, $3, $4), ($5, $6, $7, $8)
       returning id`,
      [
        kakaoId,
        email,
        marker,
        `010-${token.slice(0, 4)}-${token.slice(4, 8)}`,
        otherKakaoId,
        otherEmail,
        `${marker}-other`,
        `011-${token.slice(8, 12)}-${token.slice(12, 16)}`,
      ],
    );
    userId = usersResult.rows[0].id;
    otherUserId = usersResult.rows[1].id;

    await pool.query(
      `insert into posts (title, content, author_id) values ($1, $1, $2)`,
      [marker, userId],
    );
    const postResult = await pool.query<{ id: number }>(
      "select id from posts where title = $1",
      [marker],
    );
    await pool.query(
      `insert into comments (post_id, author_id, content) values ($1, $2, $3)`,
      [postResult.rows[0].id, userId, marker],
    );
    await pool.query(
      `insert into payments (user_id, amount, year, type, status)
       values ($1, 10000, 2099, $2, 'completed')`,
      [userId, marker],
    );
    await pool.query(
      `insert into alumni_database
        (department, generation, name, mobile, is_matched, matched_user_id)
       values ('한의학과', $1, $1, $2, true, $3)`,
      [marker, `010-${token.slice(16, 20)}-${token.slice(20, 24)}`, userId],
    );
    await pool.query(
      `insert into obituaries
        (title, deceased_name, deceased_relation, date_of_death, author_id)
       values ($1, $1, $1, '2099-01-01', $2)`,
      [marker, userId],
    );
    await pool.query(
      `insert into community_events (event_type, status, title, details, author_id)
       values
         ('obituary', 'draft', $1, '{}'::jsonb, $2),
         ('obituary', 'published', $3, '{}'::jsonb, $2)`,
      [`${marker}-draft`, userId, `${marker}-published`],
    );
    await pool.query(
      `insert into pending_registrations (kakao_id, email, name, status)
       values
         ($1, $2, $3, 'pending'),
         ($4, $5, $3, 'pending')`,
      [kakaoId, otherEmail, marker, otherKakaoId, mixedCaseEmail],
    );
    await pool.query(
      `insert into "session" (sid, sess, expire)
       values
         ($1, $2::json, now() + interval '1 day'),
         ($3, $4::json, now() + interval '1 day'),
         ($5, $6::json, now() + interval '1 day')`,
      [
        targetSessionIds[0],
        JSON.stringify({ userId, cookie: {} }),
        targetSessionIds[1],
        JSON.stringify({ userId, cookie: {}, device: "second" }),
        otherSessionId,
        JSON.stringify({ userId: otherUserId, cookie: {} }),
      ],
    );

    await storage.deleteUserAccount({ id: userId, kakaoId, email });

    const state = await pool.query<{
      users_count: number;
      draft_count: number;
      published_anonymous_count: number;
      post_anonymous_count: number;
      comment_anonymous_count: number;
      obituary_anonymous_count: number;
      payment_anonymous_count: number;
      alumni_unmatched_count: number;
      pending_count: number;
      target_session_count: number;
      other_session_count: number;
    }>(
      `select
         (select count(*)::int from users where id = $1) as users_count,
         (select count(*)::int from community_events where title = $2) as draft_count,
         (select count(*)::int from community_events where title = $3 and author_id is null) as published_anonymous_count,
         (select count(*)::int from posts where title = $4 and author_id is null) as post_anonymous_count,
         (select count(*)::int from comments where content = $4 and author_id is null) as comment_anonymous_count,
         (select count(*)::int from obituaries where title = $4 and author_id is null) as obituary_anonymous_count,
         (select count(*)::int from payments where type = $4 and user_id is null) as payment_anonymous_count,
         (select count(*)::int from alumni_database where generation = $4 and is_matched = false and matched_user_id is null) as alumni_unmatched_count,
         (select count(*)::int from pending_registrations where kakao_id = $5 or lower(email) = lower($6)) as pending_count,
         (select count(*)::int from "session" where sid = any($7::text[])) as target_session_count,
         (select count(*)::int from "session" where sid = $8) as other_session_count`,
      [
        userId,
        `${marker}-draft`,
        `${marker}-published`,
        marker,
        kakaoId,
        email,
        targetSessionIds,
        otherSessionId,
      ],
    );
    assert.deepEqual(state.rows[0], {
      users_count: 0,
      draft_count: 0,
      published_anonymous_count: 1,
      post_anonymous_count: 1,
      comment_anonymous_count: 1,
      obituary_anonymous_count: 1,
      payment_anonymous_count: 1,
      alumni_unmatched_count: 1,
      pending_count: 0,
      target_session_count: 0,
      other_session_count: 1,
    });
  } finally {
    try {
      await pool.query("begin");
      await pool.query("delete from \"session\" where sid = any($1::text[])", [
        [...targetSessionIds, otherSessionId],
      ]);
      await pool.query("delete from comments where content = $1", [marker]);
      await pool.query("delete from posts where title = $1", [marker]);
      await pool.query("delete from community_events where title = any($1::text[])", [
        [`${marker}-draft`, `${marker}-published`],
      ]);
      await pool.query("delete from obituaries where title = $1", [marker]);
      await pool.query("delete from payments where type = $1", [marker]);
      await pool.query("delete from alumni_database where generation = $1", [marker]);
      await pool.query("delete from pending_registrations where name = $1", [marker]);
      await pool.query("delete from users where email = any($1::text[])", [[email, otherEmail]]);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }

    const residue = await pool.query<{
      users_count: number;
      posts_count: number;
      comments_count: number;
      payments_count: number;
      alumni_count: number;
      obituaries_count: number;
      events_count: number;
      pending_count: number;
      sessions_count: number;
    }>(
      `select
         (select count(*)::int from users where email = any($1::text[])) as users_count,
         (select count(*)::int from posts where title = $2) as posts_count,
         (select count(*)::int from comments where content = $2) as comments_count,
         (select count(*)::int from payments where type = $2) as payments_count,
         (select count(*)::int from alumni_database where generation = $2) as alumni_count,
         (select count(*)::int from obituaries where title = $2) as obituaries_count,
         (select count(*)::int from community_events where title = any($3::text[])) as events_count,
         (select count(*)::int from pending_registrations where name = $2) as pending_count,
         (select count(*)::int from "session" where sid = any($4::text[])) as sessions_count`,
      [
        [email, otherEmail],
        marker,
        [`${marker}-draft`, `${marker}-published`],
        [...targetSessionIds, otherSessionId],
      ],
    );
    assert.deepEqual(residue.rows[0], {
      users_count: 0,
      posts_count: 0,
      comments_count: 0,
      payments_count: 0,
      alumni_count: 0,
      obituaries_count: 0,
      events_count: 0,
      pending_count: 0,
      sessions_count: 0,
    });
    await pool.end();
  }
});
