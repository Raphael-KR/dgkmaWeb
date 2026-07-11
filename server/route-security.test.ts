import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { Category, Obituary, Post } from "@shared/schema";
import type { AdminUserLookup } from "./auth-middleware";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

const routesPath = new URL("./routes.ts", import.meta.url);

test("all admin routes are registered after the shared administrator guard", async () => {
  const source = await readFile(routesPath, "utf8");
  const guardIndex = source.indexOf('app.use("/api/admin", requireAdmin)');
  const adminRouteIndexes = Array.from(
    source.matchAll(/app\.(?:get|post|patch|put|delete)\("\/api\/admin\//g),
  ).map((match) => match.index ?? -1);

  assert.ok(guardIndex >= 0);
  assert.equal(adminRouteIndexes.length, 5);
  assert.ok(adminRouteIndexes.every((index) => index > guardIndex));
});

test("payment creation requires an administrator", async () => {
  const source = await readFile(routesPath, "utf8");

  assert.match(source, /app\.post\("\/api\/payments", requireAdmin,/);
});

async function startAuthorizationTestServer(getUserForAdmin: AdminUserLookup) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user-id");
    (req as any).session = userId ? { userId: Number(userId) } : {};
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
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test("protected routes enforce the live session role matrix", async () => {
  const memberId = 2_147_483_646;
  const adminId = 2_147_483_647;
  let lookupCalls = 0;
  const server = await startAuthorizationTestServer(async (userId) => {
    lookupCalls += 1;
    return { isAdmin: userId === adminId };
  });

  try {
    const anonymousAdmin = await fetch(`${server.baseUrl}/api/admin/sync-progress`);
    assert.equal(anonymousAdmin.status, 401);

    const memberAdmin = await fetch(`${server.baseUrl}/api/admin/sync-progress`, {
      headers: { "x-test-user-id": String(memberId) },
    });
    assert.equal(memberAdmin.status, 403);

    const adminAdmin = await fetch(`${server.baseUrl}/api/admin/sync-progress`, {
      headers: { "x-test-user-id": String(adminId) },
    });
    assert.equal(adminAdmin.status, 200);

    const anonymousPayment = await fetch(`${server.baseUrl}/api/payments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(anonymousPayment.status, 401);

    const memberPayment = await fetch(`${server.baseUrl}/api/payments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": String(memberId),
      },
      body: "{}",
    });
    assert.equal(memberPayment.status, 403);
    assert.equal(lookupCalls, 3);
  } finally {
    await server.close();
  }
});

test("obituary APIs require a member session", async (t) => {
  const memberId = 2_147_483_646;
  const obituary: Obituary = {
    id: 1,
    title: "부고",
    deceasedName: "홍길동",
    deceasedRelation: "부친",
    dateOfDeath: "2026-07-11",
    funeralHome: "동국장례식장",
    jangji: "",
    bankAccount: "",
    chiefMourner: "",
    contactNumber: "",
    authorId: memberId,
    createdAt: new Date("2026-07-11T00:00:00Z"),
  };
  let obituaryStorageCalls = 0;
  let createdObituaryInput: Parameters<typeof storage.createObituary>[0] | undefined;
  t.mock.method(storage, "getObituaries", async () => {
    obituaryStorageCalls += 1;
    return [obituary];
  });
  t.mock.method(storage, "getObituary", async () => {
    obituaryStorageCalls += 1;
    return obituary;
  });
  t.mock.method(storage, "createObituary", async (data) => {
    obituaryStorageCalls += 1;
    createdObituaryInput = data;
    return { ...obituary, ...data };
  });
  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));

  try {
    const anonymousList = await fetch(`${server.baseUrl}/api/obituaries`);
    assert.equal(anonymousList.status, 401);

    const anonymousDetail = await fetch(`${server.baseUrl}/api/obituaries/1`);
    assert.equal(anonymousDetail.status, 401);

    const anonymousParse = await fetch(`${server.baseUrl}/api/obituary/parse`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "故 홍길동" }),
    });
    assert.equal(anonymousParse.status, 401);

    const anonymousCreate = await fetch(`${server.baseUrl}/api/obituaries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(anonymousCreate.status, 401);
    assert.equal(obituaryStorageCalls, 0);

    const memberParse = await fetch(`${server.baseUrl}/api/obituary/parse`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": String(memberId),
      },
      body: JSON.stringify({ text: "故 홍길동" }),
    });
    assert.equal(memberParse.status, 200);

    const memberList = await fetch(`${server.baseUrl}/api/obituaries`, {
      headers: { "x-test-user-id": String(memberId) },
    });
    assert.equal(memberList.status, 200);
    assert.equal((await memberList.json()).length, 1);

    const memberDetail = await fetch(`${server.baseUrl}/api/obituaries/1`, {
      headers: { "x-test-user-id": String(memberId) },
    });
    assert.equal(memberDetail.status, 200);

    const memberCreate = await fetch(`${server.baseUrl}/api/obituaries`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": String(memberId),
      },
      body: JSON.stringify({
        title: "새 부고",
        deceasedName: "홍길동",
        deceasedRelation: "부친",
        dateOfDeath: "2026-07-11",
        authorId: 1,
      }),
    });
    assert.equal(memberCreate.status, 201);
    assert.equal(createdObituaryInput?.authorId, memberId);
    assert.equal(obituaryStorageCalls, 3);
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
  ]);
  const createdPosts: Parameters<typeof storage.createPost>[0][] = [];
  t.mock.method(storage, "getCategory", async (id) => categories.get(id));
  t.mock.method(storage, "createPost", async (data) => {
    createdPosts.push(data);
    return {
      id: 1,
      title: data.title,
      content: data.content,
      categoryId: data.categoryId ?? null,
      authorId: data.authorId ?? null,
      isPublished: data.isPublished ?? true,
      imageUrls: data.imageUrls ?? null,
      createdAt: new Date("2026-07-11T00:00:00Z"),
      updatedAt: new Date("2026-07-11T00:00:00Z"),
    } satisfies Post;
  });
  const server = await startAuthorizationTestServer(async () => ({ isAdmin: false }));

  try {
    const request = (body: Record<string, unknown>) => fetch(`${server.baseUrl}/api/posts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": String(memberId),
      },
      body: JSON.stringify({ title: "제목", content: "내용", ...body }),
    });

    for (const body of [
      {},
      { categoryId: 999 },
      { categoryId: 2 },
      { categoryId: 3 },
      { categoryId: 4 },
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
