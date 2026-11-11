import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import session from "express-session";
import type { PendingRegistration } from "@shared/schema";
import {
  RegistrationStateConflictError,
  RegistrationDecisionStorage,
} from "./registration-decision-storage";
import { KakaoUnlinkError } from "../../integrations/kakao/kakao-unlink";
import { registerRoutes } from "../../routes";

const pendingRegistration: PendingRegistration = {
  id: 27,
  kakaoId: "987654321",
  email: "pending@example.com",
  name: "대기회원",
  userData: {
    kakaoId: "987654321",
    email: "pending@example.com",
    name: "대기회원",
    phoneNumber: "+82 10-9876-5432",
    profileImage: "https://cdn.example.com/profile.jpg",
    birthday: "0101",
    birthdayType: "SOLAR",
    isLeapMonth: false,
    conflictReason: "not_found",
  },
  status: "pending",
  createdAt: new Date("2026-07-13T00:00:00.000Z"),
};

async function startRejectionServer(
  options: {
    registration?: PendingRegistration;
    getKakaoAdminConfig?: () => { environment: "development"; adminKey: string };
    unlinkKakaoUser?: (args: { adminKey: string; kakaoId: string }) => Promise<void>;
  } = {},
) {
  let storedRegistration: PendingRegistration | undefined =
    options.registration ?? pendingRegistration;
  const unlinkCalls: Array<{ adminKey: string; kakaoId: string }> = [];
  const storageCalls = { reject: 0, update: 0, reopen: 0 };
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "pending-rejection-secret", resave: false, saveUninitialized: false }));
  app.post("/__test/admin-session", (req, res) => {
    req.session.userId = 1;
    res.json({ ok: true });
  });

  const server = await registerRoutes(app, {
    getUserForAdmin: async () => ({ isAdmin: true }),
    getKakaoAdminConfig:
      options.getKakaoAdminConfig ??
      (() => ({ environment: "development", adminKey: "admin-secret" })),
    unlinkKakaoUser: async (args) => {
      unlinkCalls.push(args);
      await options.unlinkKakaoUser?.(args);
    },
    pendingRegistrationStorage: {
      approvePendingRegistration: async (id) => {
        storageCalls.update += 1;
        if (!storedRegistration || storedRegistration.id !== id) return undefined;
        storedRegistration = { ...storedRegistration, status: "approved" };
        return storedRegistration;
      },
      rejectPendingRegistration: async (id) => {
        storageCalls.reject += 1;
        if (!storedRegistration || storedRegistration.id !== id) return undefined;
        if (storedRegistration.status !== "pending") throw new RegistrationStateConflictError();
        storedRegistration = { ...storedRegistration, status: "rejected" };
        return storedRegistration;
      },
      deleteRejectedRegistration: async (id, beforeDelete) => {
        if (!storedRegistration || storedRegistration.id !== id) return undefined;
        if (storedRegistration.status !== "rejected") throw new RegistrationStateConflictError();
        await beforeDelete(storedRegistration);
        storedRegistration = undefined;
        return { id };
      },
      reopenPendingRegistration: async (id) => {
        storageCalls.reopen += 1;
        if (!storedRegistration || storedRegistration.id !== id) return undefined;
        if (storedRegistration.status !== "rejected") throw new RegistrationStateConflictError();
        storedRegistration = { ...storedRegistration, status: "pending" };
        return storedRegistration;
      },
    },
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;
  const sessionResponse = await fetch(`${baseUrl}/__test/admin-session`, { method: "POST" });
  const cookie = sessionResponse.headers.get("set-cookie");
  assert.ok(cookie);

  return {
    baseUrl,
    cookie,
    unlinkCalls,
    storageCalls,
    saved: () => storedRegistration,
    hasPending: () => Boolean(storedRegistration),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

for (const [label, id, body] of [
  ["partial numeric id", "27abc", { status: "approved" }],
  ["zero id", "0", { status: "approved" }],
  ["negative id", "-27", { status: "approved" }],
  ["whitespace-padded status", "27", { status: "rejected " }],
  ["unknown status", "27", { status: "foo" }],
  ["extra body field", "27", { status: "approved", unexpected: true }],
] as const) {
  test(`admin pending PATCH rejects ${label} before storage or Kakao unlink`, async () => {
    const server = await startRejectionServer();
    try {
      const response = await fetch(`${server.baseUrl}/api/admin/pending-registrations/${id}`, {
        method: "PATCH",
        headers: { cookie: server.cookie, "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      assert.equal(response.status, 400);
      assert.deepEqual(server.storageCalls, { reject: 0, update: 0, reopen: 0 });
      assert.equal(server.unlinkCalls.length, 0);
      assert.equal(server.hasPending(), true);
    } finally {
      await server.close();
    }
  });
}

async function rejectPending(baseUrl: string, cookie: string) {
  return fetch(`${baseUrl}/api/admin/pending-registrations/27`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "rejected" }),
  });
}

test("rejection preserves the application and re-review returns it to pending without unlink", async () => {
  const server = await startRejectionServer({
    getKakaoAdminConfig: () => {
      throw new Error("rejection must not read Kakao admin configuration");
    },
    unlinkKakaoUser: async () => {
      throw new Error("rejection must not unlink");
    },
  });
  try {
    const response = await rejectPending(server.baseUrl, server.cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      id: 27,
      name: pendingRegistration.name,
      email: pendingRegistration.email,
      status: "rejected",
      createdAt: pendingRegistration.createdAt!.toISOString(),
    });
    assert.deepEqual(server.saved()?.userData, pendingRegistration.userData);
    assert.equal(server.unlinkCalls.length, 0);
    assert.equal((await rejectPending(server.baseUrl, server.cookie)).status, 409);
    const reopen = () =>
      fetch(`${server.baseUrl}/api/admin/pending-registrations/27`, {
        method: "PATCH",
        headers: { cookie: server.cookie, "content-type": "application/json" },
        body: JSON.stringify({ status: "pending" }),
      });
    const reopened = await reopen();
    assert.equal(reopened.status, 200);
    assert.equal((await reopened.json()).status, "pending");
    assert.equal((await reopen()).status, 409);
    assert.equal(server.saved()?.status, "pending");
    assert.equal(server.unlinkCalls.length, 0);
  } finally {
    await server.close();
  }
});

test("administrator cannot cancel their own approval", async () => {
  await assert.rejects(
    new RegistrationDecisionStorage().cancelMemberApproval(1, 1),
    RegistrationStateConflictError,
  );
});

for (const userData of [null, { kakaoId: "not-a-kakao-id" }, { kakaoId: "123456789" }]) {
  test("rejecting incomplete legacy data preserves it for review without provider calls", async () => {
    const server = await startRejectionServer({
      registration: {
        ...pendingRegistration,
        userData: userData as PendingRegistration["userData"],
      },
    });
    try {
      assert.equal((await rejectPending(server.baseUrl, server.cookie)).status, 200);
      assert.deepEqual(server.saved()?.userData, userData);
      assert.equal(server.unlinkCalls.length, 0);
    } finally {
      await server.close();
    }
  });
}

async function deleteRejected(baseUrl: string, cookie: string) {
  return fetch(`${baseUrl}/api/admin/pending-registrations/27`, {
    method: "DELETE",
    headers: { cookie },
  });
}

test("application deletion is limited to rejected applications", async () => {
  const server = await startRejectionServer();
  try {
    assert.equal((await deleteRejected(server.baseUrl, server.cookie)).status, 409);
    assert.equal(server.saved()?.status, "pending");
    assert.equal(server.unlinkCalls.length, 0);
  } finally {
    await server.close();
  }
});

for (const alreadyUnlinked of [false, true]) {
  test(`rejected deletion removes the application after unlink (already unlinked=${alreadyUnlinked})`, async () => {
    const server = await startRejectionServer({
      registration: { ...pendingRegistration, status: "rejected" },
      unlinkKakaoUser: async () => {
        if (alreadyUnlinked) throw new KakaoUnlinkError("already_unlinked", 400);
      },
    });
    try {
      const response = await deleteRejected(server.baseUrl, server.cookie);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { deleted: true, id: 27 });
      assert.equal(server.saved(), undefined);
      assert.equal(server.unlinkCalls.length, 1);
    } finally {
      await server.close();
    }
  });
}

test("unlink failure preserves the rejected application", async () => {
  const registration = { ...pendingRegistration, status: "rejected" };
  const server = await startRejectionServer({
    registration,
    unlinkKakaoUser: async () => {
      throw new KakaoUnlinkError("network_error");
    },
  });
  try {
    assert.equal((await deleteRejected(server.baseUrl, server.cookie)).status, 502);
    assert.deepEqual(server.saved(), registration);
  } finally {
    await server.close();
  }
});

for (const userData of [null, { kakaoId: "not-a-kakao-id" }, { kakaoId: "123456789" }]) {
  test("deletion refuses an untrusted legacy Kakao identity and preserves its data", async () => {
    const registration = {
      ...pendingRegistration,
      status: "rejected",
      userData: userData as PendingRegistration["userData"],
    };
    const server = await startRejectionServer({ registration });
    try {
      assert.equal((await deleteRejected(server.baseUrl, server.cookie)).status, 409);
      assert.deepEqual(server.saved(), registration);
      assert.equal(server.unlinkCalls.length, 0);
    } finally {
      await server.close();
    }
  });
}
