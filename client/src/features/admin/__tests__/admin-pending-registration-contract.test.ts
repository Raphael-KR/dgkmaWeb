import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import session from "express-session";
import type { PendingRegistration } from "../../../../../server/db/schema";
import { registerRoutes } from "../../../../../server/routes";
import { storage } from "../../../../../server/storage";

test("admin pending list and approval responses expose only the approved DTO", async (t) => {
  const createdAt = new Date("2026-07-13T01:02:03.000Z");
  const userData = {
    kakaoId: "sensitive-kakao-id",
    email: "pending@example.com",
    name: "대기회원",
    phoneNumber: "+82 10-1234-5678",
    profileImage: "https://cdn.example.com/sensitive.jpg",
    birthday: "0101",
    birthdayType: "SOLAR" as const,
    isLeapMonth: false,
    conflictReason: "not_found" as const,
  };
  const registration: PendingRegistration = {
    id: 17,
    kakaoId: userData.kakaoId,
    email: userData.email,
    name: userData.name,
    userData,
    status: "pending",
    createdAt,
  };
  const approvedRegistration = { ...registration, status: "approved" };
  t.mock.method(storage, "getPendingRegistrations", async () => [registration]);

  const app = express();
  app.use(express.json());
  app.use(session({ secret: "admin-contract-secret", resave: false, saveUninitialized: false }));
  app.post("/__test/admin-session", (req, res) => {
    req.session.userId = 1;
    res.json({ ok: true });
  });
  const server = await registerRoutes(app, {
    getUserForAdmin: async () => ({ isAdmin: true }),
    pendingRegistrationStorage: {
      approvePendingRegistration: async () => approvedRegistration,
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const sessionResponse = await fetch(`${baseUrl}/__test/admin-session`, { method: "POST" });
    const cookie = sessionResponse.headers.get("set-cookie");
    assert.ok(cookie);

    const listResponse = await fetch(`${baseUrl}/api/admin/pending-registrations`, {
      headers: { cookie },
    });
    assert.equal(listResponse.status, 200);
    assert.deepEqual(await listResponse.json(), [
      {
        id: 17,
        name: "대기회원",
        email: "pending@example.com",
        status: "pending",
        createdAt: createdAt.toISOString(),
      },
    ]);

    const approvalResponse = await fetch(`${baseUrl}/api/admin/pending-registrations/17`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    assert.equal(approvalResponse.status, 200);
    assert.deepEqual(await approvalResponse.json(), {
      id: 17,
      name: "대기회원",
      email: "pending@example.com",
      status: "approved",
      createdAt: createdAt.toISOString(),
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});
