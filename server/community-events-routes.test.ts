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
const noAlumniMemberId = 2_147_483_644;

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
  const listedEventTypes: Array<Parameters<typeof storage.getPublishedEvents>[0]> = [];
  let createdAuthorId: number | undefined;
  let createdDraft: Parameters<typeof storage.createEventDraft>[1] | undefined;
  let updatedAuthorId: number | undefined;
  let updatedDraft: Parameters<typeof storage.updateEventDraft>[2] | undefined;
  let publishedAuthorId: number | undefined;
  let publishedData: Parameters<typeof storage.publishEvent>[2] | undefined;

  t.mock.method(storage, "getPublishedEvents", async (eventType) => {
    storageCalls += 1;
    listedEventTypes.push(eventType);
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
      fetch(`${server.baseUrl}/api/events/1/preview`, { method: "POST" }),
    ];

    for (const response of await Promise.all(anonymousRequests)) {
      assert.equal(response.status, 401);
    }
    assert.equal(storageCalls, 0);

    const headers = { "x-test-user-id": String(memberId) };
    const list = await fetch(`${server.baseUrl}/api/events`, { headers });
    assert.equal(list.status, 200);
    assert.equal((await list.json())[0].sourceText, undefined);
    assert.deepEqual(listedEventTypes, [undefined]);

    const filteredList = await fetch(`${server.baseUrl}/api/events?type=wedding`, { headers });
    assert.equal(filteredList.status, 200);
    assert.deepEqual(listedEventTypes, [undefined, "wedding"]);

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

test("obituary preview uses only server-sourced owner profile data", async (t) => {
  const completeDraft = event({
    eventType: "obituary",
    title: "김동국 동문 부친상",
    eventDate: "2026-08-01",
    location: "동국병원 장례식장",
    relatedMemberName: "본문 위조 이름",
    contactNumber: "본문 위조 연락처",
    accountInfo: "동국은행 123-456 김동국",
    details: {
      deceasedName: "김한의",
      deceasedAge: 88,
      relationship: "부친",
      funeralDate: "2026년 8월 3일(월요일)",
      funeralHome: "동국병원 장례식장 202호",
      accountInfo: "동국은행 123-456 김동국",
      sourceUrl: "https://example.com/obituary",
      memberTitle: "초안 위조 직함",
    },
  });
  const incompleteDraft = event({
    id: 2,
    eventType: "obituary",
    details: { relationship: "부친" },
  });
  const missingProfileDraft = event({ ...completeDraft, id: 4, authorId: otherMemberId });
  const noAlumniDraft = event({ ...completeDraft, id: 5, authorId: noAlumniMemberId });
  const corruptDraft = event({
    ...completeDraft,
    id: 6,
    details: "corrupt" as unknown as CommunityEvent["details"],
  });
  const overAgeDraft = event({
    ...completeDraft,
    id: 7,
    details: { ...completeDraft.details, deceasedAge: 131 },
  });
  const invalidUrlDraft = event({
    ...completeDraft,
    id: 8,
    details: { ...completeDraft.details, sourceUrl: "not-a-url" },
  });
  const user = {
    id: memberId,
    kakaoId: null,
    email: "member@example.com",
    name: "김동국",
    graduationYear: null,
    isVerified: true,
    isAdmin: false,
    kakaoSyncEnabled: false,
    profileImage: null,
    phoneNumber: null,
    birthday: null,
    birthdayType: null,
    isLeapMonth: null,
    activityRegion: "서울특별시",
    createdAt: null,
    updatedAt: null,
  };
  const alumni = {
    id: 10,
    department: "한의학과",
    generation: "8기",
    name: "동문 DB 이름",
    admissionDate: "1986-03-02",
    graduationDate: null,
    address: null,
    mobile: "010-1111-2222",
    phone: null,
    group: null,
    status: null,
    alumniPosition: "동국한의원 원장",
    memo: null,
    isMatched: true,
    matchedUserId: memberId,
  };

  t.mock.method(storage, "getEventDraft", async (id, authorId) => {
    if (id === 1 && authorId === memberId) return completeDraft;
    if (id === 2 && authorId === memberId) return incompleteDraft;
    if (id === 4 && authorId === otherMemberId) return missingProfileDraft;
    if (id === 5 && authorId === noAlumniMemberId) return noAlumniDraft;
    if (id === 6 && authorId === memberId) return corruptDraft;
    if (id === 7 && authorId === memberId) return overAgeDraft;
    if (id === 8 && authorId === memberId) return invalidUrlDraft;
    return undefined;
  });
  t.mock.method(storage, "getUser", async (id) => {
    if (id === memberId) return user;
    if (id === otherMemberId) return { ...user, id, email: "other@example.com", phoneNumber: null };
    if (id === noAlumniMemberId) {
      return { ...user, id, email: "no-alumni@example.com", phoneNumber: "010-3333-4444" };
    }
    return undefined;
  });
  t.mock.method(storage, "getAlumniRecordByUserId", async (id) => {
    if (id === memberId) return alumni;
    return undefined;
  });
  t.mock.method(storage, "getMembershipStatus", async () => ({
    year: 2026,
    tier: "권리회원",
    isPaid: true,
    paidAmount: 100_000,
    annualDues: 100_000,
    currentYearPayment: null,
  }));
  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));

  try {
    const memberHeaders = { "content-type": "application/json", "x-test-user-id": String(memberId) };
    const otherHeaders = { "content-type": "application/json", "x-test-user-id": String(otherMemberId) };
    const noAlumniHeaders = { "content-type": "application/json", "x-test-user-id": String(noAlumniMemberId) };
    const forgedBody = {
      memberName: "공격자 이름",
      memberPhone: "010-9999-9999",
      membershipTier: "최고회원",
      memberTitle: "위조 직함",
      graduationClass: "999기",
      admissionYear: "99학번",
      authorId: otherMemberId,
    };

    const otherMember = await fetch(`${server.baseUrl}/api/events/1/preview`, {
      method: "POST",
      headers: otherHeaders,
      body: JSON.stringify(forgedBody),
    });
    assert.equal(otherMember.status, 404);

    const missingProfile = await fetch(`${server.baseUrl}/api/events/4/preview`, {
      method: "POST",
      headers: otherHeaders,
      body: JSON.stringify(forgedBody),
    });
    assert.equal(missingProfile.status, 400);
    assert.deepEqual((await missingProfile.json()).missingFields, [
      "graduationClass",
      "admissionYear",
      "memberPhone",
    ]);

    const noAlumni = await fetch(`${server.baseUrl}/api/events/5/preview`, {
      method: "POST",
      headers: noAlumniHeaders,
      body: JSON.stringify(forgedBody),
    });
    assert.equal(noAlumni.status, 400);
    assert.deepEqual((await noAlumni.json()).missingFields, ["graduationClass", "admissionYear"]);

    const published = await fetch(`${server.baseUrl}/api/events/3/preview`, {
      method: "POST",
      headers: memberHeaders,
      body: JSON.stringify(forgedBody),
    });
    assert.equal(published.status, 404);

    const incomplete = await fetch(`${server.baseUrl}/api/events/2/preview`, {
      method: "POST",
      headers: memberHeaders,
      body: JSON.stringify(forgedBody),
    });
    assert.equal(incomplete.status, 400);
    assert.deepEqual(await incomplete.json(), {
      message: "부고문 미리보기에 필요한 정보가 부족합니다",
      missingFields: ["deceasedName", "deceasedAge", "funeralHome", "funeralDate"],
    });

    for (const [id, missingFields] of [
      [6, ["details"]],
      [7, ["deceasedAge"]],
      [8, ["sourceUrl"]],
    ] as const) {
      const invalidStoredDraft = await fetch(`${server.baseUrl}/api/events/${id}/preview`, {
        method: "POST",
        headers: memberHeaders,
        body: JSON.stringify(forgedBody),
      });
      assert.equal(invalidStoredDraft.status, 400);
      assert.deepEqual(await invalidStoredDraft.json(), {
        message: "저장된 부고 초안이 올바르지 않습니다",
        missingFields,
      });
    }

    const response = await fetch(`${server.baseUrl}/api/events/1/preview`, {
      method: "POST",
      headers: memberHeaders,
      body: JSON.stringify(forgedBody),
    });
    assert.equal(response.status, 200);
    const { text } = await response.json() as { text: string };
    assert.equal(text, `#부고
본회 졸업8기(86학번) 김동국 권리회원(동국한의원 원장) 부친상

- 고인: 故김한의 (향년 88세)
- 빈소: 동국병원 장례식장 202호
- 발인: 2026년 8월 3일(월요일)

- 연락처: 김동국 010-1111-2222
- 마음 전하실 곳: 동국은행 123-456 김동국

* 유가족 및 장례식장 위치 확인: https://example.com/obituary

삼가 고인의 명복을 빕니다.
-동국대학교 한의과대학 동문회-`);
    for (const forgedValue of Object.values(forgedBody)) {
      assert.doesNotMatch(text, new RegExp(String(forgedValue)));
    }
  } finally {
    await server.close();
  }
});

test("community event APIs reject invalid input and hide owner-scoped drafts", async (t) => {
  let publishedListCalls = 0;
  t.mock.method(storage, "getPublishedEvents", async () => {
    publishedListCalls += 1;
    return [];
  });
  t.mock.method(storage, "getPublishedEvent", async (id) => {
    return id === 2_147_483_647 ? event({ id, status: "published" }) : undefined;
  });
  t.mock.method(storage, "getLatestEventDraft", async () => undefined);
  t.mock.method(storage, "createEventDraft", async () => event());
  t.mock.method(storage, "updateEventDraft", async (_id, authorId) => {
    return authorId === memberId ? event() : undefined;
  });
  t.mock.method(storage, "deleteEventDraft", async (_id, authorId) => authorId === memberId);
  t.mock.method(storage, "publishEvent", async (id, authorId) => {
    return id === 1 && authorId === memberId ? event({ status: "published" }) : undefined;
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

    const invalidListType = await fetch(`${server.baseUrl}/api/events?type=invalid`, {
      headers: memberHeaders,
    });
    assert.equal(invalidListType.status, 400);
    assert.equal(publishedListCalls, 0);

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

    const maxId = await fetch(`${server.baseUrl}/api/events/2147483647`, {
      headers: memberHeaders,
    });
    assert.equal(maxId.status, 200);

    for (const id of ["0", "1e3", "0x10", "1.0", "+1", "%201", "1%20", "2147483648"]) {
      for (const request of [
        fetch(`${server.baseUrl}/api/events/${id}`, { headers: memberHeaders }),
        fetch(`${server.baseUrl}/api/events/drafts/${id}`, { method: "PATCH", headers: jsonHeaders, body: JSON.stringify(draftPayload) }),
        fetch(`${server.baseUrl}/api/events/drafts/${id}`, { method: "DELETE", headers: memberHeaders }),
        fetch(`${server.baseUrl}/api/events/${id}/publish`, { method: "POST", headers: jsonHeaders, body: JSON.stringify(draftPayload) }),
        fetch(`${server.baseUrl}/api/events/${id}/preview`, { method: "POST", headers: memberHeaders }),
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

    const alreadyPublished = await fetch(`${server.baseUrl}/api/events/2/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", ...memberHeaders },
      body: JSON.stringify(draftPayload),
    });
    assert.equal(alreadyPublished.status, 404);
  } finally {
    await server.close();
  }
});
