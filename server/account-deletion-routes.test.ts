import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import session from "express-session";
import type { User } from "@shared/schema";
import { KakaoAdminConfigurationError } from "./kakao-admin-config";
import { KakaoUnlinkError } from "./kakao-unlink";
import { registerRoutes, type RouteDependencies } from "./routes";

const sessionUser: User = {
  id: 51,
  kakaoId: "123456789",
  email: "member@example.com",
  name: "김동문",
  graduationYear: 2005,
  isVerified: true,
  isAdmin: false,
  kakaoSyncEnabled: true,
  profileImage: null,
  phoneNumber: "010-1234-5678",
  birthday: null,
  birthdayType: null,
  isLeapMonth: null,
  activityRegion: "서울특별시",
  createdAt: new Date("2026-07-12T00:00:00.000Z"),
  updatedAt: new Date("2026-07-12T00:00:00.000Z"),
};

type TestServer = Awaited<ReturnType<typeof startServer>>;

async function startServer(dependencies: RouteDependencies) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false }));

  let destroyCalls = 0;
  let clearCookieCalls = 0;
  app.use((req, res, next) => {
    const destroy = req.session.destroy.bind(req.session);
    req.session.destroy = (callback) => {
      destroyCalls += 1;
      destroy(callback);
    };
    const clearCookie = res.clearCookie.bind(res);
    res.clearCookie = ((name: string, options?: Parameters<typeof clearCookie>[1]) => {
      clearCookieCalls += 1;
      return clearCookie(name, options);
    }) as typeof res.clearCookie;
    next();
  });

  app.post("/__test/session", (req, res) => {
    req.session.userId = sessionUser.id;
    res.json({ ok: true });
  });

  const server = await registerRoutes(app, dependencies);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    counters: () => ({ destroyCalls, clearCookieCalls }),
    close: () => new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
  };
}

async function createSession(server: TestServer): Promise<string> {
  const response = await fetch(`${server.baseUrl}/__test/session`, { method: "POST" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie;
}

async function deleteAccount(server: TestServer, body: unknown, cookie?: string) {
  return fetch(`${server.baseUrl}/api/users/me`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(body),
  });
}

function deletionDependencies(overrides: Partial<RouteDependencies> = {}) {
  const calls = {
    deletedUsers: [] as User[],
    unlinkArgs: [] as Array<{ adminKey: string; kakaoId: string }>,
  };
  const dependencies: RouteDependencies = {
    getKakaoAdminConfig: () => ({ environment: "development", adminKey: "admin-secret" }),
    getAccountDeletionUser: async () => sessionUser,
    deleteUserAccount: async (user) => { calls.deletedUsers.push(user as User); },
    unlinkKakaoUser: async (args) => { calls.unlinkArgs.push(args); },
    ...overrides,
  };
  return { calls, dependencies };
}

test("account deletion requires an authenticated session", async () => {
  const { dependencies } = deletionDependencies();
  const server = await startServer(dependencies);
  try {
    const response = await deleteAccount(server, { confirmation: "탈퇴" });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "로그인이 필요합니다" });
  } finally {
    await server.close();
  }
});

test("account deletion requires the exact confirmation text", async () => {
  const { calls, dependencies } = deletionDependencies();
  const server = await startServer(dependencies);
  try {
    const cookie = await createSession(server);
    const response = await deleteAccount(server, { confirmation: " 탈퇴 " }, cookie);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: "확인 문구로 '탈퇴'를 입력해주세요" });
    assert.equal(calls.unlinkArgs.length, 0);
    assert.equal(calls.deletedUsers.length, 0);
  } finally {
    await server.close();
  }
});

test("account deletion unlinks and deletes only the session user, then clears the session", async () => {
  const { calls, dependencies } = deletionDependencies();
  const server = await startServer(dependencies);
  try {
    const cookie = await createSession(server);
    const response = await deleteAccount(server, { confirmation: "탈퇴", userId: 999 }, cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { success: true });
    assert.deepEqual(calls.unlinkArgs, [{ adminKey: "admin-secret", kakaoId: sessionUser.kakaoId }]);
    assert.deepEqual(calls.deletedUsers, [sessionUser]);
    assert.deepEqual(server.counters(), { destroyCalls: 1, clearCookieCalls: 1 });
    assert.match(response.headers.get("set-cookie") ?? "", /connect\.sid=;/);
  } finally {
    await server.close();
  }
});

test("already-unlinked Kakao accounts continue to local deletion", async () => {
  const { calls, dependencies } = deletionDependencies({
    unlinkKakaoUser: async () => { throw new KakaoUnlinkError("already_unlinked", 400); },
  });
  const server = await startServer(dependencies);
  try {
    const cookie = await createSession(server);
    const response = await deleteAccount(server, { confirmation: "탈퇴" }, cookie);
    assert.equal(response.status, 200);
    assert.deepEqual(calls.deletedUsers, [sessionUser]);
  } finally {
    await server.close();
  }
});

test("accounts without a Kakao id skip unlink and allow local deletion", async () => {
  const localUser = { ...sessionUser, kakaoId: null };
  const { calls, dependencies } = deletionDependencies({
    getAccountDeletionUser: async () => localUser,
  });
  const server = await startServer(dependencies);
  try {
    const cookie = await createSession(server);
    const response = await deleteAccount(server, { confirmation: "탈퇴" }, cookie);
    assert.equal(response.status, 200);
    assert.equal(calls.unlinkArgs.length, 0);
    assert.deepEqual(calls.deletedUsers, [localUser]);
  } finally {
    await server.close();
  }
});

test("Kakao unlink failures return 502 and prevent local deletion", async () => {
  const { calls, dependencies } = deletionDependencies({
    unlinkKakaoUser: async () => { throw new KakaoUnlinkError("network_error"); },
  });
  const server = await startServer(dependencies);
  try {
    const cookie = await createSession(server);
    const response = await deleteAccount(server, { confirmation: "탈퇴" }, cookie);
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), {
      message: "카카오 연결 해제에 실패했습니다. 잠시 후 다시 시도해주세요",
    });
    assert.equal(calls.deletedUsers.length, 0);
  } finally {
    await server.close();
  }
});

test("missing Kakao admin configuration returns 500 and prevents local deletion", async () => {
  const { calls, dependencies } = deletionDependencies({
    getKakaoAdminConfig: () => {
      throw new KakaoAdminConfigurationError(["KAKAO_DEV_ADMIN_KEY"]);
    },
  });
  const server = await startServer(dependencies);
  try {
    const cookie = await createSession(server);
    const response = await deleteAccount(server, { confirmation: "탈퇴" }, cookie);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      message: "회원 탈퇴 설정 오류입니다. 관리자에게 문의해주세요",
    });
    assert.equal(calls.deletedUsers.length, 0);
  } finally {
    await server.close();
  }
});

test("local deletion failures keep the session and return a safe message", async () => {
  const { dependencies } = deletionDependencies({
    deleteUserAccount: async () => { throw new Error("private database details"); },
  });
  const server = await startServer(dependencies);
  try {
    const cookie = await createSession(server);
    const response = await deleteAccount(server, { confirmation: "탈퇴" }, cookie);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), {
      message: "회원 탈퇴 처리에 실패했습니다. 잠시 후 다시 시도해주세요",
    });
    assert.deepEqual(server.counters(), { destroyCalls: 0, clearCookieCalls: 0 });
  } finally {
    await server.close();
  }
});
