import assert from "node:assert/strict";
import test from "node:test";
import type { CommunityEvent } from "@shared/schema";
import type { CommunityEventDraftInput } from "@shared/community-events";
import {
  eventDraftAdvisoryLockId,
  getOrCreateEventDraft,
  type EventDraftTransactionRunner,
} from "./event-draft-creation";

function draftEvent(id: number, authorId: number, data: CommunityEventDraftInput): CommunityEvent {
  return {
    id,
    legacyObituaryId: null,
    status: "draft",
    title: null,
    eventDate: null,
    location: null,
    relatedMemberName: null,
    contactNumber: null,
    accountInfo: null,
    sourceText: null,
    sourceUrls: [],
    publishedAt: null,
    createdAt: new Date("2026-07-12T00:00:00Z"),
    updatedAt: new Date("2026-07-12T00:00:00Z"),
    ...data,
    authorId,
  };
}

function inMemoryRunner() {
  const records = new Map<string, CommunityEvent>();
  const locks: string[] = [];
  let inserts = 0;
  let updates = 0;
  let queue = Promise.resolve();

  const runner: EventDraftTransactionRunner = async (work) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await work({
        lock: async (authorId, eventType) => {
          locks.push(`${authorId}:${eventDraftAdvisoryLockId(eventType)}`);
        },
        find: async (authorId, eventType) => records.get(`${authorId}:${eventType}`),
        update: async (id, authorId, eventType, data) => {
          const key = `${authorId}:${eventType}`;
          const existing = records.get(key);
          assert.equal(existing?.id, id);
          updates += 1;
          const updated = draftEvent(id, authorId, data);
          records.set(key, updated);
          return updated;
        },
        insert: async (authorId, data) => {
          inserts += 1;
          const created = draftEvent(inserts, authorId, data);
          records.set(`${authorId}:${data.eventType}`, created);
          return created;
        },
      });
    } finally {
      release();
    }
  };

  return {
    get: (authorId: number, eventType: string) => records.get(`${authorId}:${eventType}`),
    get inserts() { return inserts; },
    get updates() { return updates; },
    locks,
    runner,
  };
}

test("concurrent same-user same-type creation keeps one ID and returns each caller's write", async () => {
  const memory = inMemoryRunner();
  const first = { eventType: "obituary" as const, title: "첫 번째 초안", sourceUrls: [], details: {} };
  const competing = { eventType: "obituary" as const, title: "경쟁 요청", sourceUrls: [], details: {} };

  const [left, right] = await Promise.all([
    getOrCreateEventDraft(memory.runner, 7, first),
    getOrCreateEventDraft(memory.runner, 7, competing),
  ]);

  assert.equal(memory.inserts, 1);
  assert.equal(memory.updates, 1);
  assert.equal(left.id, right.id);
  assert.equal(left.title, "첫 번째 초안");
  assert.equal(right.title, "경쟁 요청");
  assert.equal(memory.get(7, "obituary")?.title, "경쟁 요청");
  assert.deepEqual(memory.locks, ["7:1", "7:1"]);
});

test("different users and event types receive separate drafts and lock keys", async () => {
  const memory = inMemoryRunner();
  const obituary = { eventType: "obituary" as const, sourceUrls: [], details: {} };
  const wedding = { eventType: "wedding" as const, sourceUrls: [], details: {} };

  const [one, otherUser, otherType] = await Promise.all([
    getOrCreateEventDraft(memory.runner, 7, obituary),
    getOrCreateEventDraft(memory.runner, 8, obituary),
    getOrCreateEventDraft(memory.runner, 7, wedding),
  ]);

  assert.equal(memory.inserts, 3);
  assert.equal(memory.updates, 0);
  assert.notEqual(one.id, otherUser.id);
  assert.notEqual(one.id, otherType.id);
  assert.deepEqual(memory.locks, ["7:1", "8:1", "7:2"]);
  assert.equal(eventDraftAdvisoryLockId("opening"), 3);
  assert.equal(eventDraftAdvisoryLockId("other"), 4);
});
