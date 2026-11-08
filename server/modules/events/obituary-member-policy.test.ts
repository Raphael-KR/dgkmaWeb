import assert from "node:assert/strict";
import test from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import type {
  AlumniRecord,
  CommunityEvent,
  MembershipStatus,
  User,
} from "@shared/schema";
import {
  assembleTrustedObituary,
  type ObituaryMemberStorage,
} from "./obituary-member-policy";
import { resolveEventMember } from "./event-member-policy";
import { registerRoutes } from "../../routes";
import { storage } from "../../storage";

const requesterId = 101;
const targetUserId = 202;

const requester: User = {
  id: requesterId,
  kakaoId: null,
  email: "requester@example.com",
  name: "관리자",
  graduationYear: null,
  isVerified: true,
  isAdmin: true,
  kakaoSyncEnabled: false,
  profileImage: null,
  phoneNumber: "010-0000-0000",
  birthday: null,
  birthdayType: null,
  isLeapMonth: null,
  activityRegion: "서울특별시",
  createdAt: null,
  updatedAt: null,
};

const targetUser: User = {
  ...requester,
  id: targetUserId,
  email: "target@example.com",
  name: "김현수",
  isAdmin: false,
  phoneNumber: "010-1111-2222",
};

const requesterAlumni: AlumniRecord = {
  id: 11,
  department: "한의학과",
  generation: "20기",
  name: requester.name,
  admissionDate: "2002-03-02",
  graduationDate: null,
  address: null,
  mobile: requester.phoneNumber,
  phone: null,
  group: null,
  status: null,
  alumniPosition: null,
  memo: null,
  isMatched: true,
  matchedUserId: requesterId,
};

const targetAlumni: AlumniRecord = {
  ...requesterAlumni,
  id: 22,
  generation: "25기",
  name: targetUser.name,
  admissionDate: "2007-03-02",
  mobile: targetUser.phoneNumber,
  alumniPosition: "동문",
  matchedUserId: targetUserId,
};

const membership: MembershipStatus = {
  year: 2026,
  tier: "일반회원",
  isPaid: false,
  paidAmount: 0,
  annualDues: 100_000,
  currentYearPayment: null,
};

function obituaryDraft(overrides: Partial<CommunityEvent> = {}): CommunityEvent {
  return {
    id: 313,
    legacyObituaryId: null,
    eventType: "obituary",
    status: "draft",
    title: "김현수 동문 부친상",
    eventDate: "2026-10-28",
    location: "동국장례식장",
    relatedMemberName: "김현수",
    contactNumber: null,
    accountInfo: null,
    sourceText: "동국한의 07학번 김현수동문의 부친께서 별세하셨기에 삼가 알려드립니다.",
    sourceUrls: ["https://example.com/obituary"],
    details: {
      deceasedName: "김부친",
      deceasedAge: 80,
      relationship: "부친",
      funeralDate: "2026년 10월 30일",
      funeralHome: "동국장례식장 1호",
    },
    authorId: requesterId,
    publishedAt: null,
    createdAt: new Date("2026-07-30T00:00:00Z"),
    updatedAt: new Date("2026-07-30T00:00:00Z"),
    ...overrides,
  };
}

function memberStorage(
  requestingUser: User,
  alumniMatches: AlumniRecord[] = [targetAlumni],
  aliasMatches: AlumniRecord[] = alumniMatches,
): ObituaryMemberStorage {
  return {
    getUser: async (id) => {
      if (id === requesterId) return requestingUser;
      if (id === targetUserId) return targetUser;
      return undefined;
    },
    getAlumniRecordByUserId: async (id) => {
      if (id === requesterId) return requesterAlumni;
      if (id === targetUserId) return targetAlumni;
      return undefined;
    },
    getMembershipStatus: async () => membership,
    findAlumniByName: async () => alumniMatches,
    findAlumniByNameOrAlias: async () => aliasMatches,
  };
}

test("general members can preview only their own obituary", async () => {
  const result = await assembleTrustedObituary(
    obituaryDraft(),
    requesterId,
    memberStorage({ ...requester, isAdmin: false }),
  );

  assert.deepEqual(result, {
    kind: "blocked",
    message: "일반회원은 본인 경조사만 등록할 수 있습니다",
    missingFields: ["relatedMemberName"],
  });
});

test("an admin can preview for exactly one directory match by name and admission year", async () => {
  const result = await assembleTrustedObituary(
    obituaryDraft(),
    requesterId,
    memberStorage(requester),
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.input.memberName, "김현수");
  assert.equal(result.input.admissionYear, "07학번");
  assert.equal(result.input.memberPhone, "010-1111-2222");
});

test("an exact directory match does not require the alumnus to have signed in", async () => {
  const unlinkedAlumni = { ...targetAlumni, matchedUserId: null };
  const result = await assembleTrustedObituary(
    obituaryDraft(),
    requesterId,
    memberStorage(requester, [unlinkedAlumni]),
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.input.memberName, "김현수");
  assert.equal(result.input.membershipTier, "일반회원");
  assert.equal(result.input.memberPhone, "010-1111-2222");
});

test("an admin can preview a renamed member through one official alias and admission-year match", async () => {
  const renamedAlumni = {
    ...targetAlumni,
    name: "김현재",
    admissionDate: "1979-03-02",
  };
  const result = await assembleTrustedObituary(
    obituaryDraft({
      title: "김현재 동문 본인상",
      relatedMemberName: "김현재",
      sourceText: "1기 김현재 (개명 전 김이전) 본인상 학번-79학번",
      details: {
        deceasedName: "김현재",
        deceasedAge: 66,
        relationship: "본인",
        funeralDate: "2026년 8월 18일",
        funeralHome: "동국장례식장 1호",
        familyContactName: "장남 김유족",
        familyContact: "010-9999-0000",
      },
    }),
    requesterId,
    memberStorage(requester, [], [renamedAlumni]),
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.input.memberName, "김현재");
  assert.equal(result.input.admissionYear, "79학번");
  assert.equal(result.input.memberPhone, "010-9999-0000");
  assert.equal(result.input.contactName, "장남 김유족");
});

test("an admin is blocked when name and admission year match more than one alumnus", async () => {
  const duplicate = { ...targetAlumni, id: 23, matchedUserId: null };
  const result = await assembleTrustedObituary(
    obituaryDraft(),
    requesterId,
    memberStorage(requester, [targetAlumni, duplicate]),
  );

  assert.deepEqual(result, {
    kind: "blocked",
    message: "명부에서 이름과 학번이 정확히 일치하는 동문 한 명을 확인할 수 없습니다",
    missingFields: ["relatedMemberName", "admissionYear"],
  });
});

test("an admin must provide an admission year for another member", async () => {
  const result = await assembleTrustedObituary(
    obituaryDraft({ sourceText: "김현수 동문의 부친상입니다." }),
    requesterId,
    memberStorage(requester),
  );

  assert.deepEqual(result, {
    kind: "blocked",
    message: "대리 등록하려면 동문 이름과 학번이 필요합니다",
    missingFields: ["admissionYear"],
  });
});

test("a self obituary is blocked when the member and deceased names differ", async () => {
  const result = await assembleTrustedObituary(
    obituaryDraft({
      title: "김현수 동문 본인상",
      details: {
        deceasedName: "김다른",
        deceasedAge: 80,
        relationship: "본인",
        funeralDate: "2026년 10월 30일",
        funeralHome: "동국장례식장 1호",
      },
    }),
    requesterId,
    memberStorage(requester),
  );

  assert.deepEqual(result, {
    kind: "blocked",
    message: "본인상은 동문 이름과 고인 이름이 같아야 합니다",
    missingFields: ["details.deceasedName"],
  });
});

test("shared event member policy permits self registration and rejects a missing requester", async () => {
  const input = { relatedMemberName: requester.name };
  const ownMember = await resolveEventMember(input, requesterId, memberStorage({ ...requester, isAdmin: false }));
  assert.equal(ownMember.kind, "ready");
  if (ownMember.kind === "ready") assert.equal(ownMember.user?.id, requesterId);
  const missingMember = await resolveEventMember(input, requesterId, {
    ...memberStorage(requester), getUser: async () => undefined,
  });
  assert.equal(missingMember.kind, "blocked");
});

// Reuse the existing users, alumni and obituary input above. All persistence and
// identity lookups are mocked; no real DB/provider or test account is created.
test("wedding, opening, other and legacy registration enforce the same member policy before writing", async (t) => {
  const draft = obituaryDraft();
  const obituaryDetails = draft.details as {
    deceasedName: string; relationship: string; funeralHome: string;
  };
  let currentMember: User | undefined = requester;
  let matches = [targetAlumni];
  let writes: Array<{ authorId: number; data: Record<string, unknown> }> = [];
  const lookups: string[] = [];
  t.mock.method(storage, "getUser", async (id: number) => id === requesterId ? currentMember : targetUser);
  t.mock.method(storage, "getAlumniRecordByUserId", async () => requesterAlumni);
  t.mock.method(storage, "findAlumniByNameOrAlias", async (name: string) => { lookups.push(name); return matches; });
  let currentType: "wedding" | "opening" | "other" = "wedding";
  t.mock.method(storage, "getEventDraft", async () => ({ ...draft, eventType: currentType }));
  t.mock.method(storage, "publishEvent", async (...[_id, authorId, data]: Parameters<typeof storage.publishEvent>) => {
    writes.push({ authorId, data });
    return { ...draft, ...data, authorId, status: "published" };
  });
  t.mock.method(storage, "createObituary", async (...[data]: Parameters<typeof storage.createObituary>) => {
    writes.push({ authorId: data.authorId!, data });
    return { ...data, id: draft.id, authorId: data.authorId!, createdAt: draft.createdAt };
  });

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).session = req.header("x-test-user-id") ? { userId: requesterId } : {};
    next();
  });
  const server = await registerRoutes(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    for (const type of ["wedding", "opening", "other", "legacy"] as const) {
      if (type !== "legacy") currentType = type;
      const payload = type === "legacy" ? {
        title: draft.title, deceasedName: obituaryDetails.deceasedName,
        deceasedRelation: obituaryDetails.relationship, dateOfDeath: draft.eventDate,
        funeralHome: obituaryDetails.funeralHome,
      } : {
        eventType: type, title: draft.title, eventDate: draft.eventDate, details: {}, sourceUrls: [],
      };
      const submit = async (overrides: Record<string, unknown> = {}, anonymous = false) => {
        writes = [];
        return fetch(`${baseUrl}${type === "legacy" ? "/api/obituaries" : `/api/events/${draft.id}/publish`}`, {
          method: "POST",
          headers: { "content-type": "application/json", ...(!anonymous ? { "x-test-user-id": String(requesterId) } : {}) },
          body: JSON.stringify({
            ...payload, relatedMemberName: draft.relatedMemberName, sourceText: draft.sourceText,
            authorId: targetUserId, isAdmin: true, ...overrides,
          }),
        });
      };
      const expectWrite = async (overrides: Record<string, unknown> = {}, expectedName = targetAlumni.name) => {
        const response = await submit(overrides);
        assert.equal(response.status, type === "legacy" ? 201 : 200, `${type}: ${await response.text()}`);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].authorId, requesterId);
        assert.equal("isAdmin" in writes[0].data, false);
        if (type === "legacy") {
          assert.equal("relatedMemberName" in writes[0].data, false);
          assert.equal("sourceText" in writes[0].data, false);
        } else assert.equal(writes[0].data.relatedMemberName, expectedName);
      };
      const expectBlocked = async (overrides: Record<string, unknown> = {}, anonymous = false) => {
        const response = await submit(overrides, anonymous);
        assert.equal(response.status, anonymous ? 401 : 400, `${type}: ${await response.text()}`);
        assert.equal(writes.length, 0);
      };

      await t.test(`${type}: anonymous and forged admin/author cannot register for another member`, async () => {
        currentMember = { ...requester, isAdmin: false };
        matches = [targetAlumni];
        await expectBlocked({}, true);
        await expectBlocked();
        await expectWrite({ relatedMemberName: requester.name, sourceText: undefined }, requester.name);
        currentMember = undefined;
        await expectBlocked({ relatedMemberName: requester.name, sourceText: undefined });
      });
      await t.test(`${type}: admin self, exact match and official alias are allowed`, async () => {
        currentMember = requester;
        matches = [targetAlumni];
        await expectWrite({ relatedMemberName: requester.name, sourceText: undefined }, requester.name);
        await expectWrite();
        await expectWrite({ relatedMemberName: "김이전" });
        assert.equal(lookups.at(-1), "김이전");
        matches = [{ ...targetAlumni, matchedUserId: null }];
        await expectWrite();
      });
      await t.test(`${type}: missing, mismatched and ambiguous target never writes`, async () => {
        currentMember = requester;
        matches = [targetAlumni];
        await expectBlocked({ relatedMemberName: undefined });
        await expectBlocked({ sourceText: undefined });
        await expectBlocked({ sourceText: `${requesterAlumni.admissionDate?.slice(2, 4)}학번` });
        matches = [];
        await expectBlocked();
        matches = [targetAlumni, targetAlumni];
        await expectBlocked();
      });
      if (type === "legacy") {
        await t.test("legacy: validates the body and self-death identity before insertion", async () => {
          currentMember = requester;
          matches = [targetAlumni];
          await expectBlocked({ deceasedName: "" });
          await expectBlocked({ deceasedRelation: "본인" });
          await expectWrite({ deceasedRelation: "본인", deceasedName: targetAlumni.name });
        });
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
