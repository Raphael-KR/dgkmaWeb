import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import { readEventSources } from "./event-source-reader";
import { registerRoutes } from "./routes";

const memberId = 2_147_483_646;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user-id");
    (req as any).session = userId ? { userId: Number(userId) } : {};
    next();
  });

  const server = await registerRoutes(app, {
    readEventSources: (input) => readEventSources(input, {
      fetchPage: async () => { throw new Error("테스트는 외부 페이지를 읽지 않습니다"); },
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
    assert.equal(body.draft.details.memo, input);
    assert.deepEqual(body.draft.sourceUrls, ["http://127.0.0.1/private"]);
    assert.deepEqual(body.sources, [{
      url: "http://127.0.0.1/private",
      status: "blocked",
      message: "안전하지 않은 주소는 읽지 않았습니다.",
    }]);
  } finally {
    await server.close();
  }
});

test("event parsing keeps source-reader URLs on obituary drafts", async () => {
  const server = await startServer();
  try {
    const response = await parseEvent(server.baseUrl, {
      eventType: "obituary",
      input: "故김한의 모친상 http://127.0.0.1/private",
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.draft.sourceUrls, ["http://127.0.0.1/private"]);
    assert.equal(body.draft.details.sourceUrl, "http://127.0.0.1/private");
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
