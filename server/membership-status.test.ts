import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import session from "express-session";
import type { Payment } from "@shared/schema";
import { ANNUAL_DUES } from "@shared/schema";
import { koreaCalendarYear } from "./korea-date";
import { registerRoutes } from "./routes";
import { DatabaseStorage, storage } from "./storage";

type MembershipTestServer = Awaited<ReturnType<typeof startMembershipTestServer>>;

async function startMembershipTestServer() {
  const app = express();
  app.use(express.json());
  app.use(session({
    secret: "membership-test-session-secret",
    resave: false,
    saveUninitialized: false,
  }));
  app.post("/__test/session/:userId", (req, res) => {
    req.session.userId = Number(req.params.userId);
    res.json({ ok: true });
  });

  const server = await registerRoutes(app, {
    getUserForAdmin: async () => ({ isAdmin: false }),
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new TypeError("테스트 서버의 TCP 주소를 확인할 수 없습니다.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function createMembershipSession(
  server: MembershipTestServer,
  userId: number,
): Promise<string> {
  const response = await fetch(`${server.baseUrl}/__test/session/${userId}`, { method: "POST" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie;
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 1,
    userId: 77,
    amount: ANNUAL_DUES,
    year: koreaCalendarYear(),
    type: "연회비",
    status: "completed",
    receiptUrl: "https://private.example/receipt",
    createdAt: new Date("2026-06-15T03:00:00.000Z"),
    ...overrides,
  };
}

test("anonymous membership status request returns 401 without storage call", async (t) => {
  let storageCalls = 0;
  t.mock.method(storage, "getMembershipStatus", async () => {
    storageCalls += 1;
    throw new Error("익명 요청은 storage를 호출하면 안 됩니다.");
  });
  const server = await startMembershipTestServer();

  try {
    const response = await fetch(`${server.baseUrl}/api/membership/status`);

    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "로그인이 필요합니다" });
    assert.equal(storageCalls, 0);
  } finally {
    await server.close();
  }
});

test("authenticated membership status uses only the session user id", async (t) => {
  const sessionUserId = 77;
  const requestedUserIds: number[] = [];
  t.mock.method(storage, "getMembershipStatus", async (userId) => {
    requestedUserIds.push(userId);
    return {
      year: koreaCalendarYear(),
      tier: "일반회원",
      isPaid: false,
      paidAmount: 0,
      annualDues: ANNUAL_DUES,
      currentYearPayment: null,
    };
  });
  const server = await startMembershipTestServer();

  try {
    const cookie = await createMembershipSession(server, sessionUserId);
    const response = await fetch(
      `${server.baseUrl}/api/membership/status?userId=999`,
      { headers: { Cookie: cookie } },
    );

    assert.equal(response.status, 200);
    assert.deepEqual(requestedUserIds, [sessionUserId]);
  } finally {
    await server.close();
  }
});

test("membership status errors return the fixed response", async (t) => {
  t.mock.method(console, "error", () => {});
  t.mock.method(storage, "getMembershipStatus", async () => {
    throw new Error("private payment detail");
  });
  const server = await startMembershipTestServer();

  try {
    const cookie = await createMembershipSession(server, 77);
    const response = await fetch(
      `${server.baseUrl}/api/membership/status`,
      { headers: { Cookie: cookie } },
    );

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: "회원 등급 조회에 실패했습니다" });
  } finally {
    await server.close();
  }
});

test("keeps general membership below annual dues at 49,999", async (t) => {
  const subject = new DatabaseStorage();
  t.mock.method(subject, "getPaymentsByUser", async () => [
    payment({ amount: ANNUAL_DUES - 1 }),
  ]);

  const status = await subject.getMembershipStatus(77);

  assert.equal(status.year, koreaCalendarYear());
  assert.equal(status.paidAmount, 49_999);
  assert.equal(status.isPaid, false);
  assert.equal(status.tier, "일반회원");
});

test("aggregates split completed annual dues at the 50,000 boundary", async (t) => {
  const subject = new DatabaseStorage();
  t.mock.method(subject, "getPaymentsByUser", async () => [
    payment({ id: 2, amount: 30_000 }),
    payment({ id: 1, amount: 20_000 }),
  ]);

  const status = await subject.getMembershipStatus(77);

  assert.equal(status.paidAmount, 50_000);
  assert.equal(status.isPaid, true);
  assert.equal(status.tier, "권리회원");
  assert.equal(status.annualDues, ANNUAL_DUES);
});

test("uses the KST next year at the UTC year boundary", async (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-12-31T15:00:00.000Z"),
  });
  const subject = new DatabaseStorage();
  t.mock.method(subject, "getPaymentsByUser", async () => [
    payment({ id: 1, year: 2027, amount: 50_000 }),
    payment({ id: 2, year: 2026, amount: 90_000 }),
  ]);

  const status = await subject.getMembershipStatus(77);

  assert.equal(status.year, 2027);
  assert.equal(status.paidAmount, 50_000);
  assert.equal(status.isPaid, true);
});

test("excludes other years, types, pending, and failed payments", async (t) => {
  const currentYear = koreaCalendarYear();
  const subject = new DatabaseStorage();
  t.mock.method(subject, "getPaymentsByUser", async () => [
    payment({ id: 1, amount: 11_111, year: currentYear - 1 }),
    payment({ id: 2, amount: 12_222, type: "기타" }),
    payment({ id: 3, amount: 13_333, status: "pending" }),
    payment({ id: 4, amount: 14_444, status: "failed" }),
  ]);

  const status = await subject.getMembershipStatus(77);

  assert.equal(status.paidAmount, 0);
  assert.equal(status.isPaid, false);
  assert.equal(status.currentYearPayment, null);
});

test("returns no current year payment when there are no payments", async (t) => {
  const subject = new DatabaseStorage();
  t.mock.method(subject, "getPaymentsByUser", async () => []);

  const status = await subject.getMembershipStatus(77);

  assert.equal(status.paidAmount, 0);
  assert.equal(status.currentYearPayment, null);
});

test("redacts current year payment to createdAt only", async (t) => {
  const latest = payment({
    id: 2,
    amount: 30_000,
    createdAt: new Date("2026-07-01T03:00:00.000Z"),
  });
  const older = payment({
    id: 1,
    amount: 20_000,
    createdAt: new Date("2026-06-01T03:00:00.000Z"),
  });
  const subject = new DatabaseStorage();
  t.mock.method(subject, "getPaymentsByUser", async () => [latest, older]);

  const status = await subject.getMembershipStatus(77);

  assert.deepEqual(status.currentYearPayment, { createdAt: latest.createdAt });
});
