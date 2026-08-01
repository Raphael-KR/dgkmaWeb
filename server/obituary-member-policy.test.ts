import assert from "node:assert/strict";
import test from "node:test";
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
