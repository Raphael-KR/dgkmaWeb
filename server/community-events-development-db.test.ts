import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import type {
  CommunityEventDraftInput,
  CommunityEventPublishInput,
} from "@shared/community-events";

const isProduction =
  process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";
const hasDatabaseEnvironment = Boolean(
  (process.env.PGHOST && process.env.PGUSER && process.env.PGDATABASE)
    || process.env.DATABASE_URL,
);

test("development PostgreSQL preserves event draft ownership, reuse, and publish idempotency", {
  skip: isProduction
    ? "운영 환경에서는 경조사 Development DB 회귀 테스트를 실행하지 않습니다."
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
  const emails = [
    `event-task3-${token}-owner@example.invalid`,
    `event-task3-${token}-other@example.invalid`,
  ];
  const draft: CommunityEventDraftInput = {
    eventType: "wedding",
    title: "최초 경조사 초안",
    eventDate: "2026-08-10",
    relatedMemberName: "테스트 동문",
    sourceText: "일회용 Development DB fixture",
    sourceUrls: [],
    details: { memo: "최초 저장" },
  };
  const publishData: CommunityEventPublishInput = {
    ...draft,
    title: "게시할 경조사",
    details: { memo: "게시 내용" },
  };
  let userIds: number[] = [];

  try {
    const usersResult = await pool.query<{ id: number }>(
      `insert into users (email, name, is_verified, activity_region)
       values ($1, $3, true, '서울특별시'), ($2, $3, true, '서울특별시')
       returning id`,
      [emails[0], emails[1], "경조사 통합 테스트"],
    );
    userIds = usersResult.rows.map(({ id }) => id);
    assert.equal(userIds.length, 2);
    const [ownerId, otherId] = userIds;

    const first = await storage.createEventDraft(ownerId, draft);
    const reused = await storage.createEventDraft(ownerId, {
      ...draft,
      title: "재사용된 경조사 초안",
      details: { memo: "재저장" },
    });
    assert.equal(reused.id, first.id);
    assert.equal(reused.title, "재사용된 경조사 초안");
    assert.equal((reused.details as { memo?: string }).memo, "재저장");

    assert.equal(await storage.getEventDraft(first.id, otherId), undefined);
    assert.equal(await storage.publishEvent(first.id, otherId, publishData), undefined);

    const published = await storage.publishEvent(first.id, ownerId, publishData);
    assert.ok(published);
    assert.equal(published.status, "published");
    assert.equal(await storage.getEventDraft(first.id, ownerId), undefined);

    const retry = await storage.publishEvent(first.id, ownerId, publishData);
    assert.ok(retry);
    assert.equal(retry.id, published.id);
    assert.equal(retry.publishedAt?.getTime(), published.publishedAt?.getTime());
  } finally {
    try {
      await pool.query("begin");
      await pool.query(
        "delete from community_events where author_id = any($1::int[])",
        [userIds],
      );
      await pool.query("delete from users where email = any($1::text[])", [emails]);
      await pool.query("commit");
    } catch (error) {
      await pool.query("rollback");
      throw error;
    }

    const residue = await pool.query<{ users_count: number; events_count: number }>(
      `select
         (select count(*)::int from users where email = any($1::text[])) as users_count,
         (select count(*)::int from community_events where author_id = any($2::int[])) as events_count`,
      [emails, userIds],
    );
    assert.deepEqual(residue.rows[0], { users_count: 0, events_count: 0 });
    await pool.end();
  }
});
