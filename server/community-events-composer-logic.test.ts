import assert from "node:assert/strict";
import test from "node:test";
import {
  canApplyDraftResult,
  canApplyParsedSource,
  conclusivePublishErrorMessage,
  collectFormErrorEntries,
  classifyPublishRecovery,
  ConclusivePublishError,
  hasMeaningfulDraftInput,
  mergeParsedEventDraft,
  publishDraftWithRecovery,
  requestEventPublish,
  splitEventSource,
} from "../client/src/pages/events/event-composer-logic";

test("parsed event drafts fill nested blanks without replacing user edits", () => {
  const merged = mergeParsedEventDraft(
    {
      eventType: "obituary",
      sourceText: "사용자가 붙여넣은 원문 https://example.com/notice",
      sourceUrls: [],
      location: "직접 입력한 빈소",
      details: { deceasedName: "직접 입력한 이름", funeralDate: "   " },
    },
    {
      eventType: "obituary",
      sourceText: "원격 페이지에서 추출한 내용",
      sourceUrls: ["https://example.com/notice"],
      location: "파싱한 빈소",
      details: {
        deceasedName: "파싱한 이름",
        deceasedAge: 88,
        funeralDate: "2026년 6월 12일",
      },
    },
  );

  assert.equal(merged.sourceText, "사용자가 붙여넣은 원문 https://example.com/notice");
  assert.deepEqual(merged.sourceUrls, ["https://example.com/notice"]);
  assert.equal(merged.location, "직접 입력한 빈소");
  assert.deepEqual(merged.details, {
    deceasedName: "직접 입력한 이름",
    deceasedAge: 88,
    funeralDate: "2026년 6월 12일",
  });
});

test("parsed source fills only missing draft values", async () => {
  const logic = await import("../client/src/pages/events/event-composer-logic");
  const mergeMissingDraftValues = (logic as unknown as {
    mergeMissingDraftValues?: (current: Record<string, unknown>, parsed: Record<string, unknown>) => Record<string, unknown>;
  }).mergeMissingDraftValues;
  assert.equal(typeof mergeMissingDraftValues, "function");
  if (!mergeMissingDraftValues) return;
  assert.deepEqual(mergeMissingDraftValues(
    { memo: "직접 수정한 내용", location: "  " },
    { memo: "파싱한 내용", location: "파싱한 장소", contact: "010-0000-0000" },
  ), {
    memo: "직접 수정한 내용",
    location: "파싱한 장소",
    contact: "010-0000-0000",
  });
});

test("only autosaves meaningful draft input", () => {
  assert.equal(hasMeaningfulDraftInput({ eventType: "obituary", sourceUrls: [], details: {} }), false);
  assert.equal(hasMeaningfulDraftInput({ eventType: "obituary", sourceText: "   ", sourceUrls: [], details: {} }), false);
  assert.equal(hasMeaningfulDraftInput({ eventType: "obituary", title: "부고", sourceUrls: [], details: {} }), true);
  assert.equal(hasMeaningfulDraftInput({ eventType: "wedding", sourceUrls: [], details: { memo: "소식" } }), true);
});

test("only applies draft results for the active type and generation", () => {
  assert.equal(canApplyDraftResult({
    activeEventType: "obituary",
    activeGeneration: 3,
    requestEventType: "obituary",
    requestGeneration: 3,
  }), true);
  assert.equal(canApplyDraftResult({
    activeEventType: "wedding",
    activeGeneration: 4,
    requestEventType: "obituary",
    requestGeneration: 3,
  }), false);
});

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
  assert.equal(classifyPublishRecovery({ status: "draft" }), "ambiguous");
  assert.equal(classifyPublishRecovery(undefined), "ambiguous");
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
  assert.deepEqual(result, { draftId: 17, outcome: "ambiguous" });
});

test("ambiguous publish retry keeps resolving the same event without another draft", async () => {
  let createCalls = 0;
  const publishedIds: number[] = [];
  const first = await publishDraftWithRecovery({
    createDraft: async () => ({ id: ++createCalls + 40 }),
    getEvent: async () => { throw new Error("status unavailable"); },
    payload: { title: "부고" },
    publishDraft: async (id) => {
      publishedIds.push(id);
      throw new Error("response lost");
    },
    rememberDraftId: () => undefined,
  });
  const retry = await publishDraftWithRecovery({
    createDraft: async () => ({ id: ++createCalls + 40 }),
    draftId: first.draftId,
    getEvent: async () => { throw new Error("status unavailable"); },
    payload: { title: "부고" },
    publishDraft: async (id) => {
      publishedIds.push(id);
      throw new Error("response lost again");
    },
    rememberDraftId: () => undefined,
  });

  assert.deepEqual(first, { draftId: 41, outcome: "ambiguous" });
  assert.deepEqual(retry, { draftId: 41, outcome: "ambiguous" });
  assert.equal(createCalls, 1);
  assert.deepEqual(publishedIds, [41, 41]);
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

test("a conclusive publish rejection does not enter ambiguous recovery", async () => {
  let getCalls = 0;

  await assert.rejects(() => publishDraftWithRecovery({
    createDraft: async () => ({ id: 19 }),
    draftId: 19,
    getEvent: async () => {
      getCalls += 1;
      return { status: "draft" };
    },
    payload: { title: "부고" },
    publishDraft: async () => {
      throw new ConclusivePublishError(400, { message: "게시 정보가 올바르지 않습니다." });
    },
    rememberDraftId: () => undefined,
  }), /올바르지 않습니다/);
  assert.equal(getCalls, 0);
});

test("conclusive publish errors preserve status and map missing fields to Korean", async () => {
  let captured: unknown;
  try {
    await requestEventPublish(
      async () => new Response(JSON.stringify({
        message: "부고문 게시에 필요한 정보가 부족합니다",
        missingFields: ["graduationClass", "internal.englishKey"],
      }), { status: 400, headers: { "content-type": "application/json" } }),
      17,
      { eventType: "obituary" },
    );
  } catch (error) {
    captured = error;
  }

  assert.ok(captured instanceof ConclusivePublishError);
  assert.equal(captured.status, 400);
  assert.deepEqual(captured.body, {
    message: "부고문 게시에 필요한 정보가 부족합니다",
    missingFields: ["graduationClass", "internal.englishKey"],
  });
  const message = conclusivePublishErrorMessage(captured);
  assert.equal(message, "부고문 게시에 필요한 정보가 부족합니다 (졸업 기수, 입력값)");
  assert.doesNotMatch(message, /graduationClass|internal|englishKey/);
});

test("publish error message uses a safe Korean fallback for malformed bodies", () => {
  assert.equal(
    conclusivePublishErrorMessage(new ConclusivePublishError(422, { missingFields: ["unknown"] })),
    "게시 요청이 거절되었습니다. (입력값)",
  );
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
