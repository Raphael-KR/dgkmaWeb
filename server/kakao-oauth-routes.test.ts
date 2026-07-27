import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import session from "express-session";
import type { AlumniRecord, User } from "@shared/schema";
import {
  KakaoOAuthConfigurationError,
  type KakaoOAuthConfig,
} from "./kakao-oauth-config";
import { PendingRegistrationConflictError, PhoneRegistrationConflictError } from "./storage";
import type { PendingRegistrationReviewInput } from "./storage";
import { registerRoutes, type RouteDependencies } from "./routes";
import type {
  KakaoOAuthStateBinding,
  KakaoOAuthStateStore,
} from "./kakao-oauth-state";
import { KAKAO_OAUTH_STATE_TTL_MS } from "./kakao-oauth-state";

const clientAuthPath = new URL("../client/src/lib/auth.ts", import.meta.url);
const routesPath = new URL("./routes.ts", import.meta.url);
const config: KakaoOAuthConfig = {
  environment: "development",
  restApiKey: "route-rest-key",
  clientSecret: "route-client-secret",
  redirectUri: "https://dev.example/kakao-callback",
};

type KakaoAuthStorage = NonNullable<RouteDependencies["kakaoAuthStorage"]>;

const newKakaoUserInfo = {
  id: 987654321,
  kakao_account: {
    email: "new-member@example.com",
    is_email_verified: true,
    name: "김동문",
    phone_number: "+82 10-9876-5432",
  },
};

function takeKakaoResponse(responses: Response[]): Response {
  const response = responses.shift();
  assert.ok(response, "unexpected Kakao fetch call");
  return response;
}

function kakaoResponses(userInfo = newKakaoUserInfo) {
  const responses = [
    new Response(JSON.stringify({ access_token: "test-access-token" })),
    new Response(JSON.stringify(userInfo)),
  ];
  return async () => takeKakaoResponse(responses);
}

const alumniRecord: AlumniRecord = {
  id: 31,
  department: "한의학과",
  generation: "20",
  name: "김동문",
  admissionDate: "1999-03-01",
  graduationDate: "2005-02-28",
  address: null,
  mobile: "010-9876-5432",
  phone: null,
  group: null,
  status: null,
  alumniPosition: null,
  memo: null,
  isMatched: false,
  matchedUserId: null,
};

const createdUser: User = {
  id: 41,
  kakaoId: "987654321",
  email: "new-member@example.com",
  name: "김동문",
  graduationYear: 2005,
  isVerified: true,
  isAdmin: false,
  kakaoSyncEnabled: true,
  profileImage: null,
  phoneNumber: "+82 10-9876-5432",
  birthday: null,
  birthdayType: null,
  isLeapMonth: null,
  activityRegion: null,
  createdAt: new Date("2026-07-12T00:00:00.000Z"),
  updatedAt: new Date("2026-07-12T00:00:00.000Z"),
};

function finalizeKakaoLoginDouble(user: User = createdUser) {
  return async (
    _userId: number,
    _generation: unknown,
    saveSession: () => Promise<void>,
  ) => {
    await saveSession();
    return user;
  };
}

function kakaoAuthStorageDouble(overrides: Partial<KakaoAuthStorage> = {}) {
  return {
    getUser: async () => createdUser,
    getUserByEmail: async () => undefined,
    getUserByKakaoId: async () => undefined,
    getUserByNormalizedPhone: async () => undefined,
    findAlumniByName: async () => [],
    createUser: async () => createdUser,
    createUserWithAlumniClaim: async () => createdUser,
    updateUser: async () => createdUser,
    claimAlumniRecord: async () => undefined,
    finalizeKakaoLogin: finalizeKakaoLoginDouble(),
    createOrRefreshPendingRegistration: async (registration: PendingRegistrationReviewInput) => ({
      kind: "pending" as const,
      registration: {
        id: 1,
        ...registration,
        status: "pending",
        createdAt: new Date(),
      },
    }),
    ...overrides,
  } satisfies KakaoAuthStorage;
}

function kakaoOAuthStateStoreDouble(): KakaoOAuthStateStore {
  const bindings = new Map<string, KakaoOAuthStateBinding>();
  return {
    issue: async (binding) => {
      const startedAt = binding.startedAt ?? new Date();
      const issued = {
        ...binding,
        startedAt,
        expiresAt: binding.expiresAt
          ?? new Date(startedAt.getTime() + KAKAO_OAUTH_STATE_TTL_MS),
      };
      bindings.set(binding.sessionBindingHash, issued);
      return issued;
    },
    consume: async ({ stateHash, sessionBindingHash, startedAt }) => {
      const binding = bindings.get(sessionBindingHash);
      if (
        !binding
        || binding.stateHash !== stateHash
        || binding.startedAt.getTime() !== startedAt.getTime()
        || binding.expiresAt.getTime() <= Date.now()
      ) {
        return false;
      }
      bindings.delete(sessionBindingHash);
      return true;
    },
  };
}

async function startServer(
  dependencies: RouteDependencies,
  options: {
    failStartSessionSave?: boolean;
    synchronizeAuthorizeRequests?: boolean;
  } = {},
) {
  const app = express();
  const kakaoOAuthStateStore = dependencies.kakaoOAuthStateStore
    ?? kakaoOAuthStateStoreDouble();
  app.use(express.json());
  app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false }));
  if (options.failStartSessionSave) {
    app.use("/api/auth/kakao/start", (req, _res, next) => {
      const originalSave = req.session.save.bind(req.session);
      let failed = false;
      req.session.save = (callback) => {
        if (!failed) {
          failed = true;
          return callback(new Error("forced session save failure"));
        }
        return originalSave(callback);
      };
      next();
    });
  }
  app.post("/__test/admin-session", (req, res) => {
    req.session.userId = 1;
    res.json({ ok: true });
  });
  if (options.synchronizeAuthorizeRequests) {
    let arrivals = 0;
    let release: (() => void) | undefined;
    const bothRequestsReady = new Promise<void>((resolve) => {
      release = resolve;
    });
    app.use("/api/auth/kakao/authorize", async (_req, _res, next) => {
      arrivals += 1;
      if (arrivals === 2) release?.();
      await bothRequestsReady;
      next();
    });
  }
  const server = await registerRoutes(app, { ...dependencies, kakaoOAuthStateStore });
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

async function beginKakaoAuthorization(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/auth/kakao/start`, { redirect: "manual" });
  assert.equal(response.status, 302);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "OAuth state session cookie is required");
  const location = new URL(response.headers.get("location") ?? "");
  const state = location.searchParams.get("state");
  assert.ok(state, "OAuth state query parameter is required");
  return { cookie, location, state };
}

async function postKakaoAuthorize(
  baseUrl: string,
  body: Record<string, unknown> = { code: "test-code" },
  authorization?: { cookie: string; state: string },
) {
  const started = authorization ?? await beginKakaoAuthorization(baseUrl);
  return fetch(`${baseUrl}/api/auth/kakao/authorize`, {
    method: "POST",
    headers: {
      cookie: started.cookie,
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...body, state: started.state }),
  });
}

async function createAdminSession(baseUrl: string): Promise<string> {
  const response = await fetch(`${baseUrl}/__test/admin-session`, { method: "POST" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return cookie;
}

test("authorization start generates random state, persists it, and redirects with the selected configuration", async () => {
  const server = await startServer({ getKakaoOAuthConfig: () => config });
  try {
    const first = await beginKakaoAuthorization(server.baseUrl);
    const second = await beginKakaoAuthorization(server.baseUrl);
    const location = first.location;
    assert.equal(location.searchParams.get("client_id"), config.restApiKey);
    assert.equal(location.searchParams.get("redirect_uri"), config.redirectUri);
    assert.equal(location.searchParams.has("client_secret"), false);
    assert.match(first.state, /^[a-f0-9]{64}$/);
    assert.notEqual(first.state, second.state);
  } finally {
    await server.close();
  }
});

test("authorization start returns 500 without redirect when state persistence fails", async () => {
  const server = await startServer(
    { getKakaoOAuthConfig: () => config },
    { failStartSessionSave: true },
  );
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/start`, {
      redirect: "manual",
    });
    assert.equal(response.status, 500);
    assert.equal(response.headers.get("location"), null);
  } finally {
    await server.close();
  }
});

test("authorization rejects missing, mismatched, and reused state before Kakao fetch", async () => {
  let fetchCalls = 0;
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    },
  });
  try {
    const missing = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });
    assert.equal(missing.status, 400);
    assert.equal(fetchCalls, 0);

    const mismatchStart = await beginKakaoAuthorization(server.baseUrl);
    const mismatch = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { cookie: mismatchStart.cookie, "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code", state: `${mismatchStart.state}x` }),
    });
    assert.equal(mismatch.status, 400);
    assert.equal(fetchCalls, 0);

    const reusable = await beginKakaoAuthorization(server.baseUrl);
    const first = await postKakaoAuthorize(server.baseUrl, { code: "test-code" }, reusable);
    assert.equal(first.status, 400);
    assert.equal(fetchCalls, 1);
    const reused = await postKakaoAuthorize(server.baseUrl, { code: "test-code" }, reusable);
    assert.equal(reused.status, 400);
    assert.equal(fetchCalls, 1);
  } finally {
    await server.close();
  }
});

test("concurrent callbacks for one session and state enter token exchange exactly once", async () => {
  let tokenExchangeCalls = 0;
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: async () => {
      tokenExchangeCalls += 1;
      return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
    },
  }, { synchronizeAuthorizeRequests: true });

  try {
    const authorization = await beginKakaoAuthorization(server.baseUrl);
    const responses = await Promise.all([
      postKakaoAuthorize(server.baseUrl, { code: "first-code" }, authorization),
      postKakaoAuthorize(server.baseUrl, { code: "second-code" }, authorization),
    ]);

    assert.deepEqual(responses.map(({ status }) => status), [400, 400]);
    assert.equal(tokenExchangeCalls, 1);
  } finally {
    await server.close();
  }
});

test("a concurrent callback loser cannot overwrite the winner login session", async () => {
  let issued = false;
  let consumed = false;
  let tokenExchangeCalls = 0;
  const stateStore: KakaoOAuthStateStore = {
    issue: async (binding) => {
      issued = true;
      const startedAt = new Date();
      return {
        ...binding,
        startedAt,
        expiresAt: new Date(startedAt.getTime() + KAKAO_OAUTH_STATE_TTL_MS),
      };
    },
    consume: async () => {
      if (!issued) return false;
      if (!consumed) {
        consumed = true;
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
      return false;
    },
  };
  const responses = [
    new Response(JSON.stringify({ access_token: "test-access-token" })),
    new Response(JSON.stringify(newKakaoUserInfo)),
  ];
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoOAuthStateStore: stateStore,
    kakaoFetch: async (input) => {
      if (String(input) === "https://kauth.kakao.com/oauth/token") {
        tokenExchangeCalls += 1;
      }
      const response = responses.shift();
      assert.ok(response, "unexpected Kakao fetch call");
      return response;
    },
    kakaoAuthStorage: kakaoAuthStorageDouble({
      getUserByKakaoId: async () => createdUser,
    }),
  }, { synchronizeAuthorizeRequests: true });

  try {
    const authorization = await beginKakaoAuthorization(server.baseUrl);
    const callbackResponses = await Promise.all([
      postKakaoAuthorize(server.baseUrl, { code: "winner-code" }, authorization),
      postKakaoAuthorize(server.baseUrl, { code: "loser-code" }, authorization),
    ]);

    assert.deepEqual(callbackResponses.map(({ status }) => status).sort(), [200, 400]);
    assert.equal(tokenExchangeCalls, 1);
    const meResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { cookie: authorization.cookie },
    });
    assert.equal(meResponse.status, 200);
    assert.equal((await meResponse.json()).user.id, createdUser.id);
  } finally {
    await server.close();
  }
});

test("authorization start hides configuration error details", async () => {
  const server = await startServer({
    getKakaoOAuthConfig: () => {
      throw new KakaoOAuthConfigurationError(["KAKAO_DEV_CLIENT_SECRET"]);
    },
  });
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/start`);
    assert.equal(response.status, 500);
    const responseBody = await response.json();
    assert.deepEqual(responseBody, { message: "Kakao 앱 설정 오류" });
    const body = JSON.stringify(responseBody);
    assert.doesNotMatch(
      body,
      /KAKAO_DEV_CLIENT_SECRET|route-rest-key|route-client-secret/,
    );
  } finally {
    await server.close();
  }
});

test("token exchange uses the same selected configuration", async () => {
  let capturedBody = "";
  const kakaoFetch: typeof fetch = async (_input, init) => {
    capturedBody = String(init?.body ?? "");
    return new Response(JSON.stringify({ error: "invalid_grant" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  };
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch,
  });
  try {
    const authorization = await beginKakaoAuthorization(server.baseUrl);
    const response = await postKakaoAuthorize(
      server.baseUrl,
      { code: "test-code" },
      authorization,
    );
    assert.equal(response.status, 400);
    const body = new URLSearchParams(capturedBody);
    assert.equal(body.get("client_id"), config.restApiKey);
    assert.equal(body.get("client_secret"), config.clientSecret);
    assert.equal(body.get("redirect_uri"), config.redirectUri);
    assert.equal(body.get("code"), "test-code");
    assert.deepEqual(await response.json(), {
      message: "카카오 토큰 교환에 실패했습니다",
    });
  } finally {
    await server.close();
  }
});

test("authorization completes member update and session save without returning Kakao PII", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const userInfo = {
    id: 123456789,
    kakao_account: {
      email: "member@example.com",
      is_email_verified: true,
      name: "홍길동",
      profile: { profile_image_url: "https://cdn.example.com/profile.jpg" },
      phone_number: "+82 10-1234-5678",
      birthday: "0101",
      birthday_type: "SOLAR",
      is_leap_month: false,
    },
  };
  const responses = [
    new Response(JSON.stringify({ access_token: "test-access-token" }), {
      headers: { "content-type": "application/json" },
    }),
    new Response(JSON.stringify(userInfo), {
      headers: { "content-type": "application/json" },
    }),
  ];
  const kakaoFetch: typeof fetch = async (input, init) => {
    requests.push({ input: String(input), init });
    const response = responses.shift();
    assert.ok(response, "unexpected Kakao fetch call");
    return response;
  };
  const existingUser: User = {
    id: 7,
    kakaoId: "123456789",
    email: "member@example.com",
    name: "홍길동",
    graduationYear: 2004,
    isVerified: true,
    isAdmin: false,
    kakaoSyncEnabled: true,
    profileImage: null,
    phoneNumber: "+82 10-1234-5678",
    birthday: "1225",
    birthdayType: "LUNAR",
    isLeapMonth: true,
    activityRegion: "서울특별시",
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-02T00:00:00.000Z"),
  };
  let savedUpdates: Partial<User> | undefined;
  const updatedUser: User = {
    ...existingUser,
    profileImage: "https://cdn.example.com/profile.jpg",
    birthday: "0101",
    birthdayType: "SOLAR",
    isLeapMonth: false,
  };
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch,
    kakaoAuthStorage: {
      getUser: async () => updatedUser,
      getUserByEmail: async () => undefined,
      getUserByKakaoId: async () => existingUser,
      getUserByNormalizedPhone: async () => undefined,
      findAlumniByName: async () => [],
      createUser: async () => updatedUser,
      createUserWithAlumniClaim: async () => updatedUser,
      updateUser: async (_id, updates) => {
        savedUpdates = updates;
        return updatedUser;
      },
      claimAlumniRecord: async () => undefined,
      finalizeKakaoLogin: finalizeKakaoLoginDouble(updatedUser),
      createOrRefreshPendingRegistration: async () => {
        throw new Error("pending registration should not be created");
      },
    },
  });
  try {
    const authorization = await beginKakaoAuthorization(server.baseUrl);
    const response = await postKakaoAuthorize(
      server.baseUrl,
      { code: "test-code" },
      authorization,
    );
    assert.equal(response.status, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.input, "https://kapi.kakao.com/v2/user/me?secure_resource=true");
    assert.equal(
      new Headers(requests[1]?.init?.headers).get("Authorization"),
      "Bearer test-access-token",
    );
    assert.deepEqual(savedUpdates, {
      profileImage: "https://cdn.example.com/profile.jpg",
      birthday: "0101",
      birthdayType: "SOLAR",
      isLeapMonth: false,
    });
    const responseBody = await response.json();
    assert.deepEqual(responseBody.user, {
      id: 7,
      email: "member@example.com",
      name: "홍길동",
      graduationYear: 2004,
      isVerified: true,
      isAdmin: false,
      profileImage: "https://cdn.example.com/profile.jpg",
      phoneNumber: "+82 10-1234-5678",
      birthday: "0101",
      birthdayType: "SOLAR",
      isLeapMonth: false,
      activityRegion: "서울특별시",
      createdAt: "2024-01-01T00:00:00.000Z",
    });
    assert.doesNotMatch(JSON.stringify(responseBody), /kakaoId|updatedAt|test-access-token/);

    const meResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { cookie: authorization.cookie },
    });
    assert.equal(meResponse.status, 200);
    assert.deepEqual(await meResponse.json(), responseBody);
  } finally {
    await server.close();
  }
});

test("a configured Kakao administrator regains database admin status after login", async () => {
  let storedUser = { ...createdUser, isAdmin: false };
  let savedUpdates: Partial<User> | undefined;
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    isKakaoAdministrator: (kakaoId) => kakaoId === createdUser.kakaoId,
    kakaoAuthStorage: kakaoAuthStorageDouble({
      getUser: async () => storedUser,
      getUserByKakaoId: async () => storedUser,
      updateUser: async (_id: number, updates: Partial<User>) => {
        savedUpdates = updates;
        storedUser = { ...storedUser, ...updates };
        return storedUser;
      },
      finalizeKakaoLogin: async (
        _userId: number,
        _generation: unknown,
        saveSession: () => Promise<void>,
      ) => {
        await saveSession();
        return storedUser;
      },
    }),
  });

  try {
    const response = await postKakaoAuthorize(server.baseUrl);
    assert.equal(response.status, 200);
    assert.deepEqual(savedUpdates, { isAdmin: true });
    assert.equal((await response.json()).user.isAdmin, true);
  } finally {
    await server.close();
  }
});

test("Kakao administrator recovery does not revoke an existing administrator", async () => {
  const storedUser = { ...createdUser, isAdmin: true };
  let savedUpdates: Partial<User> | undefined;
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    isKakaoAdministrator: () => false,
    kakaoAuthStorage: kakaoAuthStorageDouble({
      getUser: async () => storedUser,
      getUserByKakaoId: async () => storedUser,
      updateUser: async (_id: number, updates: Partial<User>) => {
        savedUpdates = updates;
        return { ...storedUser, ...updates };
      },
      finalizeKakaoLogin: async (
        _userId: number,
        _generation: unknown,
        saveSession: () => Promise<void>,
      ) => {
        await saveSession();
        return storedUser;
      },
    }),
  });

  try {
    const response = await postKakaoAuthorize(server.baseUrl);
    assert.equal(response.status, 200);
    assert.equal(savedUpdates, undefined);
    assert.equal((await response.json()).user.isAdmin, true);
  } finally {
    await server.close();
  }
});

test("missing optional Kakao birthday clears the existing saved birthday", async () => {
  const userInfo = {
    id: 123456789,
    kakao_account: {
      email: "member@example.com",
      is_email_verified: true,
      name: "홍길동",
      phone_number: "+82 10-1234-5678",
    },
  };
  const responses = [
    new Response(JSON.stringify({ access_token: "test-access-token" })),
    new Response(JSON.stringify(userInfo)),
  ];
  const existingUser = {
    id: 7,
    kakaoId: "123456789",
    email: "member@example.com",
    name: "홍길동",
    graduationYear: null,
    isVerified: true,
    isAdmin: false,
    kakaoSyncEnabled: true,
    profileImage: "https://cdn.example.com/withdrawn-profile.jpg",
    phoneNumber: "+82 10-1234-5678",
    birthday: "0101",
    birthdayType: "SOLAR",
    isLeapMonth: false,
    activityRegion: "서울특별시",
    createdAt: null,
    updatedAt: null,
  } satisfies User;
  let savedUpdates: Partial<User> | undefined;
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: async () => takeKakaoResponse(responses),
    kakaoAuthStorage: {
      getUser: async () => existingUser,
      getUserByEmail: async () => undefined,
      getUserByKakaoId: async () => existingUser,
      getUserByNormalizedPhone: async () => undefined,
      findAlumniByName: async () => [],
      createUser: async () => existingUser,
      createUserWithAlumniClaim: async () => existingUser,
      updateUser: async (_id, updates) => {
        savedUpdates = updates;
        return { ...existingUser, ...updates };
      },
      claimAlumniRecord: async () => undefined,
      finalizeKakaoLogin: finalizeKakaoLoginDouble({
        ...existingUser,
        profileImage: null,
        birthday: null,
        birthdayType: null,
        isLeapMonth: null,
      }),
      createOrRefreshPendingRegistration: async () => {
        throw new Error("pending registration should not be created");
      },
    },
  });
  try {
    const response = await postKakaoAuthorize(server.baseUrl);
    assert.equal(response.status, 200);
    assert.deepEqual(savedUpdates, {
      profileImage: null,
      birthday: null,
      birthdayType: null,
      isLeapMonth: null,
    });
  } finally {
    await server.close();
  }
});

test("unverified Kakao email is rejected before member lookup or pending creation", async () => {
  let storageCalls = 0;
  const userInfo = {
    ...newKakaoUserInfo,
    kakao_account: {
      ...newKakaoUserInfo.kakao_account,
      is_email_verified: false,
    },
  };
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(userInfo),
    kakaoAuthStorage: kakaoAuthStorageDouble({
      getUserByKakaoId: async () => {
        storageCalls += 1;
        return undefined;
      },
      createOrRefreshPendingRegistration: async () => {
        storageCalls += 1;
        throw new Error("unverified email must not create pending registration");
      },
    }),
  });
  try {
    const response = await postKakaoAuthorize(server.baseUrl);
    assert.equal(response.status, 400);
    assert.equal(storageCalls, 0);
  } finally {
    await server.close();
  }
});

test("same email with a different or missing Kakao ID never auto-links and creates pending review", async () => {
  let updateUserCalled = false;
  let createUserCalled = false;
  let pendingUserData: Record<string, unknown> | undefined;
  const emailUser = { ...createdUser, id: 17, kakaoId: null };
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: kakaoAuthStorageDouble({
      getUserByEmail: async () => emailUser,
      updateUser: async () => {
        updateUserCalled = true;
        return emailUser;
      },
      createUserWithAlumniClaim: async () => {
        createUserCalled = true;
        return createdUser;
      },
      createOrRefreshPendingRegistration: async (registration: PendingRegistrationReviewInput) => {
        pendingUserData = registration.userData;
        return {
          kind: "pending" as const,
          registration: { id: 1, ...registration, status: "pending", createdAt: new Date() },
        };
      },
    }),
  });
  try {
    const response = await postKakaoAuthorize(server.baseUrl);
    assert.equal(response.status, 202);
    assert.equal(updateUserCalled, false);
    assert.equal(createUserCalled, false);
    assert.equal(pendingUserData?.conflictReason, "email_conflict");
    assert.equal((await response.json()).requiresApproval, true);
  } finally {
    await server.close();
  }
});

test("pending refresh that finds an approved Kakao member logs that member in", async () => {
  const approvedUser = {
    ...createdUser,
    id: 73,
    activityRegion: "서울특별시",
    profileImage: "https://cdn.example.com/stale-profile.jpg",
    birthday: "0101",
    birthdayType: "SOLAR",
    isLeapMonth: false,
  };
  let savedUpdates: Partial<User> | undefined;
  let storedApprovedUser = approvedUser;
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: kakaoAuthStorageDouble({
      getUser: async (id: number) => id === approvedUser.id ? storedApprovedUser : undefined,
      createOrRefreshPendingRegistration: async () => ({
        kind: "registered" as const,
        user: approvedUser,
      }),
      updateUser: async (_id: number, updates: Partial<User>) => {
        savedUpdates = updates;
        storedApprovedUser = { ...approvedUser, ...updates };
        return storedApprovedUser;
      },
      finalizeKakaoLogin: async (
        _userId: number,
        _generation: unknown,
        saveSession: () => Promise<void>,
      ) => {
        await saveSession();
        return storedApprovedUser;
      },
    }),
  });
  try {
    const authorization = await beginKakaoAuthorization(server.baseUrl);
    const response = await postKakaoAuthorize(
      server.baseUrl,
      { code: "test-code" },
      authorization,
    );

    assert.equal(response.status, 200);
    const responseBody = await response.json();
    assert.equal(responseBody.user.id, approvedUser.id);
    assert.equal(responseBody.user.profileImage, null);
    assert.equal(responseBody.user.birthday, null);
    assert.deepEqual(savedUpdates, {
      profileImage: null,
      birthday: null,
      birthdayType: null,
      isLeapMonth: null,
    });

    const meResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { cookie: authorization.cookie },
    });
    assert.equal(meResponse.status, 200);
    assert.deepEqual((await meResponse.json()).user, responseBody.user);
  } finally {
    await server.close();
  }
});

test("transactional email race creates an email_conflict review instead of returning 500", async () => {
  let pendingReason: string | undefined;
  const emailConflict = Object.assign(new PendingRegistrationConflictError(), {
    conflictReason: "email_conflict" as const,
  });
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: kakaoAuthStorageDouble({
      findAlumniByName: async () => [alumniRecord],
      createUserWithAlumniClaim: async () => {
        throw emailConflict;
      },
      createOrRefreshPendingRegistration: async (registration: PendingRegistrationReviewInput) => {
        pendingReason = registration.userData.conflictReason;
        return {
          kind: "pending" as const,
          registration: { id: 1, ...registration, status: "pending", createdAt: new Date() },
        };
      },
    }),
  });
  try {
    const response = await postKakaoAuthorize(server.baseUrl);
    assert.equal(response.status, 202);
    assert.equal(pendingReason, "email_conflict");
    assert.equal((await response.json()).requiresApproval, true);
  } finally {
    await server.close();
  }
});

test("missing alumni match creates or refreshes pending review with not_found", async () => {
  let pendingUserData: Record<string, unknown> | undefined;
  let pendingRegistrationCalls = 0;
  let memberWriteCalls = 0;
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: kakaoAuthStorageDouble({
      createUser: async () => {
        memberWriteCalls += 1;
        return createdUser;
      },
      createUserWithAlumniClaim: async () => {
        memberWriteCalls += 1;
        return createdUser;
      },
      updateUser: async () => {
        memberWriteCalls += 1;
        return createdUser;
      },
      claimAlumniRecord: async () => {
        memberWriteCalls += 1;
        return alumniRecord;
      },
      finalizeKakaoLogin: async () => {
        memberWriteCalls += 1;
        return createdUser;
      },
      createOrRefreshPendingRegistration: async (registration: PendingRegistrationReviewInput) => {
        pendingRegistrationCalls += 1;
        pendingUserData = registration.userData;
        return {
          kind: "pending" as const,
          registration: { id: 1, ...registration, status: "pending", createdAt: new Date() },
        };
      },
    }),
  });
  try {
    const authorization = await beginKakaoAuthorization(server.baseUrl);
    const response = await postKakaoAuthorize(
      server.baseUrl,
      { code: "test-code" },
      authorization,
    );
    assert.equal(response.status, 202);
    assert.equal(pendingRegistrationCalls, 1);
    assert.equal(memberWriteCalls, 0);
    assert.equal(pendingUserData?.conflictReason, "not_found");
    const meResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { cookie: authorization.cookie },
    });
    assert.equal(meResponse.status, 401);
    assert.deepEqual(await meResponse.json(), { message: "Not authenticated" });
  } finally {
    await server.close();
  }
});

test("alumni claim race creates or refreshes pending review with alumni_race", async () => {
  let pendingUserData: Record<string, unknown> | undefined;
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: kakaoAuthStorageDouble({
      findAlumniByName: async () => [alumniRecord],
      createUserWithAlumniClaim: async () => undefined,
      createOrRefreshPendingRegistration: async (registration: PendingRegistrationReviewInput) => {
        pendingUserData = registration.userData;
        return {
          kind: "pending" as const,
          registration: { id: 1, ...registration, status: "pending", createdAt: new Date() },
        };
      },
    }),
  });
  try {
    const response = await postKakaoAuthorize(server.baseUrl);
    assert.equal(response.status, 202);
    assert.equal(pendingUserData?.conflictReason, "alumni_race");
  } finally {
    await server.close();
  }
});

test("normalized phone duplicate creates or refreshes one pending review without a member", async () => {
  let createUserCalled = false;
  let pendingUserData: Record<string, unknown> | undefined;
  const existingPhoneUser = {
    ...createdUser,
    id: 17,
    kakaoId: "existing-kakao-id",
    email: "existing@example.com",
    phoneNumber: "010-9876-5432",
  };
  const dependencies = {
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: {
      getUser: async () => existingPhoneUser,
      getUserByEmail: async () => undefined,
      getUserByKakaoId: async () => undefined,
      getUserByNormalizedPhone: async () => existingPhoneUser,
      findAlumniByName: async () => [alumniRecord],
      createUser: async () => {
        createUserCalled = true;
        return createdUser;
      },
      createUserWithAlumniClaim: async () => {
        createUserCalled = true;
        return createdUser;
      },
      updateUser: async () => undefined,
      claimAlumniRecord: async () => alumniRecord,
      finalizeKakaoLogin: finalizeKakaoLoginDouble(),
      createOrRefreshPendingRegistration: async (registration: PendingRegistrationReviewInput) => {
        pendingUserData = registration.userData;
        return {
          kind: "pending" as const,
          registration: { id: 1, ...registration, status: "pending", createdAt: new Date() },
        };
      },
    },
  };
  const server = await startServer(dependencies);
  try {
    const response = await postKakaoAuthorize(server.baseUrl);

    assert.equal(response.status, 202);
    assert.equal(createUserCalled, false);
    assert.equal(pendingUserData?.conflictReason, "phone_conflict");
    assert.equal((await response.json()).requiresApproval, true);
  } finally {
    await server.close();
  }
});

test("already claimed alumni record requires approval without creating a member", async () => {
  let createUserCalled = false;
  let pendingUserData: Record<string, unknown> | undefined;
  const claimedAlumni = { ...alumniRecord, isMatched: true, matchedUserId: 17 };
  const dependencies = {
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: {
      getUser: async () => undefined,
      getUserByEmail: async () => undefined,
      getUserByKakaoId: async () => undefined,
      getUserByNormalizedPhone: async () => undefined,
      findAlumniByName: async () => [claimedAlumni],
      createUser: async () => {
        createUserCalled = true;
        return createdUser;
      },
      createUserWithAlumniClaim: async () => {
        createUserCalled = true;
        return createdUser;
      },
      updateUser: async () => undefined,
      claimAlumniRecord: async () => undefined,
      finalizeKakaoLogin: finalizeKakaoLoginDouble(),
      createOrRefreshPendingRegistration: async (registration: PendingRegistrationReviewInput) => {
        pendingUserData = registration.userData;
        return {
          kind: "pending" as const,
          registration: { id: 1, ...registration, status: "pending", createdAt: new Date() },
        };
      },
    },
  };
  const server = await startServer(dependencies);
  try {
    const response = await postKakaoAuthorize(server.baseUrl);

    assert.equal(response.status, 202);
    assert.equal(createUserCalled, false);
    assert.equal(pendingUserData?.conflictReason, "alumni_claimed");
    assert.deepEqual(await response.json(), {
      message: "동문 정보 확인이 필요합니다",
      description: "이미 연결된 동문 정보입니다. 관리자 확인 후 이용할 수 있습니다.",
      requiresApproval: true,
    });
  } finally {
    await server.close();
  }
});

test("unique unclaimed PostgreSQL alumni match creates and claims the member", async () => {
  let atomicRegistrationCalled = false;
  const dependencies = {
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: {
      getUser: async () => createdUser,
      getUserByEmail: async () => undefined,
      getUserByKakaoId: async () => undefined,
      getUserByNormalizedPhone: async () => undefined,
      findAlumniByName: async () => [alumniRecord],
      createUser: async () => createdUser,
      createUserWithAlumniClaim: async () => {
        atomicRegistrationCalled = true;
        return createdUser;
      },
      updateUser: async () => undefined,
      claimAlumniRecord: async () => undefined,
      finalizeKakaoLogin: finalizeKakaoLoginDouble(),
      createOrRefreshPendingRegistration: async () => {
        throw new Error("pending registration should not be created");
      },
    },
  };
  const server = await startServer(dependencies);
  try {
    const response = await postKakaoAuthorize(server.baseUrl);

    assert.equal(response.status, 200);
    assert.equal(atomicRegistrationCalled, true);
  } finally {
    await server.close();
  }
});

test("transactional phone race creates or refreshes a pending review", async () => {
  let pendingUserData: Record<string, unknown> | undefined;
  const dependencies = {
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: {
      getUser: async () => undefined,
      getUserByEmail: async () => undefined,
      getUserByKakaoId: async () => undefined,
      getUserByNormalizedPhone: async () => undefined,
      findAlumniByName: async () => [alumniRecord],
      createUser: async () => createdUser,
      createUserWithAlumniClaim: async () => {
        throw new PhoneRegistrationConflictError();
      },
      updateUser: async () => undefined,
      claimAlumniRecord: async () => undefined,
      finalizeKakaoLogin: finalizeKakaoLoginDouble(),
      createOrRefreshPendingRegistration: async (registration: PendingRegistrationReviewInput) => {
        pendingUserData = registration.userData;
        return {
          kind: "pending" as const,
          registration: { id: 1, ...registration, status: "pending", createdAt: new Date() },
        };
      },
    },
  };
  const server = await startServer(dependencies);
  try {
    const response = await postKakaoAuthorize(server.baseUrl);

    assert.equal(response.status, 202);
    assert.equal(pendingUserData?.conflictReason, "phone_conflict");
    assert.equal((await response.json()).requiresApproval, true);
  } finally {
    await server.close();
  }
});

test("admin approval phone conflict returns 409 without changing pending status", async () => {
  let pendingStatus = "pending";
  const adminUser = { ...createdUser, id: 1, isAdmin: true };
  const server = await startServer({
    getUserForAdmin: async () => adminUser,
    pendingRegistrationStorage: {
      updatePendingRegistrationStatus: async () => {
        throw new PhoneRegistrationConflictError();
      },
    },
  });
  try {
    const cookie = await createAdminSession(server.baseUrl);
    const response = await fetch(`${server.baseUrl}/api/admin/pending-registrations/7`, {
      method: "PATCH",
      headers: {
        cookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ status: "approved" }),
    });

    assert.equal(response.status, 409);
    assert.equal(pendingStatus, "pending");
    assert.deepEqual(await response.json(), {
      message: "이미 가입된 전화번호입니다",
      description: "승인 상태는 변경되지 않았습니다.",
    });
  } finally {
    await server.close();
  }
});

test("admin approval unresolved identity or alumni conflict returns 409 and leaves pending", async () => {
  let updateCalls = 0;
  const adminUser = { ...createdUser, id: 1, isAdmin: true };
  const server = await startServer({
    getUserForAdmin: async () => adminUser,
    pendingRegistrationStorage: {
      updatePendingRegistrationStatus: async () => {
        updateCalls += 1;
        throw new PendingRegistrationConflictError();
      },
    },
  });
  try {
    const cookie = await createAdminSession(server.baseUrl);
    const response = await fetch(`${server.baseUrl}/api/admin/pending-registrations/8`, {
      method: "PATCH",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });

    assert.equal(response.status, 409);
    assert.equal(updateCalls, 1);
    assert.deepEqual(await response.json(), {
      message: "가입 충돌이 아직 해소되지 않았습니다",
      description: "승인 상태는 변경되지 않았습니다.",
    });
  } finally {
    await server.close();
  }
});

test("authorization request hides configuration error details", async () => {
  let configCalls = 0;
  const server = await startServer({
    getKakaoOAuthConfig: () => {
      configCalls += 1;
      if (configCalls === 1) return config;
      throw new KakaoOAuthConfigurationError(["KAKAO_DEV_CLIENT_SECRET"]);
    },
  });
  try {
    const authorization = await beginKakaoAuthorization(server.baseUrl);
    const response = await postKakaoAuthorize(
      server.baseUrl,
      { code: "test-code" },
      authorization,
    );
    assert.equal(response.status, 500);
    const responseBody = await response.json();
    assert.deepEqual(responseBody, { message: "Kakao 앱 설정 오류" });
    const body = JSON.stringify(responseBody);
    assert.doesNotMatch(
      body,
      /KAKAO_DEV_CLIENT_SECRET|route-rest-key|route-client-secret/,
    );
  } finally {
    await server.close();
  }
});

test("client login delegates to the server start route", async () => {
  const [clientSource, routesSource] = await Promise.all([
    readFile(clientAuthPath, "utf8"),
    readFile(routesPath, "utf8"),
  ]);
  assert.match(clientSource, /\/api\/auth\/kakao\/start/);
  assert.doesNotMatch(clientSource, /VITE_KAKAO_REST_API_KEY/);
  assert.doesNotMatch(clientSource, /VITE_KAKAO_REDIRECT_URI/);
  assert.doesNotMatch(routesSource, /restApiKeyPrefix|app\.post\("\/api\/auth\/kakao",/);
});
