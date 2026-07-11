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
  assert.match(composer, /isRecovering/);
  assert.match(composer, /다시 시도/);
  assert.match(composer, /isBusy = isParsing \|\| isPublishing \|\| isDiscarding \|\| isRecovering/);
  assert.doesNotMatch(composer, /draftError && <span role="alert"/);
  assert.match(composer, /if \(!hasRecoveryError\)/);
  assert.match(composer, /completePublish/);
  assert.match(composer, /임시저장된 내용을 복구했습니다/);
  assert.match(composer, /저장 중/);
  assert.match(composer, /임시저장됨/);
  assert.match(composer, /초안 삭제/);
});
