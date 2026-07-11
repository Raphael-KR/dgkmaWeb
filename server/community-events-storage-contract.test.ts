import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("community event schema contains migration and ownership fields", async () => {
  const schema = await readFile(new URL("../shared/schema.ts", import.meta.url), "utf8");
  assert.match(schema, /pgTable\("community_events"/);
  assert.match(schema, /legacyObituaryId: integer\("legacy_obituary_id"\)\.unique\(\)/);
  assert.match(schema, /eventType: text\("event_type"\)\.notNull\(\)/);
  assert.match(schema, /status: text\("status"\)\.notNull\(\)\.default\("draft"\)/);
  assert.match(schema, /details: jsonb\("details"\)/);
  assert.match(schema, /authorId: integer\("author_id"\)/);
});

test("database event details use explicit obituary, memo, and legacy shapes", async () => {
  const contract = await readFile(
    new URL("../shared/community-events.ts", import.meta.url),
    "utf8",
  );

  assert.match(contract, /export interface LegacyObituaryDetails/);
  assert.match(contract, /legacyDateOfDeath\?: string/);
  assert.match(contract, /legacyRelationship\?: string/);
  assert.match(contract, /export type MemoDetails = z\.infer<typeof memoDetailsSchema>/);
  assert.match(
    contract,
    /export type CommunityEventDetails = ObituaryDetails \| MemoDetails \| LegacyObituaryDetails/,
  );
  assert.doesNotMatch(
    contract,
    /export type CommunityEventDetails[^\n]*Record<string, unknown>/,
  );
});

test("storage exposes owner-scoped draft methods", async () => {
  const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8");
  assert.match(storage, /getEventDraft\(id: number, authorId: number\)/);
  assert.match(storage, /getLatestEventDraft\(authorId: number, eventType: CommunityEventType\)/);
  assert.match(storage, /updateEventDraft\(id: number, authorId: number,/);
  assert.match(storage, /deleteEventDraft\(id: number, authorId: number\)/);
});

test("preview storage lookups stay owner and matched-user scoped", async () => {
  const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8");
  const draftMethod = storage.match(
    /async getEventDraft\([\s\S]*?return event \|\| undefined;\n  }/,
  )?.[0];
  const alumniMethod = storage.match(
    /async getAlumniRecordByUserId\([\s\S]*?return alumni \|\| undefined;\n  }/,
  )?.[0];

  assert.ok(draftMethod, "getEventDraft 구현을 찾을 수 없습니다");
  assert.match(draftMethod, /eq\(communityEvents\.id, id\)/);
  assert.match(draftMethod, /eq\(communityEvents\.authorId, authorId\)/);
  assert.match(draftMethod, /eq\(communityEvents\.status, "draft"\)/);
  assert.ok(alumniMethod, "getAlumniRecordByUserId 구현을 찾을 수 없습니다");
  assert.match(alumniMethod, /eq\(alumniDatabase\.matchedUserId, userId\)/);
});

test("publishing updates only an owned draft", async () => {
  const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8");
  const publishMethod = storage.match(
    /async publishEvent\([\s\S]*?return event \|\| undefined;\n  }/,
  )?.[0];

  assert.ok(publishMethod, "publishEvent 구현을 찾을 수 없습니다");
  assert.match(publishMethod, /eq\(communityEvents\.id, id\)/);
  assert.match(publishMethod, /eq\(communityEvents\.authorId, authorId\)/);
  assert.match(publishMethod, /eq\(communityEvents\.status, "draft"\)/);
});
