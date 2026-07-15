import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  COMMUNITY_EVENT_TYPES,
  type CommunityEventDraftInput,
  type CommunityEventType,
} from "@shared/community-events";
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
    sourceUrls: ["https://example.com/notice#tracking", "http://127.0.0.1/private"],
    details: {
      memo: "공개 메모",
      sourceUrl: "http://127.0.0.1/private",
    } as CommunityEvent["details"],
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
  t.mock.method(storage, "getEventDraft", async (_id, authorId) => {
    storageCalls += 1;
    return authorId === memberId ? draftEvent : undefined;
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
    const listed = (await list.json())[0];
    assert.equal(listed.sourceText, undefined);
    assert.deepEqual(listed.sourceUrls, ["https://example.com/notice"]);
    assert.equal(listed.details.sourceUrl, undefined);
    assert.equal(listed.details.memo, "공개 메모");
    assert.deepEqual(listedEventTypes, [undefined]);

    const filteredList = await fetch(`${server.baseUrl}/api/events?type=wedding`, { headers });
    assert.equal(filteredList.status, 200);
    assert.deepEqual(listedEventTypes, [undefined, "wedding"]);

    const detail = await fetch(`${server.baseUrl}/api/events/1`, { headers });
    assert.equal(detail.status, 200);
    const detailBody = await detail.json();
    assert.equal(detailBody.sourceText, undefined);
    assert.equal(detailBody.details.sourceUrl, undefined);
    assert.equal(detailBody.details.memo, "공개 메모");

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

    const privateCreate = await fetch(`${server.baseUrl}/api/events/drafts`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ ...draftPayload, sourceUrls: ["http://127.0.0.1/private"] }),
    });
    assert.equal(privateCreate.status, 400);

    const update = await fetch(`${server.baseUrl}/api/events/drafts/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ ...draftPayload, authorId: 1 }),
    });
    assert.equal(update.status, 200);
    assert.equal(updatedAuthorId, memberId);
    assert.equal("authorId" in (updatedDraft ?? {}), false);

    const privateUpdate = await fetch(`${server.baseUrl}/api/events/drafts/1`, {
      method: "PATCH",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ ...draftPayload, sourceUrls: ["http://127.0.0.1/private"] }),
    });
    assert.equal(privateUpdate.status, 400);

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

    const privatePublish = await fetch(`${server.baseUrl}/api/events/1/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ ...draftPayload, sourceUrls: ["http://127.0.0.1/private"] }),
    });
    assert.equal(privatePublish.status, 400);
  } finally {
    await server.close();
  }
});

test("all community event types support draft, publish, and filtered list routes", async (t) => {
  const payloads: Record<CommunityEventType, CommunityEventDraftInput> = {
    obituary: {
      eventType: "obituary",
      title: "서버 회원 동문 부친상",
      eventDate: "2026-08-03",
      location: "동국병원 장례식장",
      relatedMemberName: "요청 이름",
      contactNumber: "010-0000-0000",
      details: {
        deceasedName: "김한의",
        deceasedAge: 88,
        relationship: "부친",
        funeralDate: "2026년 8월 3일",
        funeralHome: "동국병원 장례식장 202호",
      },
      sourceUrls: [],
    },
    wedding: {
      eventType: "wedding",
      title: "김동국 동문 자녀 결혼",
      eventDate: "2026-08-10",
      relatedMemberName: "김동국",
      details: { memo: "결혼 안내" },
      sourceUrls: [],
    },
    opening: {
      eventType: "opening",
      title: "김동국 동문 개원",
      eventDate: "2026-08-11",
      relatedMemberName: "김동국",
      details: { memo: "개원 안내" },
      sourceUrls: [],
    },
    other: {
      eventType: "other",
      title: "김동국 동문 소식",
      eventDate: "2026-08-12",
      relatedMemberName: "김동국",
      details: { memo: "기타 안내" },
      sourceUrls: [],
    },
  };
  const ids = new Map(COMMUNITY_EVENT_TYPES.map((eventType, index) => [eventType, 101 + index]));
  const createdTypes: CommunityEventType[] = [];
  const publishedTypes: CommunityEventType[] = [];
  const listedTypes: Array<CommunityEventType | undefined> = [];

  const storedEvent = (
    data: CommunityEventDraftInput,
    status: CommunityEvent["status"] = "draft",
  ) => event({
    id: ids.get(data.eventType),
    eventType: data.eventType,
    status,
    title: data.title ?? null,
    eventDate: data.eventDate ?? null,
    location: data.location ?? null,
    relatedMemberName: data.relatedMemberName ?? null,
    contactNumber: data.contactNumber ?? null,
    accountInfo: data.accountInfo ?? null,
    sourceText: data.sourceText ?? null,
    sourceUrls: data.sourceUrls,
    details: data.details,
    publishedAt: status === "published" ? new Date("2026-07-16T00:00:00Z") : null,
  });

  t.mock.method(storage, "createEventDraft", async (_authorId, data) => {
    createdTypes.push(data.eventType);
    return storedEvent(data);
  });
  t.mock.method(storage, "getEventDraft", async (id, authorId) => {
    if (authorId !== memberId) return undefined;
    const match = COMMUNITY_EVENT_TYPES.find((eventType) => ids.get(eventType) === id);
    return match ? storedEvent(payloads[match]) : undefined;
  });
  t.mock.method(storage, "publishEvent", async (_id, _authorId, data) => {
    publishedTypes.push(data.eventType);
    return storedEvent(data, "published");
  });
  t.mock.method(storage, "getPublishedEvents", async (eventType) => {
    listedTypes.push(eventType);
    return eventType ? [storedEvent(payloads[eventType], "published")] : [];
  });
  t.mock.method(storage, "getUser", async () => ({
    id: memberId,
    kakaoId: null,
    email: "matrix@example.invalid",
    name: "서버 회원",
    graduationYear: null,
    isVerified: true,
    isAdmin: false,
    kakaoSyncEnabled: false,
    profileImage: null,
    phoneNumber: "010-1234-5678",
    birthday: null,
    birthdayType: null,
    isLeapMonth: null,
    activityRegion: "서울특별시",
    createdAt: null,
    updatedAt: null,
  }));
  t.mock.method(storage, "getAlumniRecordByUserId", async () => ({
    id: 901,
    department: "한의학과",
    generation: "8기",
    name: "서버 회원",
    admissionDate: "1986-03-02",
    graduationDate: null,
    address: null,
    mobile: "010-1234-5678",
    phone: null,
    group: null,
    status: null,
    alumniPosition: "동국한의원 원장",
    memo: null,
    isMatched: true,
    matchedUserId: memberId,
  }));
  t.mock.method(storage, "getMembershipStatus", async () => ({
    year: 2026,
    tier: "권리회원",
    isPaid: true,
    paidAmount: 100_000,
    annualDues: 100_000,
    currentYearPayment: null,
  }));

  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));
  const headers = {
    "content-type": "application/json",
    "x-test-user-id": String(memberId),
  };

  try {
    for (const eventType of COMMUNITY_EVENT_TYPES) {
      await t.test(eventType, async () => {
        const draft = await fetch(`${server.baseUrl}/api/events/drafts`, {
          method: "POST",
          headers,
          body: JSON.stringify(payloads[eventType]),
        });
        assert.equal(draft.status, 201);
        assert.equal((await draft.json()).eventType, eventType);

        const publish = await fetch(`${server.baseUrl}/api/events/${ids.get(eventType)}/publish`, {
          method: "POST",
          headers,
          body: JSON.stringify(payloads[eventType]),
        });
        assert.equal(publish.status, 200);
        const published = await publish.json();
        assert.equal(published.eventType, eventType);
        assert.equal(published.sourceText, undefined);

        const list = await fetch(`${server.baseUrl}/api/events?type=${eventType}`, { headers });
        assert.equal(list.status, 200);
        assert.deepEqual((await list.json()).map((item: CommunityEvent) => item.eventType), [eventType]);
      });
    }

    assert.deepEqual(createdTypes, COMMUNITY_EVENT_TYPES);
    assert.deepEqual(publishedTypes, COMMUNITY_EVENT_TYPES);
    assert.deepEqual(listedTypes, COMMUNITY_EVENT_TYPES);
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
  t.mock.method(storage, "getEventDraft", async (id, authorId) => {
    return id === 1 && authorId === memberId ? event() : undefined;
  });
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

test("obituary publish canonicalizes profile fields and retries idempotently for only the owner", async (t) => {
  const obituaryId = 31;
  const noAlumniId = 32;
  const canonicalUser = {
    id: memberId,
    kakaoId: null,
    email: "member@example.com",
    name: "서버 회원",
    graduationYear: null,
    isVerified: true,
    isAdmin: false,
    kakaoSyncEnabled: false,
    profileImage: null,
    phoneNumber: "010-1234-5678",
    birthday: null,
    birthdayType: null,
    isLeapMonth: null,
    activityRegion: "서울특별시",
    createdAt: null,
    updatedAt: null,
  };
  const canonicalAlumni = {
    id: 91,
    department: "한의학과",
    generation: "8기",
    name: "동문 명부 이름",
    admissionDate: "1986-03-02",
    graduationDate: null,
    address: null,
    mobile: "010-9999-0000",
    phone: null,
    group: null,
    status: null,
    alumniPosition: "서버 명부 직함",
    memo: null,
    isMatched: true,
    matchedUserId: memberId,
  };
  const ownedDraft = event({
    id: obituaryId,
    eventType: "obituary",
    authorId: memberId,
    relatedMemberName: "저장된 위조 이름",
    contactNumber: "저장된 위조 연락처",
    details: {},
  });
  const noAlumniDraft = event({
    id: noAlumniId,
    eventType: "obituary",
    authorId: noAlumniMemberId,
    details: {},
  });
  let publishedRecord: CommunityEvent | undefined;
  let publishCalls = 0;
  let publishedData: Parameters<typeof storage.publishEvent>[2] | undefined;

  t.mock.method(storage, "getPublishedEvent", async (id) => {
    return publishedRecord?.id === id ? publishedRecord : undefined;
  });
  t.mock.method(storage, "getEventDraft", async (id, authorId) => {
    if (publishedRecord?.id === id) return undefined;
    if (id === obituaryId && authorId === memberId) return ownedDraft;
    if (id === noAlumniId && authorId === noAlumniMemberId) return noAlumniDraft;
    return undefined;
  });
  t.mock.method(storage, "getUser", async (id) => {
    if (id === memberId) return canonicalUser;
    if (id === noAlumniMemberId) {
      return { ...canonicalUser, id, email: "no-alumni@example.com" };
    }
    return undefined;
  });
  t.mock.method(storage, "getAlumniRecordByUserId", async (id) => {
    return id === memberId ? canonicalAlumni : undefined;
  });
  t.mock.method(storage, "getMembershipStatus", async () => ({
    year: 2026,
    tier: "권리회원",
    isPaid: true,
    paidAmount: 100_000,
    annualDues: 100_000,
    currentYearPayment: null,
  }));
  t.mock.method(storage, "publishEvent", async (id, authorId, data) => {
    publishCalls += 1;
    publishedData = data;
    if (id !== obituaryId || authorId !== memberId) return undefined;
    publishedRecord = event({
      ...data,
      id,
      authorId,
      status: "published",
      sourceText: "비공개 원문",
      publishedAt: new Date("2026-07-12T01:00:00Z"),
    });
    return publishedRecord;
  });

  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));
  const publishBody = {
    eventType: "obituary" as const,
    title: "서버 회원 동문 부친상",
    eventDate: "2026-08-01",
    location: "동국병원 장례식장",
    accountInfo: "동국은행 123-456",
    details: {
      deceasedName: "김한의",
      deceasedAge: 88,
      relationship: "부친" as const,
      funeralDate: "2026년 8월 3일",
      funeralHome: "동국병원 장례식장 202호",
      memberTitle: "요청 위조 직함",
    },
  };

  try {
    const ownerHeaders = { "content-type": "application/json", "x-test-user-id": String(memberId) };
    const first = await fetch(`${server.baseUrl}/api/events/${obituaryId}/publish`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify(publishBody),
    });
    assert.equal(first.status, 200);
    const firstBody = await first.json() as Record<string, unknown>;
    assert.equal(firstBody.relatedMemberName, "서버 회원");
    assert.equal(firstBody.contactNumber, "010-1234-5678");
    assert.equal((firstBody.details as Record<string, unknown>).memberTitle, "서버 명부 직함");
    assert.equal(firstBody.sourceText, undefined);
    assert.equal(publishedData?.relatedMemberName, "서버 회원");
    assert.equal(publishedData?.contactNumber, "010-1234-5678");
    assert.equal((publishedData?.details as Record<string, unknown>).memberTitle, "서버 명부 직함");

    const retry = await fetch(`${server.baseUrl}/api/events/${obituaryId}/publish`, {
      method: "POST",
      headers: ownerHeaders,
      body: JSON.stringify({ malformed: "retry body is ignored after publication" }),
    });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json() as Record<string, unknown>).sourceText, undefined);
    assert.equal(publishCalls, 1);

    const crossOwner = await fetch(`${server.baseUrl}/api/events/${obituaryId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": String(otherMemberId) },
      body: JSON.stringify(publishBody),
    });
    assert.equal(crossOwner.status, 404);
    assert.deepEqual(await crossOwner.json(), { message: "소식을 찾을 수 없습니다" });
    assert.equal(publishCalls, 1);

    const noAlumni = await fetch(`${server.baseUrl}/api/events/${noAlumniId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-test-user-id": String(noAlumniMemberId) },
      body: JSON.stringify({
        ...publishBody,
        relatedMemberName: "요청 위조 이름",
        contactNumber: "010-0000-0000",
      }),
    });
    assert.equal(noAlumni.status, 400);
    assert.ok((await noAlumni.json() as { missingFields?: string[] }).missingFields?.includes("graduationClass"));
    assert.equal(publishCalls, 1);
  } finally {
    await server.close();
  }
});

test("concurrent draft create routes preserve owner and type get-or-create results", async (t) => {
  const drafts = new Map<string, CommunityEvent>();
  const queues = new Map<string, Promise<void>>();
  let nextId = 100;
  let insertCount = 0;
  let updateCount = 0;

  t.mock.method(storage, "createEventDraft", async (authorId, data) => {
    const key = `${authorId}:${data.eventType}`;
    const previous = queues.get(key) ?? Promise.resolve();
    const write = previous.then(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      const existing = drafts.get(key);
      if (existing) {
        updateCount += 1;
        const updated = event({
          ...existing,
          ...data,
          id: existing.id,
          authorId,
          eventType: data.eventType,
          title: data.title ?? null,
          details: data.details,
        });
        drafts.set(key, updated);
        return updated;
      }
      insertCount += 1;
      const created = event({
        ...data,
        id: nextId++,
        authorId,
        eventType: data.eventType,
        title: data.title ?? null,
        details: data.details,
      });
      drafts.set(key, created);
      return created;
    });
    queues.set(key, write.then(() => undefined, () => undefined));
    return write;
  });

  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));
  const create = (userId: number, payload: CommunityEventDraftInput) => fetch(`${server.baseUrl}/api/events/drafts`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-user-id": String(userId) },
    body: JSON.stringify(payload),
  });

  try {
    const [first, competing, otherUser, otherType] = await Promise.all([
      create(memberId, draftPayload),
      create(memberId, { ...draftPayload, title: "경쟁 요청 제목" }),
      create(otherMemberId, draftPayload),
      create(memberId, { ...draftPayload, eventType: "opening" }),
    ]);
    const [firstBody, competingBody, otherUserBody, otherTypeBody] = await Promise.all([
      first.json(), competing.json(), otherUser.json(), otherType.json(),
    ]) as Array<CommunityEvent>;

    assert.equal(first.status, 201);
    assert.equal(competing.status, 201);
    assert.equal(firstBody.id, competingBody.id);
    assert.equal(firstBody.title, draftPayload.title);
    assert.equal(competingBody.title, "경쟁 요청 제목");
    assert.notEqual(firstBody.id, otherUserBody.id);
    assert.notEqual(firstBody.id, otherTypeBody.id);
    assert.equal(otherUserBody.authorId, otherMemberId);
    assert.equal(otherTypeBody.eventType, "opening");
    assert.equal(insertCount, 3);
    assert.equal(updateCount, 1);
  } finally {
    await server.close();
  }
});
