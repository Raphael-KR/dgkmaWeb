import { ADMIN_STATISTICS_PATH } from "@shared/contracts/admin-statistics";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { Category, Post, User } from "@shared/schema";
import type { AdminUserLookup } from "../middleware/auth";
import { googleSheetsService } from "../integrations/google-sheets";
import { registerRoutes } from "../routes";
import { storage } from "../storage";

async function startAuthorizationTestServer(getUserForAdmin: AdminUserLookup) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user-id");
    req.session = (userId ? { userId: Number(userId) } : {}) as typeof req.session;
    next();
  });

  const server = await registerRoutes(app, { getUserForAdmin });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

test("every admin endpoint rejects anonymous and member sessions", async (t) => {
  const memberId = 2_147_483_646;
  let lookupCalls = 0;
  let categoryLookups = 0;
  let categoryWrites = 0;
  let paymentWrites = 0;
  t.mock.method(storage, "getUser", async () => {
    categoryLookups += 1;
    return { isAdmin: false } as User;
  });
  t.mock.method(storage, "createCategory", async () => {
    categoryWrites += 1;
    throw new Error("category writes must not run for unauthorized requests");
  });
  t.mock.method(storage, "createPayment", async () => {
    paymentWrites += 1;
    throw new Error("payment writes must not run for unauthorized requests");
  });
  const server = await startAuthorizationTestServer(async (userId) => {
    lookupCalls += 1;
    return { isAdmin: userId !== memberId };
  });

  try {
    const adminEndpoints = [
      { method: "GET", path: ADMIN_STATISTICS_PATH },
      { method: "GET", path: "/api/admin/pending-registrations" },
      { method: "PATCH", path: "/api/admin/pending-registrations/1", body: "{}" },
      { method: "DELETE", path: "/api/admin/pending-registrations/1" },
      { method: "POST", path: "/api/admin/members/1/cancel-approval", body: "{}" },
      { method: "POST", path: "/api/admin/sync-alumni/preview" },
      { method: "POST", path: "/api/admin/sync-alumni" },
      { method: "GET", path: "/api/admin/test-google-sheets" },
      { method: "POST", path: "/api/categories", body: "{}", legacyGuard: true },
      { method: "POST", path: "/api/payments", body: "{}" },
    ];

    for (const endpoint of adminEndpoints) {
      const anonymous = await fetch(`${server.baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers: endpoint.body ? { "content-type": "application/json" } : undefined,
        body: endpoint.body,
      });
      assert.equal(anonymous.status, 401, `${endpoint.method} ${endpoint.path}`);

      const member = await fetch(`${server.baseUrl}${endpoint.path}`, {
        method: endpoint.method,
        headers: {
          ...(endpoint.body ? { "content-type": "application/json" } : {}),
          "x-test-user-id": String(memberId),
        },
        body: endpoint.body,
      });
      assert.equal(member.status, 403, `${endpoint.method} ${endpoint.path}`);
    }

    assert.equal(paymentWrites, 0);
    assert.equal(categoryWrites, 0);
    assert.equal(categoryLookups, 1);
    assert.equal(lookupCalls, adminEndpoints.filter((endpoint) => !endpoint.legacyGuard).length);
  } finally {
    await server.close();
  }
});

test("Google Sheets connection failures return a fixed Korean response without the source exception", async (t) => {
  const sourceError = "sheets oauth credential secret leaked";
  t.mock.method(googleSheetsService, "testConnection", async () => {
    throw new Error(sourceError);
  });
  const server = await startAuthorizationTestServer(async () => ({ isAdmin: true }));

  try {
    const response = await fetch(`${server.baseUrl}/api/admin/test-google-sheets`, {
      headers: { "x-test-user-id": "1" },
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.deepEqual(body, {
      connected: false,
      message: "Google Sheets 연결에 실패했습니다. 잠시 후 다시 시도해주세요",
    });
  } finally {
    await server.close();
  }
});

test("post and notice endpoints require a member session before storage access", async () => {
  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));
  try {
    for (const [method, path] of [
      ["GET", "/api/posts"],
      ["GET", "/api/posts/search?q=notice"],
      ["GET", "/api/posts/1"],
      ["GET", "/api/posts/1/comments"],
      ["POST", "/api/posts/notices/drafts/obituary"],
      ["POST", "/api/posts/notices/1/generate"],
      ["POST", "/api/posts/notices/1/publish"],
    ]) {
      const response = await fetch(`${server.baseUrl}${path}`, { method });
      assert.equal(response.status, 401, path);
    }
  } finally {
    await server.close();
  }
});

test("post creation enforces the approved category policy before writing", async (t) => {
  const memberId = 2_147_483_646;
  const category = (id: number, name: string, isActive = true): Category => ({
    id,
    name,
    displayName: name,
    color: "#000000",
    badgeVariant: "secondary",
    isActive,
    sortOrder: id,
    createdAt: new Date("2026-07-11T00:00:00Z"),
    updatedAt: new Date("2026-07-11T00:00:00Z"),
  });
  const categories = new Map<number, Category>([
    [1, category(1, "notice")],
    [2, category(2, "all")],
    [3, category(3, "free", false)],
    [4, category(4, "market")],
    [5, category(5, "obituary")],
    [6, category(6, "celebration")],
  ]);
  const createdPosts: Parameters<typeof storage.createPost>[0][] = [];
  t.mock.method(storage, "getCategory", async (id: number) => categories.get(id));
  t.mock.method(storage, "createPost", async (...[data]: Parameters<typeof storage.createPost>) => {
    createdPosts.push(data);
    return {
      id: 1,
      title: data.title,
      content: data.content,
      categoryId: data.categoryId ?? null,
      authorId: data.authorId ?? null,
      isPublished: data.isPublished ?? true,
      isHidden: false,
      imageUrls: data.imageUrls ?? null,
      eventData: null,
      sourceText: null,
      revision: 0,
      publishedAt: null,
      createdAt: new Date("2026-07-11T00:00:00Z"),
      updatedAt: new Date("2026-07-11T00:00:00Z"),
    } satisfies Post;
  });
  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));

  try {
    const request = (body: Record<string, unknown>) =>
      fetch(`${server.baseUrl}/api/posts`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-test-user-id": String(memberId),
        },
        body: JSON.stringify({
          title: "제목",
          content: {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "내용" }] }],
          },
          ...body,
        }),
      });

    for (const body of [
      {},
      { categoryId: 999 },
      { categoryId: 2 },
      { categoryId: 3 },
      { categoryId: 4 },
      { categoryId: 5 },
      { categoryId: 6 },
    ]) {
      const response = await request(body);
      assert.equal(response.status, 400);
    }
    assert.equal(createdPosts.length, 0);

    const approved = await request({ categoryId: 1, authorId: 1 });
    assert.equal(approved.status, 201);
    assert.equal(createdPosts.length, 1);
    assert.equal(createdPosts[0].categoryId, 1);
    assert.equal(createdPosts[0].authorId, memberId);
  } finally {
    await server.close();
  }
});
