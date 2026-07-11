import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMUNITY_EVENT_STATUSES,
  COMMUNITY_EVENT_TYPES,
  communityEventDraftSchema,
  communityEventPublishSchema,
} from "@shared/community-events";

test("community event types and statuses are fixed", () => {
  assert.deepEqual(COMMUNITY_EVENT_TYPES, ["obituary", "wedding", "opening", "other"]);
  assert.deepEqual(COMMUNITY_EVENT_STATUSES, ["draft", "published"]);
});

test("obituary drafts accept partial approved fields and reject unknown detail keys", () => {
  const draft = communityEventDraftSchema.safeParse({
    eventType: "obituary",
    details: { deceasedName: "김한의" },
  });

  assert.equal(draft.success, true);
  if (draft.success) {
    assert.deepEqual(draft.data.details, { deceasedName: "김한의" });
  }
  assert.equal(communityEventDraftSchema.safeParse({ eventType: "obituary" }).success, true);
  assert.equal(communityEventDraftSchema.safeParse({
    eventType: "obituary",
    details: { parserConfidence: 0.5 },
  }).success, false);
  assert.equal(communityEventPublishSchema.safeParse({ eventType: "obituary" }).success, false);
});

test("wedding, opening, and other drafts use an optional bounded memo", () => {
  for (const eventType of ["wedding", "opening", "other"] as const) {
    const absentDetails = communityEventDraftSchema.safeParse({ eventType });

    assert.equal(absentDetails.success, true);
    if (absentDetails.success) {
      assert.deepEqual(absentDetails.data.details, {});
    }
    const memo = communityEventDraftSchema.safeParse({
      eventType,
      details: { memo: "  추가 안내  " },
    });
    assert.equal(memo.success, true);
    if (memo.success) {
      assert.deepEqual(memo.data.details, { memo: "추가 안내" });
    }
    assert.equal(communityEventDraftSchema.safeParse({
      eventType,
      details: { memo: "가".repeat(5_000) },
    }).success, true);
    assert.equal(communityEventDraftSchema.safeParse({
      eventType,
      details: { memo: "가".repeat(5_001) },
    }).success, false);
    assert.equal(communityEventDraftSchema.safeParse({
      eventType,
      details: { arbitrary: "초안에 저장하면 안 됨" },
    }).success, false);
  }
});

test("published wedding, opening, and other events use the same memo details contract", () => {
  for (const eventType of ["wedding", "opening", "other"] as const) {
    const base = {
      eventType,
      title: "경조사 소식",
      eventDate: "2026-08-01",
      relatedMemberName: "김동국",
    };
    const withoutDetails = communityEventPublishSchema.safeParse(base);

    assert.equal(withoutDetails.success, true);
    if (withoutDetails.success) {
      assert.deepEqual(withoutDetails.data.details, {});
    }
    assert.equal(communityEventPublishSchema.safeParse({ ...base, details: {} }).success, true);
    const memo = communityEventPublishSchema.safeParse({
      ...base,
      details: { memo: "  축하합니다  " },
    });
    assert.equal(memo.success, true);
    if (memo.success) {
      assert.deepEqual(memo.data.details, { memo: "축하합니다" });
    }
    assert.equal(communityEventPublishSchema.safeParse({
      ...base,
      details: { arbitrary: "게시하면 안 됨" },
    }).success, false);
  }
});

test("draft source input limits are enforced", () => {
  assert.equal(communityEventDraftSchema.safeParse({
    eventType: "other",
    sourceText: "가".repeat(20_000),
  }).success, true);
  assert.equal(communityEventDraftSchema.safeParse({
    eventType: "other",
    sourceText: "가".repeat(20_001),
  }).success, false);
  assert.equal(communityEventDraftSchema.safeParse({
    eventType: "other",
    sourceUrls: ["https://example.com/1", "https://example.com/2", "https://example.com/3"],
  }).success, true);
  assert.equal(communityEventDraftSchema.safeParse({
    eventType: "other",
    sourceUrls: [
      "https://example.com/1",
      "https://example.com/2",
      "https://example.com/3",
      "https://example.com/4",
    ],
  }).success, false);
});

test("published obituaries enforce the writing guide", () => {
  const base = {
    eventType: "obituary" as const,
    title: "부친상",
    eventDate: "2026-07-12",
    location: "동국병원 장례식장 1호실",
    relatedMemberName: "김동국",
    details: {
      deceasedName: "김한의",
      deceasedAge: 88,
      relationship: "부친",
      funeralDate: "2026년 7월 12일(일요일)",
      funeralHome: "동국병원 장례식장 1호실",
    },
  };
  assert.equal(communityEventPublishSchema.safeParse(base).success, true);
  assert.equal(communityEventPublishSchema.safeParse({
    ...base,
    details: { ...base.details, deceasedAge: 1 },
  }).success, true);
  assert.equal(communityEventPublishSchema.safeParse({
    ...base,
    details: { ...base.details, deceasedAge: 130 },
  }).success, true);
  assert.equal(communityEventPublishSchema.safeParse({
    ...base,
    details: { ...base.details, deceasedAge: undefined },
  }).success, false);
  assert.equal(communityEventPublishSchema.safeParse({
    ...base,
    details: { ...base.details, deceasedAge: 0 },
  }).success, false);
  assert.equal(communityEventPublishSchema.safeParse({
    ...base,
    details: { ...base.details, deceasedAge: 131 },
  }).success, false);
  assert.equal(communityEventPublishSchema.safeParse({
    ...base,
    details: { ...base.details, relationship: "배우자" },
  }).success, false);
  assert.equal(communityEventPublishSchema.safeParse({
    ...base,
    details: { ...base.details, relationship: "부친상" },
  }).success, false);
  assert.equal(communityEventPublishSchema.safeParse({
    ...base,
    details: { ...base.details, arbitrary: "게시하면 안 됨" },
  }).success, false);
});
