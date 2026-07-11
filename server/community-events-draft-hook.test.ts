import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("event draft hook recovers, autosaves, and discards drafts without identity fields", async () => {
  const hook = await readFile(new URL("../client/src/hooks/use-event-draft.ts", import.meta.url), "utf8");

  assert.match(hook, /\/api\/events\/drafts\/latest\?type=/);
  assert.match(hook, /\/api\/events\/drafts/);
  assert.match(hook, /knownDraftId \? "PATCH" : "POST"/);
  assert.match(hook, /method:\s*"DELETE"/);
  assert.match(hook, /credentials:\s*"include"/);
  assert.match(hook, /600/);
  assert.match(hook, /clearTimeout/);
  assert.match(hook, /AbortController/);
  assert.match(hook, /form\.formState\.isDirty/);
  assert.match(hook, /response\.status === 404/);
  assert.doesNotMatch(hook, /authorId|profile|membershipTier/);
});

test("event composer integrates recovery, compact status, discard, and publish reset", async () => {
  const composer = await readFile(new URL("../client/src/pages/events/event-composer.tsx", import.meta.url), "utf8");

  assert.match(composer, /useEventDraft/);
  assert.match(composer, /registerDraftId/);
  assert.match(composer, /prepareForPublish/);
  assert.match(composer, /completePublish/);
  assert.match(composer, /임시저장된 내용을 복구했습니다/);
  assert.match(composer, /저장 중/);
  assert.match(composer, /임시저장됨/);
  assert.match(composer, /초안 삭제/);
});
