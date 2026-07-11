import assert from "node:assert/strict";
import test from "node:test";
import type { CommunityEventDraftInput } from "@shared/community-events";
import type { AlumniRecord, MembershipStatus, User } from "@shared/schema";
import { admissionYearLabel, assembleObituaryPreview } from "./obituary-preview";

const draft: Extract<CommunityEventDraftInput, { eventType: "obituary" }> = {
  eventType: "obituary",
  title: "부고",
  eventDate: "2026-08-01",
  location: "장례식장",
  relatedMemberName: "입력 이름",
  contactNumber: "입력 전화",
  accountInfo: "  공통은행 123  ",
  sourceText: undefined,
  sourceUrls: [],
  details: {
    deceasedName: "김한의",
    deceasedAge: 88,
    relationship: "부친",
    funeralDate: "2026년 8월 3일",
    funeralHome: "동국장례식장",
    accountInfo: "상세계좌",
  },
};
const user: User = {
  id: 1,
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
  activityRegion: null,
  createdAt: null,
  updatedAt: null,
};
const alumni: AlumniRecord = {
  id: 1,
  department: "한의학과",
  generation: "8기",
  name: "김동국",
  admissionDate: "1986-03-02",
  graduationDate: null,
  address: null,
  mobile: "  010-2222-3333  ",
  phone: null,
  group: null,
  status: null,
  alumniPosition: null,
  memo: null,
  isMatched: true,
  matchedUserId: 1,
};
const membership: MembershipStatus = {
  year: 2026,
  tier: "권리회원",
  isPaid: true,
  paidAmount: 50_000,
  annualDues: 50_000,
  currentYearPayment: null,
};

test("admission year labels require a real calendar date", () => {
  assert.equal(admissionYearLabel("1986-03-02"), "86학번");
  assert.equal(admissionYearLabel("1986년 3월 2일"), "86학번");
  assert.equal(admissionYearLabel("1986-02-31"), undefined);
  assert.equal(admissionYearLabel("1986"), undefined);
  assert.equal(admissionYearLabel("알 수 없음"), undefined);
});

test("empty detail account falls back to the trimmed common account", () => {
  const result = assembleObituaryPreview({
    draft: { ...draft, details: { ...draft.details, accountInfo: "   " } },
    user,
    alumni,
    membership,
  });

  assert.equal(result.input?.accountInfo, "공통은행 123");
});

test("detail account takes priority and both account sources are trimmed", () => {
  const result = assembleObituaryPreview({
    draft: { ...draft, details: { ...draft.details, accountInfo: "  상세은행 456  " } },
    user,
    alumni,
    membership,
  });

  assert.equal(result.input?.accountInfo, "상세은행 456");
});

test("member phone uses the nullish user-phone priority without fabrication", () => {
  const alumniFallback = assembleObituaryPreview({ draft, user, alumni, membership });
  assert.equal(alumniFallback.input?.memberPhone, "010-2222-3333");

  const userPriority = assembleObituaryPreview({
    draft,
    user: { ...user, phoneNumber: "  010-1111-0000  " },
    alumni,
    membership,
  });
  assert.equal(userPriority.input?.memberPhone, "010-1111-0000");

  const blankUserPhone = assembleObituaryPreview({
    draft,
    user: { ...user, phoneNumber: "   " },
    alumni,
    membership,
  });
  assert.equal(blankUserPhone.input, undefined);
  assert.ok(blankUserPhone.missingFields.includes("memberPhone"));
});

test("membership tier must be one of the server-approved values", () => {
  const result = assembleObituaryPreview({
    draft,
    user,
    alumni,
    membership: { ...membership, tier: "관리자" as MembershipStatus["tier"] },
  });

  assert.equal(result.input, undefined);
  assert.ok(result.missingFields.includes("membershipTier"));
});
