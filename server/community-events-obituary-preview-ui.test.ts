import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canApplyPreviewResponse,
  isObituaryPreviewEligible,
} from "../client/src/pages/events/obituary-preview-logic";

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
  assert.match(composer, /currentType === "obituary" && \(/);
  assert.match(composer, /<ObituaryPreview/);
  assert.match(composer, /isRecovered/);

  const fields = await readFile(new URL("../client/src/pages/events/event-fields.tsx", import.meta.url), "utf8");
  assert.match(fields, /미리보기에는 매칭된 동문 명부의 직함이 사용됩니다/);
});
