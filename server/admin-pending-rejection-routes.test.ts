import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import session from "express-session";
import type { PendingRegistration } from "@shared/schema";
import { KakaoAdminConfigurationError } from "./kakao-admin-config";
import { KakaoUnlinkError } from "./kakao-unlink";
import { registerRoutes } from "./routes";

const storagePath = new URL("./storage.ts", import.meta.url);

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

async function startRejectionServer(options: {
  registration?: PendingRegistration;
  getKakaoAdminConfig?: () => { environment: "development"; adminKey: string };
  unlinkKakaoUser?: (args: { adminKey: string; kakaoId: string }) => Promise<void>;
} = {}) {
  let storedRegistration: PendingRegistration | undefined = options.registration ?? pendingRegistration;
  const unlinkCalls: Array<{ adminKey: string; kakaoId: string }> = [];
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "pending-rejection-secret", resave: false, saveUninitialized: false }));
  app.post("/__test/admin-session", (req, res) => {
    req.session.userId = 1;
    res.json({ ok: true });
  });

  const server = await registerRoutes(app, {
    getUserForAdmin: async () => ({ isAdmin: true }),
    getKakaoAdminConfig: options.getKakaoAdminConfig
      ?? (() => ({ environment: "development", adminKey: "admin-secret" })),
    unlinkKakaoUser: async (args) => {
      unlinkCalls.push(args);
      await options.unlinkKakaoUser?.(args);
    },
    pendingRegistrationStorage: {
      updatePendingRegistrationStatus: async () => {
        throw new Error("rejection must not update and retain personal data");
      },
      rejectPendingRegistration: async (id, beforeDelete) => {
        if (!storedRegistration || storedRegistration.id !== id) return undefined;
        await beforeDelete(storedRegistration);
        const deleted = { id: storedRegistration.id };
        storedRegistration = undefined;
        return deleted;
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
    hasPending: () => Boolean(storedRegistration),
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

test("pending rejection storage locks the pending row and deletes only after its callback", async () => {
  const source = await readFile(storagePath, "utf8");
  const start = source.indexOf("async rejectPendingRegistration");
  const end = source.indexOf("async updatePendingRegistrationStatus", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const method = source.slice(start, end);

  assert.match(method, /db\.transaction/);
  assert.match(method, /pendingRegistrations\.status, "pending"/);
  assert.match(method, /\.for\("update"\)/);
  assert.ok(method.indexOf("await beforeDelete(registration)") < method.indexOf("tx.delete(pendingRegistrations)"));
  assert.match(method, /returning\(\{ id: pendingRegistrations\.id \}\)/);
});

async function rejectPending(baseUrl: string, cookie: string) {
  return fetch(`${baseUrl}/api/admin/pending-registrations/27`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ status: "rejected" }),
  });
}

test("admin rejection unlinks the pending Kakao user before deleting personal data", async () => {
  const server = await startRejectionServer();
  try {
    const response = await rejectPending(server.baseUrl, server.cookie);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true, id: 27 });
    assert.deepEqual(server.unlinkCalls, [{ adminKey: "admin-secret", kakaoId: "987654321" }]);
    assert.equal(server.hasPending(), false);
  } finally {
    await server.close();
  }
});

test("already-unlinked pending Kakao users are still deleted", async () => {
  const server = await startRejectionServer({
    unlinkKakaoUser: async () => {
      throw new KakaoUnlinkError("already_unlinked", 400);
    },
  });
  try {
    const response = await rejectPending(server.baseUrl, server.cookie);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { deleted: true, id: 27 });
    assert.equal(server.hasPending(), false);
  } finally {
    await server.close();
  }
});

test("missing Kakao admin configuration returns 500 and preserves pending personal data", async () => {
  const server = await startRejectionServer({
    getKakaoAdminConfig: () => {
      throw new KakaoAdminConfigurationError(["KAKAO_DEV_ADMIN_KEY"]);
    },
  });
  try {
    const response = await rejectPending(server.baseUrl, server.cookie);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      message: "가입 거절 설정 오류입니다. 관리자에게 문의해주세요",
    });
    assert.equal(server.hasPending(), true);
    assert.equal(server.unlinkCalls.length, 0);
  } finally {
    await server.close();
  }
});

test("Kakao unlink failures return 502 and preserve pending personal data", async () => {
  const server = await startRejectionServer({
    unlinkKakaoUser: async () => {
      throw new KakaoUnlinkError("network_error");
    },
  });
  try {
    const response = await rejectPending(server.baseUrl, server.cookie);

    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      message: "카카오 연결 해제에 실패해 가입 거절을 완료하지 못했습니다. 잠시 후 다시 시도해주세요",
    });
    assert.equal(server.hasPending(), true);
  } finally {
    await server.close();
  }
});

for (const [label, userData] of [
  ["missing", { email: "pending@example.com" }],
  ["malformed", { kakaoId: "not-a-kakao-id" }],
  ["mismatched", { kakaoId: "123456789" }],
] as const) {
  test(`${label} legacy pending Kakao id returns 409 without unlinking or deleting`, async () => {
    const server = await startRejectionServer({
      registration: { ...pendingRegistration, userData },
    });
    try {
      const response = await rejectPending(server.baseUrl, server.cookie);

      assert.equal(response.status, 409);
      assert.deepEqual(await response.json(), {
        message: "가입 신청의 카카오 식별정보를 확인할 수 없어 거절할 수 없습니다",
      });
      assert.equal(server.hasPending(), true);
      assert.equal(server.unlinkCalls.length, 0);
    } finally {
      await server.close();
    }
  });
}
