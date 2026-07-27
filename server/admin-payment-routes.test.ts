import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import session from "express-session";
import type { InsertPayment, Payment } from "@shared/schema";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

const validPayload = {
  userId: 41,
  amount: 50000,
  year: 2026,
  type: "연회비",
  status: "completed",
  receiptUrl: null,
} satisfies InsertPayment;

const storedPayment: Payment = {
  id: 77,
  ...validPayload,
  createdAt: new Date("2026-07-27T00:00:00.000Z"),
};

async function startAdminPaymentServer() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: "admin-payment-contract-secret",
    resave: false,
    saveUninitialized: false,
  }));
  app.post("/__test/admin-session", (req, res) => {
    req.session.userId = 1;
    res.json({ ok: true });
  });

  const server = await registerRoutes(app, {
    getUserForAdmin: async () => ({ isAdmin: true }),
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new TypeError("테스트 서버의 TCP 주소를 확인할 수 없습니다.");
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const sessionResponse = await fetch(`${baseUrl}/__test/admin-session`, { method: "POST" });
  assert.equal(sessionResponse.status, 200);
  const cookie = sessionResponse.headers.get("set-cookie");
  assert.ok(cookie);

  return {
    baseUrl,
    cookie,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test("Given an administrator, When a valid payment is posted, Then it returns the created payment", async (t) => {
  const createPaymentCalls: InsertPayment[] = [];
  t.mock.method(storage, "createPayment", async (payment) => {
    createPaymentCalls.push(payment);
    return storedPayment;
  });
  const server = await startAdminPaymentServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/payments`, {
      method: "POST",
      headers: { cookie: server.cookie, "content-type": "application/json" },
      body: JSON.stringify(validPayload),
    });

    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      id: 77,
      userId: 41,
      amount: 50000,
      year: 2026,
      type: "연회비",
      status: "completed",
      receiptUrl: null,
      createdAt: "2026-07-27T00:00:00.000Z",
    });
    assert.deepEqual(createPaymentCalls, [validPayload]);
  } finally {
    await server.close();
  }
});

test("Given an administrator, When amount is omitted, Then it returns validation errors without writing", async (t) => {
  let createPaymentCalls = 0;
  t.mock.method(storage, "createPayment", async () => {
    createPaymentCalls += 1;
    throw new Error("invalid payment must not be written");
  });
  const server = await startAdminPaymentServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/payments`, {
      method: "POST",
      headers: { cookie: server.cookie, "content-type": "application/json" },
      body: JSON.stringify({
        userId: 41,
        year: 2026,
        type: "연회비",
        status: "completed",
        receiptUrl: null,
      }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.message, "Invalid data");
    assert.ok(Array.isArray(body.errors));
    assert.ok(body.errors.length > 0);
    assert.equal(createPaymentCalls, 0);
  } finally {
    await server.close();
  }
});
