import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canApplyPreviewResponse,
  isCurrentObituaryPreview,
  isObituaryPreviewEligible,
  missingFieldLabel,
} from "../client/src/pages/events/obituary-preview-logic";
import { canSubmitCommunityEvent } from "../client/src/pages/events/event-composer-logic";

const request = {
  eventType: "obituary" as const,
  draftId: 12,
  contentFingerprint: "saved-obituary",
  requestVersion: 4,
};

test("saved and recovered obituary drafts are preview eligible", () => {
  assert.equal(isObituaryPreviewEligible({ ...request, draftStatus: "saved", isPaused: false }), true);
  assert.equal(isObituaryPreviewEligible({ ...request, draftStatus: "recovered", isPaused: false }), true);
});

test("saving and stale drafts are not preview eligible", () => {
  assert.equal(isObituaryPreviewEligible({ ...request, draftStatus: "saving", isPaused: false }), false);
  assert.equal(canApplyPreviewResponse({ ...request, draftStatus: "saved", eventType: "wedding", isPaused: false }, request), false);
  assert.equal(canApplyPreviewResponse({ ...request, draftStatus: "saved", draftId: 13, isPaused: false }, request), false);
  assert.equal(canApplyPreviewResponse({ ...request, draftStatus: "saved", contentFingerprint: "edited", isPaused: false }, request), false);
  assert.equal(canApplyPreviewResponse({ ...request, draftStatus: "saved", requestVersion: 5, isPaused: false }, request), false);
  assert.equal(canApplyPreviewResponse({ ...request, draftStatus: "saved", isPaused: true }, request), false);
});

test("obituary publish requires a successful preview for the exact settled draft state", () => {
  const success = { draftId: 12, contentFingerprint: "saved-obituary" };

  assert.equal(isCurrentObituaryPreview({
    contentFingerprint: "saved-obituary",
    draftId: 12,
    draftStatus: "saved",
    success,
  }), true);
  assert.equal(isCurrentObituaryPreview({
    contentFingerprint: "saved-obituary",
    draftId: 12,
    draftStatus: "recovered",
    success,
  }), true);
  for (const input of [
    { contentFingerprint: "edited", draftId: 12, draftStatus: "saved" as const, success },
    { contentFingerprint: "saved-obituary", draftId: 13, draftStatus: "saved" as const, success },
    { contentFingerprint: "saved-obituary", draftId: 12, draftStatus: "saving" as const, success },
    { contentFingerprint: "saved-obituary", draftId: 12, draftStatus: "idle" as const, success },
    { contentFingerprint: "saved-obituary", draftId: 12, draftStatus: "saved" as const, success: undefined },
  ]) {
    assert.equal(isCurrentObituaryPreview(input), false);
  }
});

test("submit gate bypasses preview freshness only for ambiguous publish resolution", () => {
  assert.equal(canSubmitCommunityEvent({
    eventType: "obituary",
    isBusy: false,
    isPreviewCurrent: false,
    isPublishResolutionPending: false,
  }), false);
  assert.equal(canSubmitCommunityEvent({
    eventType: "obituary",
    isBusy: false,
    isPreviewCurrent: true,
    isPublishResolutionPending: false,
  }), true);
  assert.equal(canSubmitCommunityEvent({
    eventType: "obituary",
    isBusy: false,
    isPreviewCurrent: false,
    isPublishResolutionPending: true,
  }), true);
  assert.equal(canSubmitCommunityEvent({
    eventType: "obituary",
    isBusy: true,
    isPreviewCurrent: true,
    isPublishResolutionPending: true,
  }), false);
  assert.equal(canSubmitCommunityEvent({
    eventType: "wedding",
    isBusy: false,
    isPreviewCurrent: false,
    isPublishResolutionPending: false,
  }), true);
});

test("every preview missing-field path is presented in Korean with a safe fallback", () => {
  for (const field of [
    "eventType", "title", "eventDate", "location", "relatedMemberName", "contactNumber",
    "accountInfo", "sourceText", "sourceUrls", "details", "deceasedName", "deceasedAge",
    "relationship", "funeralDate", "funeralHome", "memberTitle", "familyContact",
    "burialPlace", "chiefMourner", "graduationClass", "admissionYear", "memberName",
    "membershipTier", "memberPhone", "sourceUrl",
  ]) {
    assert.doesNotMatch(missingFieldLabel(field), /^[A-Za-z][A-Za-z0-9.]*$/);
  }
  assert.equal(missingFieldLabel("internal.unknownPath"), "입력값");
});

test("obituary preview keeps formatting and exposes an accessible icon copy action", async () => {
  const [preview, composer] = await Promise.all([
    readFile(new URL("../client/src/pages/events/obituary-preview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../client/src/pages/events/event-composer.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(preview, /whitespace-pre-wrap/);
  assert.match(preview, /<Copy aria-hidden="true"/);
  assert.match(preview, /aria-label="표준 부고문 복사"/);
  assert.match(preview, /<TooltipContent>표준 부고문 복사<\/TooltipContent>/);
  assert.match(preview, /missingFields/);
  assert.match(preview, /canApplyPreviewResponse/);
  assert.match(preview, /onPreviewSuccessChange/);
  assert.match(preview, /미리보기 다시 불러오기/);
  assert.match(composer, /currentType === "obituary" && \(/);
  assert.match(composer, /<ObituaryPreview/);
  assert.match(composer, /onPreviewSuccessChange=\{setPreviewSuccess\}/);
  assert.match(composer, /isCurrentObituaryPreview/);
  assert.match(composer, /canSubmitCommunityEvent/);
  assert.match(composer, /isRecovered/);

  const fields = await readFile(new URL("../client/src/pages/events/event-fields.tsx", import.meta.url), "utf8");
  assert.match(fields, /미리보기에는 매칭된 동문 명부의 직함이 사용됩니다/);
});
