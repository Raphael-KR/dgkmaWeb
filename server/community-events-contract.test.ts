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

test("drafts may be incomplete but published events require common fields", () => {
  const draft = communityEventDraftSchema.safeParse({
    eventType: "obituary",
    details: { parserConfidence: 0.5 },
  });

  assert.equal(draft.success, true);
  if (draft.success) {
    assert.deepEqual(draft.data.details, { parserConfidence: 0.5 });
  }
  assert.equal(communityEventPublishSchema.safeParse({ eventType: "obituary" }).success, false);
});

test("published non-obituary events accept only empty details", () => {
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
