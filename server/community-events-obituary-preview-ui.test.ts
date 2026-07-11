import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canApplyPreviewResponse } from "../client/src/pages/events/obituary-preview-logic";

const request = {
  eventType: "obituary" as const,
  draftId: 12,
  contentFingerprint: "saved-obituary",
  requestVersion: 4,
};

test("preview responses apply only to the active obituary draft and saved content", () => {
  assert.equal(canApplyPreviewResponse({ ...request, isPaused: false }, request), true);
  assert.equal(canApplyPreviewResponse({ ...request, eventType: "wedding", isPaused: false }, request), false);
  assert.equal(canApplyPreviewResponse({ ...request, draftId: 13, isPaused: false }, request), false);
  assert.equal(canApplyPreviewResponse({ ...request, contentFingerprint: "edited", isPaused: false }, request), false);
  assert.equal(canApplyPreviewResponse({ ...request, requestVersion: 5, isPaused: false }, request), false);
  assert.equal(canApplyPreviewResponse({ ...request, isPaused: true }, request), false);
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
});
