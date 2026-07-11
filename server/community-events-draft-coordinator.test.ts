import assert from "node:assert/strict";
import test from "node:test";
import {
  clearedDraftFailureState,
  draftFingerprint,
  planImmediateSaveRetry,
  publishFailureResolution,
  publishResolutionLock,
  shouldResumeAutosave,
  saveEventDraftWithFallback,
  shouldApplyRecoveredDraft,
  waitForDraftReadiness,
} from "../client/src/hooks/event-draft-coordinator";

const obituaryDraft = {
  eventType: "obituary" as const,
  title: "동문 부고",
  sourceUrls: [],
  details: {},
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(status === 204 ? undefined : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("rejects recovery after a user edit during a slow request", () => {
  const startFingerprint = draftFingerprint({ eventType: "obituary", sourceUrls: [], details: {} });
  const currentFingerprint = draftFingerprint({ ...obituaryDraft, title: "사용자가 입력한 제목" });

  assert.equal(shouldApplyRecoveredDraft({
    activeEventType: "obituary",
    activeGeneration: 2,
    currentFingerprint,
    isDirty: true,
    requestEventType: "obituary",
    requestGeneration: 2,
    responseEventType: "obituary",
    startFingerprint,
  }), false);
  assert.equal(shouldApplyRecoveredDraft({
    activeEventType: "obituary",
    activeGeneration: 2,
    currentFingerprint,
    isDirty: false,
    requestEventType: "obituary",
    requestGeneration: 2,
    responseEventType: "obituary",
    startFingerprint,
  }), false);
});

test("rejects a wrong-type recovery response even when the form is unchanged", () => {
  const unchanged = draftFingerprint({ eventType: "obituary", sourceUrls: [], details: {} });

  assert.equal(shouldApplyRecoveredDraft({
    activeEventType: "obituary",
    activeGeneration: 2,
    currentFingerprint: unchanged,
    isDirty: false,
    requestEventType: "obituary",
    requestGeneration: 2,
    responseEventType: "wedding",
    startFingerprint: unchanged,
  }), false);
});

test("publish readiness waits for recovery before reading the active save and draft id", async () => {
  const order: string[] = [];
  let resolveRecovery!: () => void;
  let resolveSave!: () => void;
  let draftId: number | undefined;
  const recovery = new Promise<void>((resolve) => { resolveRecovery = resolve; }).then(() => {
    order.push("recovery");
    draftId = 41;
  });
  const save = new Promise<void>((resolve) => { resolveSave = resolve; }).then(() => {
    order.push("save");
  });

  const ready = waitForDraftReadiness({
    getDraftId: () => draftId,
    getSavePromise: () => {
      order.push("read-save");
      return save;
    },
    recoveryPromise: recovery,
  });

  await Promise.resolve();
  assert.deepEqual(order, []);
  resolveRecovery();
  await recovery;
  assert.deepEqual(order, ["recovery", "read-save"]);
  resolveSave();
  assert.equal(await ready, 41);
  assert.deepEqual(order, ["recovery", "read-save", "save"]);
});

test("successful discard clears recovery and save failure gates", () => {
  assert.deepEqual(clearedDraftFailureState(), {
    errorKind: undefined,
    errorMessage: undefined,
    recoveryFailed: false,
    status: "idle",
  });
});

test("immediate save retry advances revision and clears stale status even without input", () => {
  assert.deepEqual(planImmediateSaveRetry({ currentRevision: 4, hasMeaningfulInput: true }), {
    revision: 5,
    shouldSave: true,
    status: "saving",
  });
  assert.deepEqual(planImmediateSaveRetry({ currentRevision: 4, hasMeaningfulInput: false }), {
    revision: 5,
    shouldSave: false,
    status: "idle",
  });
});

test("ambiguous publish locks autosave to the same event until resolution", () => {
  const lock = publishResolutionLock("ambiguous", 37);

  assert.equal(lock, 37);
  assert.equal(shouldResumeAutosave(lock), false);
  assert.equal(publishResolutionLock("published", 37), undefined);
  assert.equal(shouldResumeAutosave(undefined), true);
});

test("conclusive publish retry clears the pinned ID and resumes autosave", () => {
  assert.deepEqual(publishFailureResolution(37, "conclusive"), {
    draftId: undefined,
    publishResolutionId: undefined,
    shouldResumeAutosave: true,
  });
});

test("ambiguous publish retry keeps the pinned ID and autosave lock", () => {
  assert.deepEqual(publishFailureResolution(37, "ambiguous"), {
    draftId: 37,
    publishResolutionId: 37,
    shouldResumeAutosave: false,
  });
});

test("no-ID save checks latest and PATCHes an existing draft", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${url}`);
    if (calls.length === 1) return jsonResponse({ ...obituaryDraft, id: 21 });
    return jsonResponse({ ...obituaryDraft, id: 21 });
  };

  const result = await saveEventDraftWithFallback({
    eventType: "obituary",
    fetcher,
    payload: obituaryDraft,
  });

  assert.equal(result.id, 21);
  assert.deepEqual(calls, [
    "GET /api/events/drafts/latest?type=obituary",
    "PATCH /api/events/drafts/21",
  ]);
});

test("retry after a lost POST response discovers and PATCHes without a second POST", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${url}`);
    if (calls.length === 1) return jsonResponse({ message: "missing" }, 404);
    if (calls.length === 2) throw new TypeError("response lost");
    if (calls.length === 3) return jsonResponse({ ...obituaryDraft, id: 22 });
    return jsonResponse({ ...obituaryDraft, id: 22 });
  };

  await assert.rejects(() => saveEventDraftWithFallback({
    eventType: "obituary",
    fetcher,
    payload: obituaryDraft,
  }), /response lost/);
  const retry = await saveEventDraftWithFallback({
    eventType: "obituary",
    fetcher,
    payload: obituaryDraft,
  });

  assert.equal(retry.id, 22);
  assert.equal(calls.filter((call) => call === "POST /api/events/drafts").length, 1);
  assert.deepEqual(calls, [
    "GET /api/events/drafts/latest?type=obituary",
    "POST /api/events/drafts",
    "GET /api/events/drafts/latest?type=obituary",
    "PATCH /api/events/drafts/22",
  ]);
});

test("PATCH 404 recovers latest draft and retries PATCH once", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${url} ${init?.credentials}`);
    if (calls.length === 1) return jsonResponse({ message: "missing" }, 404);
    if (calls.length === 2) return jsonResponse({ ...obituaryDraft, id: 9 });
    return jsonResponse({ ...obituaryDraft, id: 9 });
  };

  const result = await saveEventDraftWithFallback({
    draftId: 7,
    eventType: "obituary",
    fetcher,
    payload: obituaryDraft,
  });

  assert.equal(result.id, 9);
  assert.deepEqual(calls, [
    "PATCH /api/events/drafts/7 include",
    "GET /api/events/drafts/latest?type=obituary include",
    "PATCH /api/events/drafts/9 include",
  ]);
});

test("PATCH 404 creates once when no latest draft exists", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${url} ${init?.credentials}`);
    if (calls.length < 3) return jsonResponse({ message: "missing" }, 404);
    return jsonResponse({ ...obituaryDraft, id: 12 }, 201);
  };

  const result = await saveEventDraftWithFallback({
    draftId: 7,
    eventType: "obituary",
    fetcher,
    payload: obituaryDraft,
  });

  assert.equal(result.id, 12);
  assert.deepEqual(calls, [
    "PATCH /api/events/drafts/7 include",
    "GET /api/events/drafts/latest?type=obituary include",
    "POST /api/events/drafts include",
  ]);
});

test("PATCH fallback stops after one recovered retry", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls += 1;
    if (calls === 2) return jsonResponse({ ...obituaryDraft, id: 9 });
    return jsonResponse({ message: "missing" }, 404);
  };

  await assert.rejects(() => saveEventDraftWithFallback({
    draftId: 7,
    eventType: "obituary",
    fetcher,
    payload: obituaryDraft,
  }), /missing/);
  assert.equal(calls, 3);
});

test("non-404 PATCH errors do not run fallback requests", async () => {
  const calls: string[] = [];
  const fetcher = async (url: string, init?: RequestInit) => {
    calls.push(`${init?.method} ${url}`);
    return jsonResponse({ message: "server error" }, 500);
  };

  await assert.rejects(() => saveEventDraftWithFallback({
    draftId: 7,
    eventType: "obituary",
    fetcher,
    payload: obituaryDraft,
  }), /server error/);
  assert.deepEqual(calls, ["PATCH /api/events/drafts/7"]);
});

test("rejects created, updated, and recovered drafts with the wrong event type", async () => {
  const wrongType = {
    eventType: "wedding",
    id: 15,
    sourceUrls: [],
    details: {},
  };

  let createCall = 0;
  await assert.rejects(() => saveEventDraftWithFallback({
    eventType: "obituary",
    fetcher: async () => {
      createCall += 1;
      return createCall === 1
        ? jsonResponse({ message: "missing" }, 404)
        : jsonResponse(wrongType, 201);
    },
    payload: obituaryDraft,
  }), /유형/);
  assert.equal(createCall, 2);
  await assert.rejects(() => saveEventDraftWithFallback({
    draftId: 7,
    eventType: "obituary",
    fetcher: async () => jsonResponse(wrongType),
    payload: obituaryDraft,
  }), /유형/);

  let recoveryCall = 0;
  await assert.rejects(() => saveEventDraftWithFallback({
    draftId: 7,
    eventType: "obituary",
    fetcher: async () => {
      recoveryCall += 1;
      return recoveryCall === 1
        ? jsonResponse({ message: "missing" }, 404)
        : jsonResponse(wrongType);
    },
    payload: obituaryDraft,
  }), /유형/);
  assert.equal(recoveryCall, 2);
});
