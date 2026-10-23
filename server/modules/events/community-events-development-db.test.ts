import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { developmentDbConfig, developmentDbSkip, verifyDevelopmentDb } from "../../tests/development-db-target";
import type {
  CommunityEventDraftInput,
  CommunityEventPublishInput,
} from "@shared/community-events";

test("development PostgreSQL preserves event draft ownership, reuse, and publish idempotency", {
  skip: developmentDbSkip,
}, async (t) => {
  const token = randomUUID().replaceAll("-", "");
  const emails = [
    `event-task3-${token}-owner@example.invalid`,
    `event-task3-${token}-other@example.invalid`,
  ];
  const sourceMarker = `event-task3-${token}`;
  const draft = {
    eventType: "wedding",
    title: "최초 경조사 초안",
    eventDate: "2026-08-10",
    relatedMemberName: "테스트 동문",
    sourceText: sourceMarker,
    sourceUrls: [],
    details: { memo: "최초 저장" },
  } satisfies CommunityEventDraftInput;
  const publishData: CommunityEventPublishInput = {
    ...draft,
    title: "게시할 경조사",
    details: { memo: "게시 내용" },
  };
  const testPool = new Pool({
    ...developmentDbConfig(),
    max: 1,
  });
  let targetVerified = false;
  let userIds: number[] = [];
  let runtimePool: Pool | undefined;

  try {
    await verifyDevelopmentDb(testPool);
    targetVerified = true;

    runtimePool = (await import("../../db")).pool;
    await verifyDevelopmentDb(runtimePool);
    const { storage } = await import("../../storage");
    const usersResult = await testPool.query<{ id: number }>(
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
      if (targetVerified) {
        const client = await testPool.connect();
        try {
          await client.query("BEGIN");
          try {
            await client.query(
              `delete from community_events
                where source_text = $1
                   or author_id in (
                     select id from users where email = any($2::text[])
                   )`,
              [sourceMarker, emails],
            );
            await client.query("delete from users where email = any($1::text[])", [emails]);
            await client.query("COMMIT");
          } catch (error) {
            await client.query("ROLLBACK");
            throw error;
          }
        } finally {
          client.release();
        }

        const residue = await testPool.query<{ users_count: number; events_count: number }>(
          `select
             (select count(*)::int from users where email = any($1::text[])) as users_count,
             (select count(*)::int from community_events where source_text = $2) as events_count`,
          [emails, sourceMarker],
        );
        assert.deepEqual(residue.rows[0], { users_count: 0, events_count: 0 });
        t.diagnostic("fixture residue: users=0 events=0");
      }
    } finally {
      await testPool.end();
      await runtimePool?.end();
    }
  }
});
