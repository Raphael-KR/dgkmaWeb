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

test("storage exposes owner-scoped draft methods", async () => {
  const storage = await readFile(new URL("./storage.ts", import.meta.url), "utf8");
  assert.match(storage, /getLatestEventDraft\(authorId: number, eventType: CommunityEventType\)/);
  assert.match(storage, /updateEventDraft\(id: number, authorId: number,/);
  assert.match(storage, /deleteEventDraft\(id: number, authorId: number\)/);
});
