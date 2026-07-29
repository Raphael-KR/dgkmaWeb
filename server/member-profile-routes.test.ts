import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import session from "express-session";
import type { ClientUser, InsertUser, User } from "@shared/schema";
import { registerRoutes } from "./routes";
import { storage } from "./storage";

const sessionUser: User = {
  id: 51,
  kakaoId: "private-kakao-id",
  email: "member@example.com",
  name: "김동문",
  graduationYear: 2005,
  isVerified: true,
  isAdmin: false,
  kakaoSyncEnabled: true,
  profileImage: "https://cdn.example.com/private-profile.jpg",
  phoneNumber: "010-1234-5678",
  birthday: "0101",
  birthdayType: "SOLAR",
  isLeapMonth: false,
  activityRegion: "서울특별시",
  createdAt: new Date("2026-07-26T00:00:00.000Z"),
  updatedAt: new Date("2026-07-26T00:01:00.000Z"),
};

type TestServer = {
  readonly baseUrl: string;
  readonly close: () => Promise<void>;
};

type UpdateCall = {
  readonly userId: number;
  readonly data: Partial<InsertUser>;
};

async function startServer(sessionUserId?: number): Promise<TestServer> {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "member-profile-route-test", resave: false, saveUninitialized: false }));
  app.post("/__test/session", (req, res) => {
    if (sessionUserId !== undefined) {
      req.session.userId = sessionUserId;
    }
    res.json({ ok: true });
  });

  const server = await registerRoutes(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address !== null && typeof address !== "string");
  const { port } = address;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
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

function clientUserResponse(user: User): { readonly user: ClientUser } {
  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      graduationYear: user.graduationYear,
      isVerified: user.isVerified,
      isAdmin: user.isAdmin,
      profileImage: user.profileImage,
      phoneNumber: user.phoneNumber,
      birthday: user.birthday,
      birthdayType: user.birthdayType,
      isLeapMonth: user.isLeapMonth,
      activityRegion: user.activityRegion,
      createdAt: user.createdAt?.toISOString() ?? null,
    },
  };
}

test("GET /api/auth/me returns 401 when anonymous", async () => {
  // Given
  const server = await startServer();
  try {
    // When
    const response = await fetch(`${server.baseUrl}/api/auth/me`);

    // Then
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "Not authenticated" });
  } finally {
    await server.close();
  }
});

test("POST /api/users/activity-region returns 401 when anonymous", async () => {
  // Given
  const server = await startServer();
  try {
    // When
    const response = await fetch(`${server.baseUrl}/api/users/activity-region`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activityRegion: "서울특별시" }),
    });

    // Then
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "Unauthorized" });
  } finally {
    await server.close();
  }
});

test("PATCH /api/users/me returns 401 when anonymous", async () => {
  // Given
  const server = await startServer();
  try {
    // When
    const response = await fetch(`${server.baseUrl}/api/users/me`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ activityRegion: "서울특별시" }),
    });

    // Then
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "로그인이 필요합니다" });
  } finally {
    await server.close();
  }
});

test("GET /api/auth/me uses the session user ID and returns exactly ClientUser", async (t) => {
  // Given
  const lookedUpUserIds: number[] = [];
  t.mock.method(storage, "getUser", async (userId) => {
    lookedUpUserIds.push(userId);
    return sessionUser;
  });
  const server = await startServer(sessionUser.id);
  try {
    const cookie = await createSession(server);

    // When
    const response = await fetch(`${server.baseUrl}/api/auth/me`, { headers: { cookie } });

    // Then
    assert.equal(response.status, 200);
    assert.deepEqual(lookedUpUserIds, [sessionUser.id]);
    assert.deepEqual(await response.json(), clientUserResponse(sessionUser));
  } finally {
    await server.close();
  }
});

test("GET /api/auth/me returns the missing-user error when the session user no longer exists", async (t) => {
  // Given
  t.mock.method(storage, "getUser", async () => undefined);
  const server = await startServer(sessionUser.id);
  try {
    const cookie = await createSession(server);

    // When
    const response = await fetch(`${server.baseUrl}/api/auth/me`, { headers: { cookie } });

    // Then
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), { message: "User not found" });
  } finally {
    await server.close();
  }
});

test("POST /api/users/activity-region ignores a spoofed body ID and returns exactly ClientUser", async (t) => {
  // Given
  const updateCalls: UpdateCall[] = [];
  const updatedUser = { ...sessionUser, activityRegion: "경기도" };
  t.mock.method(storage, "updateUser", async (userId, data) => {
    updateCalls.push({ userId, data });
    return updatedUser;
  });
  const server = await startServer(sessionUser.id);
  try {
    const cookie = await createSession(server);

    // When
    const response = await fetch(`${server.baseUrl}/api/users/activity-region`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ userId: 999, activityRegion: "경기도" }),
    });

    // Then
    assert.equal(response.status, 200);
    assert.deepEqual(updateCalls, [{ userId: sessionUser.id, data: { activityRegion: "경기도" } }]);
    assert.deepEqual(await response.json(), clientUserResponse(updatedUser));
  } finally {
    await server.close();
  }
});

test("POST /api/users/activity-region avoids storage writes for an invalid region", async (t) => {
  // Given
  const updateCalls: UpdateCall[] = [];
  t.mock.method(storage, "updateUser", async (userId, data) => {
    updateCalls.push({ userId, data });
    return sessionUser;
  });
  const server = await startServer(sessionUser.id);
  try {
    const cookie = await createSession(server);

    // When
    const response = await fetch(`${server.baseUrl}/api/users/activity-region`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ activityRegion: "유효하지 않은 지역" }),
    });

    // Then
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { message: "Invalid region" });
    assert.deepEqual(updateCalls, []);
  } finally {
    await server.close();
  }
});

test("PATCH /api/users/me uses the session user and strips protected fields", async (t) => {
  // Given
  const updateCalls: UpdateCall[] = [];
  const updatedUser = { ...sessionUser, activityRegion: "경기도" };
  t.mock.method(storage, "updateUser", async (userId, data) => {
    updateCalls.push({ userId, data });
    return updatedUser;
  });
  const server = await startServer(sessionUser.id);
  try {
    const cookie = await createSession(server);

    // When
    const response = await fetch(`${server.baseUrl}/api/users/me`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({
        id: 999,
        kakaoId: "spoofed-kakao-id",
        email: "spoofed@example.com",
        isAdmin: true,
        activityRegion: "경기도",
      }),
    });

    // Then
    assert.equal(response.status, 200);
    assert.deepEqual(updateCalls, [{ userId: sessionUser.id, data: { activityRegion: "경기도" } }]);
    assert.deepEqual(await response.json(), clientUserResponse(updatedUser));
  } finally {
    await server.close();
  }
});

test("PATCH /api/users/me returns the missing-user error when storage cannot update the session user", async (t) => {
  // Given
  t.mock.method(storage, "updateUser", async () => undefined);
  const server = await startServer(sessionUser.id);
  try {
    const cookie = await createSession(server);

    // When
    const response = await fetch(`${server.baseUrl}/api/users/me`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ activityRegion: "경기도" }),
    });

    // Then
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { message: "사용자를 찾을 수 없습니다" });
  } finally {
    await server.close();
  }
});
