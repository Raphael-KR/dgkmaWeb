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
  assert.equal(communityEventDraftSchema.safeParse({ eventType: "obituary" }).success, true);
  assert.equal(communityEventPublishSchema.safeParse({ eventType: "obituary" }).success, false);
  assert.equal(communityEventPublishSchema.safeParse({
    eventType: "wedding",
    title: "결혼 소식",
    eventDate: "2026-08-01",
    relatedMemberName: "김동국",
    details: {},
  }).success, true);
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
    details: { ...base.details, deceasedAge: undefined },
  }).success, false);
});
