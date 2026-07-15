import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { readEventSources } from "./event-source-reader";
import { createEventParseLimiter, createInMemoryEventParseQuota } from "./event-parse-limiter";
import { registerRoutes } from "./routes";

const memberId = 2_147_483_646;

async function startServer(
  readSources?: typeof readEventSources,
  eventParseTimeoutMs?: number,
) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user-id");
    (req as any).session = userId ? { userId: Number(userId) } : {};
    next();
  });

  const server = await registerRoutes(app, {
    readEventSources: readSources ?? ((input, _dependencies, signal) =>
      readEventSources(input, {
        fetchPage: async () => { throw new Error("테스트는 외부 페이지를 읽지 않습니다"); },
      }, signal)),
    eventParseTimeoutMs,
    eventParseLimiter: createEventParseLimiter({
      windowMs: 60_000,
      max: 10,
      consumeQuota: createInMemoryEventParseQuota(),
    }),
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function parseEvent(
  baseUrl: string,
  body: unknown,
  session: "member" | "anonymous" = "member",
) {
  return fetch(`${baseUrl}/api/events/parse`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(session === "member" ? { "x-test-user-id": String(memberId) } : {}),
    },
    body: JSON.stringify(body),
  });
}

test("event parsing requires an authenticated member session", async () => {
  const server = await startServer();
  try {
    const response = await parseEvent(server.baseUrl, {
      eventType: "wedding",
      input: "김동국 동문 자녀 결혼 안내",
    }, "anonymous");

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "로그인이 필요합니다" });
  } finally {
    await server.close();
  }
});

test("event parsing passes the route abort signal as the reader third argument", async () => {
  let readerArguments: unknown[] | undefined;
  const server = await startServer(async (...args: unknown[]) => {
    readerArguments = args;
    return {
      combinedText: String(args[0]),
      urls: [],
      sources: [],
    };
  });

  try {
    const response = await parseEvent(server.baseUrl, {
      eventType: "other",
      input: "중단 신호 전달 확인",
    });

    assert.equal(response.status, 200);
    assert.equal(readerArguments?.[0], "중단 신호 전달 확인");
    assert.equal(readerArguments?.[1], undefined);
    assert.ok(readerArguments?.[2] instanceof AbortSignal);
  } finally {
    await server.close();
  }
});

test("event parsing returns a conservative text-only member draft", async () => {
  const server = await startServer();
  try {
    const input = "김동국 동문 자녀 결혼 안내";
    const response = await parseEvent(server.baseUrl, { eventType: "wedding", input });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      draft: {
        eventType: "wedding",
        sourceText: input,
        sourceUrls: [],
        details: { memo: input },
      },
      missingFields: [],
      sources: [],
    });
  } finally {
    await server.close();
  }
});

test("event parsing blocks private links while preserving the submitted text", async () => {
  const server = await startServer();
  try {
    const input = "김동국 동문 자녀 결혼 안내 http://127.0.0.1/private";
    const response = await parseEvent(server.baseUrl, { eventType: "wedding", input });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.draft.sourceText, input);
    assert.equal(body.draft.details.memo, "김동국 동문 자녀 결혼 안내");
    assert.deepEqual(body.draft.sourceUrls, []);
    assert.deepEqual(body.sources, [{
      url: "http://127.0.0.1/private",
      status: "blocked",
      message: "안전하지 않은 주소는 읽지 않았습니다.",
    }]);
  } finally {
    await server.close();
  }
});

test("event parsing uses combined public text while preserving the raw source", async () => {
  const input = "개원 안내 https://example.com/opening";
  const server = await startServer(async () => ({
    combinedText: "개원 안내\n장소: 동국한의원",
    urls: ["https://example.com/opening"],
    sources: [{
      url: "https://example.com/opening",
      status: "fetched",
      message: "링크 내용을 불러왔습니다.",
    }],
  }));
  try {
    const response = await parseEvent(server.baseUrl, { eventType: "opening", input });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.draft.sourceText, input);
    assert.equal(body.draft.details.memo, "개원 안내\n장소: 동국한의원");
    assert.deepEqual(body.draft.sourceUrls, ["https://example.com/opening"]);
  } finally {
    await server.close();
  }
});

test("event parsing maps a fetched obituary source without missing fields", async () => {
  const sourceUrl = "https://example.com/obituary";
  const input = `부고 안내 ${sourceUrl}`;
  const server = await startServer(async () => ({
    combinedText: `김동국 동문 부친상
故김한의 (향년 88세)
발인: 2026년 8월 3일 오전 7시
빈소: 동국병원 장례식장 202호`,
    urls: [sourceUrl],
    sources: [{ url: sourceUrl, status: "fetched" }],
  }));

  try {
    const response = await parseEvent(server.baseUrl, { eventType: "obituary", input });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.draft.sourceText, input);
    assert.deepEqual(body.draft.sourceUrls, [sourceUrl]);
    assert.equal(body.draft.details.sourceUrl, sourceUrl);
    assert.equal(body.draft.details.deceasedName, "김한의");
    assert.deepEqual(body.missingFields, []);
  } finally {
    await server.close();
  }
});

test("event parsing reports required obituary fields missing from the source", async () => {
  const server = await startServer(async () => ({
    combinedText: "故김한의\n관계: 모친\n발인: 2026년 8월 3일",
    urls: [],
    sources: [],
  }));

  try {
    const response = await parseEvent(server.baseUrl, {
      eventType: "obituary",
      input: "일부 정보만 있는 부고",
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).missingFields, [
      "details.deceasedAge",
      "details.funeralHome",
    ]);
  } finally {
    await server.close();
  }
});

test("event parsing keeps non-obituary memo within its schema limit", async () => {
  const input = "가".repeat(6_000);
  const server = await startServer();
  try {
    const response = await parseEvent(server.baseUrl, { eventType: "other", input });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.draft.sourceText.length, 6_000);
    assert.equal(body.draft.details.memo.length, 5_000);
  } finally {
    await server.close();
  }
});

test("event parsing does not promote blocked URLs to obituary source fields", async () => {
  const server = await startServer();
  try {
    const response = await parseEvent(server.baseUrl, {
      eventType: "obituary",
      input: "故김한의 모친상 http://127.0.0.1/private",
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.draft.sourceText, "故김한의 모친상 http://127.0.0.1/private");
    assert.deepEqual(body.draft.sourceUrls, []);
    assert.equal(body.draft.details.sourceUrl, undefined);
    assert.equal(body.sources[0]?.status, "blocked");
  } finally {
    await server.close();
  }
});

test("event parsing rejects invalid types and oversized input", async () => {
  const server = await startServer();
  try {
    const invalidType = await parseEvent(server.baseUrl, {
      eventType: "notice",
      input: "안내",
    });
    assert.equal(invalidType.status, 400);

    const oversized = await parseEvent(server.baseUrl, {
      eventType: "other",
      input: "가".repeat(20_001),
    });
    assert.equal(oversized.status, 400);
  } finally {
    await server.close();
  }
});

test("event parsing limits one member to ten requests per minute", async () => {
  const server = await startServer();
  try {
    for (let index = 0; index < 10; index += 1) {
      const response = await parseEvent(server.baseUrl, {
        eventType: "other",
        input: `안내 ${index}`,
      });
      assert.equal(response.status, 200);
    }

    const limited = await parseEvent(server.baseUrl, {
      eventType: "other",
      input: "열한 번째 안내",
    });
    assert.equal(limited.status, 429);
    assert.deepEqual(await limited.json(), { message: "잠시 후 다시 시도해주세요" });
  } finally {
    await server.close();
  }
});

test("event parsing stops source work at the route deadline", async () => {
  let aborted = false;
  const server = await startServer((_input, _dependencies, signal) => new Promise((_resolve, reject) => {
    signal?.addEventListener("abort", () => {
      aborted = true;
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  }), 20);

  try {
    const response = await parseEvent(server.baseUrl, {
      eventType: "other",
      input: "느린 링크",
    });
    assert.equal(response.status, 504);
    assert.deepEqual(await response.json(), { message: "분석 시간이 초과되었습니다" });
    assert.equal(aborted, true);
  } finally {
    await server.close();
  }
});
