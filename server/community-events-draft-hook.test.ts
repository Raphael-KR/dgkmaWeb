import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("event draft hook recovers, autosaves, and discards drafts without identity fields", async () => {
  const [hook, coordinator] = await Promise.all([
    readFile(new URL("../client/src/hooks/use-event-draft.ts", import.meta.url), "utf8"),
    readFile(new URL("../client/src/hooks/event-draft-coordinator.ts", import.meta.url), "utf8"),
  ]);

  assert.match(coordinator, /\/api\/events\/drafts\/latest\?type=/);
  assert.match(coordinator, /\/api\/events\/drafts/);
  assert.match(coordinator, /requestInit\("PATCH"/);
  assert.match(coordinator, /requestInit\("POST"/);
  assert.match(hook, /method:\s*"DELETE"/);
  assert.match(coordinator, /credentials:\s*"include"/);
  assert.match(hook, /600/);
  assert.match(hook, /clearTimeout/);
  assert.match(hook, /AbortController/);
  assert.match(hook, /useFormState/);
  assert.match(hook, /recoveryPromiseRef/);
  assert.match(hook, /recoveryFailedRef/);
  assert.match(hook, /const flushAutosave/);
  assert.match(hook, /await persistDraft\(values, requestEventType, requestGeneration, revision\)/);
  assert.match(hook, /releasePublishResolution/);
  assert.match(hook, /draftIdsByTypeRef\.current\.delete/);
  assert.match(hook, /publishResolutionIdRef\.current = undefined/);
  assert.match(hook, /isDirtyRef\.current/);
  assert.match(coordinator, /response\.status === 404/);
  assert.doesNotMatch(`${hook}\n${coordinator}`, /authorId|profile|membershipTier/);

  const retryStart = hook.indexOf('if (errorKind !== "save")');
  const retryClear = hook.indexOf("clearSaveTimeout()", retryStart);
  const retryPersist = hook.indexOf("persistDraft(", retryStart);
  assert.ok(retryStart >= 0 && retryClear > retryStart && retryPersist > retryClear);

  const discardStart = hook.indexOf("const discardDraft");
  const discardReset = hook.indexOf("form.reset(resetValues)", discardStart);
  const discardClear = hook.indexOf("clearFailureGates()", discardReset);
  assert.ok(discardStart >= 0 && discardReset > discardStart && discardClear > discardReset);
});

test("event composer integrates recovery, compact status, discard, and publish reset", async () => {
  const composer = await readFile(new URL("../client/src/pages/events/event-composer.tsx", import.meta.url), "utf8");

  assert.match(composer, /useEventDraft/);
  assert.match(composer, /registerDraftId/);
  assert.match(composer, /prepareForPublish/);
  assert.match(composer, /flushAutosave/);
  assert.match(composer, /await flushAutosave\(\)/);
  assert.match(composer, /if \(!saved\) \{[\s\S]*현재 화면의 입력은 유지됩니다/);
  assert.match(composer, /new AbortController\(\)/);
  assert.match(composer, /setTimeout\(\(\) => parseController\.abort\(\), 15000\)/);
  assert.match(composer, /signal: parseController\.signal/);
  assert.match(composer, /clearTimeout\(parseTimeout\)/);
  assert.match(composer, /hasMeaningfulDraftInput\(snapshot\)/);
  assert.match(composer, /isRecovering/);
  assert.match(composer, /다시 시도/);
  assert.match(composer, /isBusy = isParsing \|\| isPublishing \|\| isDiscarding \|\| isRecovering/);
  assert.doesNotMatch(composer, /draftError && <span role="alert"/);
  assert.match(composer, /if \(!hasRecoveryError\)/);
  assert.match(composer, /completePublish/);
  assert.match(composer, /releasePublishResolution/);
  assert.match(composer, /if \(conclusiveMessage\)/);
  assert.match(composer, /임시저장된 내용을 복구했습니다/);
  assert.match(composer, /저장 중/);
  assert.match(composer, /임시저장됨/);
  assert.match(composer, /초안 삭제/);
  assert.match(composer, /aria-expanded=\{isReviewOpen\}/);
  assert.match(composer, /aria-controls="event-review"/);
  assert.match(composer, /id="event-review"/);
  assert.match(composer, /registerButtonRef\.current\?\.focus\(\)/);
  assert.match(composer, /disabled=\{isParsing \|\| isPublishing \|\| isPublishResolutionPending \|\| isClosingReview\}/);
});
