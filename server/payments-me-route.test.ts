import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import type { Payment } from "@shared/schema";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

async function startPaymentsMeServer() {
  const app = express();
  app.use((req, _res, next) => {
    const userId = req.header("x-test-user-id");
    (req as any).session = userId ? { userId: Number(userId) } : {};
    next();
  });
  const server = await registerRoutes(app, {
    getUserForAdmin: async () => ({ isAdmin: false }),
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

test("payment history is session-bound and exposes only the profile DTO", async (t) => {
  const requestedUserIds: number[] = [];
  const payment: Payment = {
    id: 9,
    userId: 77,
    year: 2026,
    type: "연회비",
    status: "completed",
    amount: 50_000,
    receiptUrl: "https://private.example/receipt",
    createdAt: new Date("2026-07-27T00:00:00.000Z"),
  };
  t.mock.method(storage, "getPaymentsByUser", async (userId) => {
    requestedUserIds.push(userId);
    return [payment];
  });
  const server = await startPaymentsMeServer();

  try {
    const anonymous = await fetch(`${server.baseUrl}/api/payments/me`);
    assert.equal(anonymous.status, 401);
    assert.deepEqual(requestedUserIds, []);

    const response = await fetch(`${server.baseUrl}/api/payments/me?userId=999`, {
      headers: { "x-test-user-id": "77" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(requestedUserIds, [77]);
    assert.deepEqual(await response.json(), [{
      id: 9,
      year: 2026,
      type: "연회비",
      status: "completed",
      amount: 50_000,
      createdAt: "2026-07-27T00:00:00.000Z",
    }]);
  } finally {
    await server.close();
  }
});
