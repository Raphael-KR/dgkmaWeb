import assert from "node:assert/strict";
import test from "node:test";
import {
  canApplyParsedSource,
  collectFormErrorEntries,
  classifyPublishRecovery,
  publishDraftWithRecovery,
  splitEventSource,
} from "../client/src/pages/events/event-composer-logic";

test("keeps URL-only input as a link-only source without text to parse", () => {
  assert.deepEqual(splitEventSource("https://example.com/obituary"), {
    sourceUrls: ["https://example.com/obituary"],
    textOnly: "",
  });
});

test("rejects stale parser results after the source or event type changes", () => {
  assert.equal(canApplyParsedSource({
    activeToken: 2,
    currentEventType: "obituary",
    currentSourceText: "새 원문",
    requestEventType: "obituary",
    requestSourceText: "이전 원문",
    requestToken: 1,
  }), false);
  assert.equal(canApplyParsedSource({
    activeToken: 2,
    currentEventType: "wedding",
    currentSourceText: "원문",
    requestEventType: "obituary",
    requestSourceText: "원문",
    requestToken: 2,
  }), false);
});

test("only treats a recovered published event as a completed publish", () => {
  assert.equal(classifyPublishRecovery({ status: "published" }), "published");
  assert.equal(classifyPublishRecovery({ status: "draft" }), "retain-draft");
  assert.equal(classifyPublishRecovery(undefined), "retain-draft");
});

test("remembers a newly created draft before retry-safe publish recovery", async () => {
  const calls: string[] = [];
  const result = await publishDraftWithRecovery({
    createDraft: async () => {
      calls.push("create");
      return { id: 17 };
    },
    getEvent: async (id) => {
      calls.push(`get:${id}`);
      return { status: "draft" };
    },
    payload: { title: "부고" },
    publishDraft: async (id) => {
      calls.push(`publish:${id}`);
      throw new Error("response lost");
    },
    rememberDraftId: (id) => calls.push(`remember:${id}`),
  });

  assert.deepEqual(calls, ["create", "remember:17", "publish:17", "get:17"]);
  assert.deepEqual(result, { draftId: 17, outcome: "retain-draft" });
});

test("confirms a publish when the publish response is lost", async () => {
  const result = await publishDraftWithRecovery({
    createDraft: async () => ({ id: 18 }),
    getEvent: async () => ({ status: "published" }),
    payload: { title: "부고" },
    publishDraft: async () => { throw new Error("response lost"); },
    rememberDraftId: () => undefined,
  });

  assert.deepEqual(result, { draftId: 18, outcome: "published" });
});

test("collects nested resolver errors into focusable field paths", () => {
  assert.deepEqual(collectFormErrorEntries({
    details: {
      memo: { message: "메모가 너무 깁니다" },
      relationship: { message: "관계를 선택해주세요" },
    },
    sourceText: { message: "원문이 너무 깁니다" },
  }), [
    { message: "메모가 너무 깁니다", path: "details.memo" },
    { message: "관계를 선택해주세요", path: "details.relationship" },
    { message: "원문이 너무 깁니다", path: "sourceText" },
  ]);
});
