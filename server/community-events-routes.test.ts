import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { CommunityEvent } from "@shared/schema";
import type { AdminUserLookup } from "./auth-middleware";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

async function startAuthorizationTestServer(getUserForAdmin: AdminUserLookup) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user-id");
    (req as any).session = userId ? { userId: Number(userId) } : {};
    next();
  });

  const server = await registerRoutes(app, { getUserForAdmin });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

const memberId = 2_147_483_646;
const otherMemberId = 2_147_483_645;

const draftPayload = {
  eventType: "wedding" as const,
  title: "김동국 동문 자녀 결혼",
  eventDate: "2026-08-01",
  relatedMemberName: "김동국",
  details: {},
  sourceText: "원문 메시지",
};

function event(overrides: Partial<CommunityEvent> = {}): CommunityEvent {
  return {
    id: 1,
    legacyObituaryId: null,
    eventType: "wedding",
    status: "draft",
    title: draftPayload.title,
    eventDate: draftPayload.eventDate,
    location: null,
    relatedMemberName: draftPayload.relatedMemberName,
    contactNumber: null,
    accountInfo: null,
    sourceText: draftPayload.sourceText,
    sourceUrls: [],
    details: {},
    authorId: memberId,
    publishedAt: null,
    createdAt: new Date("2026-07-11T00:00:00Z"),
    updatedAt: new Date("2026-07-11T00:00:00Z"),
    ...overrides,
  };
}

test("community event APIs enforce member sessions and do not expose source text", async (t) => {
  const publishedEvent = event({
    status: "published",
    publishedAt: new Date("2026-07-11T01:00:00Z"),
  });
  const draftEvent = event();
  let storageCalls = 0;
  let createdAuthorId: number | undefined;
  let createdDraft: Parameters<typeof storage.createEventDraft>[1] | undefined;
  let updatedAuthorId: number | undefined;
  let updatedDraft: Parameters<typeof storage.updateEventDraft>[2] | undefined;
  let publishedAuthorId: number | undefined;
  let publishedData: Parameters<typeof storage.publishEvent>[2] | undefined;

  t.mock.method(storage, "getPublishedEvents", async () => {
    storageCalls += 1;
    return [publishedEvent];
  });
  t.mock.method(storage, "getPublishedEvent", async () => {
    storageCalls += 1;
    return publishedEvent;
  });
  t.mock.method(storage, "getLatestEventDraft", async () => {
    storageCalls += 1;
    return draftEvent;
  });
  t.mock.method(storage, "createEventDraft", async (authorId, data) => {
    storageCalls += 1;
    createdAuthorId = authorId;
    createdDraft = data;
    return draftEvent;
  });
  t.mock.method(storage, "updateEventDraft", async (_id, authorId, data) => {
    storageCalls += 1;
    updatedAuthorId = authorId;
    updatedDraft = data;
    return draftEvent;
  });
  t.mock.method(storage, "deleteEventDraft", async () => {
    storageCalls += 1;
    return true;
  });
  t.mock.method(storage, "publishEvent", async (_id, authorId, data) => {
    storageCalls += 1;
    publishedAuthorId = authorId;
    publishedData = data;
    return publishedEvent;
  });
  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));

  try {
    const anonymousRequests = [
      fetch(`${server.baseUrl}/api/events`),
      fetch(`${server.baseUrl}/api/events/1`),
      fetch(`${server.baseUrl}/api/events/drafts/latest?type=wedding`),
      fetch(`${server.baseUrl}/api/events/drafts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftPayload),
      }),
      fetch(`${server.baseUrl}/api/events/drafts/1`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftPayload),
      }),
      fetch(`${server.baseUrl}/api/events/drafts/1`, { method: "DELETE" }),
      fetch(`${server.baseUrl}/api/events/1/publish`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftPayload),
      }),
    ];

    for (const response of await Promise.all(anonymousRequests)) {
      assert.equal(response.status, 401);
    }
    assert.equal(storageCalls, 0);

    const headers = { "x-test-user-id": String(memberId) };
    const list = await fetch(`${server.baseUrl}/api/events`, { headers });
    assert.equal(list.status, 200);
    assert.equal((await list.json())[0].sourceText, undefined);

    const detail = await fetch(`${server.baseUrl}/api/events/1`, { headers });
    assert.equal(detail.status, 200);
    assert.equal((await detail.json()).sourceText, undefined);

    const latestDraft = await fetch(`${server.baseUrl}/api/events/drafts/latest?type=wedding`, { headers });
    assert.equal(latestDraft.status, 200);

    const create = await fetch(`${server.baseUrl}/api/events/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ ...draftPayload, authorId: 1 }),
    });
    assert.equal(create.status, 201);
    assert.equal(createdAuthorId, memberId);
    assert.equal("authorId" in (createdDraft ?? {}), false);

    const update = await fetch(`${server.baseUrl}/api/events/drafts/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ ...draftPayload, authorId: 1 }),
    });
    assert.equal(update.status, 200);
    assert.equal(updatedAuthorId, memberId);
    assert.equal("authorId" in (updatedDraft ?? {}), false);

    const remove = await fetch(`${server.baseUrl}/api/events/drafts/1`, {
      method: "DELETE",
      headers,
    });
    assert.equal(remove.status, 204);

    const publish = await fetch(`${server.baseUrl}/api/events/1/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ ...draftPayload, authorId: 1 }),
    });
    assert.equal(publish.status, 200);
    assert.equal(publishedAuthorId, memberId);
    assert.equal("authorId" in (publishedData ?? {}), false);
  } finally {
    await server.close();
  }
});

test("community event APIs reject invalid input and hide owner-scoped drafts", async (t) => {
  t.mock.method(storage, "getPublishedEvent", async () => undefined);
  t.mock.method(storage, "getLatestEventDraft", async () => undefined);
  t.mock.method(storage, "createEventDraft", async () => event());
  t.mock.method(storage, "updateEventDraft", async (_id, authorId) => {
    return authorId === memberId ? event() : undefined;
  });
  t.mock.method(storage, "deleteEventDraft", async (_id, authorId) => authorId === memberId);
  t.mock.method(storage, "publishEvent", async (_id, authorId) => {
    return authorId === memberId ? event({ status: "published" }) : undefined;
  });
  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));

  try {
    const memberHeaders = { "x-test-user-id": String(memberId) };
    const otherHeaders = { "x-test-user-id": String(otherMemberId) };
    const jsonHeaders = { "content-type": "application/json", ...memberHeaders };

    const latestMissing = await fetch(`${server.baseUrl}/api/events/drafts/latest?type=wedding`, {
      headers: memberHeaders,
    });
    assert.equal(latestMissing.status, 404);

    const latestInvalidType = await fetch(`${server.baseUrl}/api/events/drafts/latest?type=invalid`, {
      headers: memberHeaders,
    });
    assert.equal(latestInvalidType.status, 400);

    const invalidDraft = await fetch(`${server.baseUrl}/api/events/drafts`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ eventType: "invalid" }),
    });
    assert.equal(invalidDraft.status, 400);

    const invalidUpdate = await fetch(`${server.baseUrl}/api/events/drafts/1`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ eventType: "invalid" }),
    });
    assert.equal(invalidUpdate.status, 400);

    const invalidPublish = await fetch(`${server.baseUrl}/api/events/1/publish`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ eventType: "wedding" }),
    });
    assert.equal(invalidPublish.status, 400);

    for (const id of ["0", "1e3", "0x10", "1.0", "+1", "%201", "1%20"]) {
      for (const request of [
        fetch(`${server.baseUrl}/api/events/${id}`, { headers: memberHeaders }),
        fetch(`${server.baseUrl}/api/events/drafts/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(draftPayload) }),
        fetch(`${server.baseUrl}/api/events/drafts/${id}`, { method: "DELETE", headers: memberHeaders }),
        fetch(`${server.baseUrl}/api/events/${id}/publish`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(draftPayload) }),
      ]) {
        assert.equal((await request).status, 400);
      }
    }

    const otherUpdate = await fetch(`${server.baseUrl}/api/events/drafts/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...otherHeaders },
      body: JSON.stringify(draftPayload),
    });
    assert.equal(otherUpdate.status, 404);

    const otherDelete = await fetch(`${server.baseUrl}/api/events/drafts/1`, {
      method: "DELETE",
      headers: otherHeaders,
    });
    assert.equal(otherDelete.status, 404);

    const otherPublish = await fetch(`${server.baseUrl}/api/events/1/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", ...otherHeaders },
      body: JSON.stringify(draftPayload),
    });
    assert.equal(otherPublish.status, 404);
  } finally {
    await server.close();
  }
});
