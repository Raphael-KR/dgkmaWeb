import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { AdminUserLookup } from "./auth-middleware";
import { registerRoutes } from "./routes";

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

test("obituary APIs require a member session", async () => {
  const memberId = 2_147_483_646;
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

    const memberParse = await fetch(`${server.baseUrl}/api/obituary/parse`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-user-id": String(memberId),
      },
      body: JSON.stringify({ text: "故 홍길동" }),
    });
    assert.equal(memberParse.status, 200);
  } finally {
    await server.close();
  }
});
