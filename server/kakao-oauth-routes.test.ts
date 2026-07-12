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
import { registerRoutes, type RouteDependencies } from "./routes";

const clientAuthPath = new URL("../client/src/lib/auth.ts", import.meta.url);
const routesPath = new URL("./routes.ts", import.meta.url);
const config: KakaoOAuthConfig = {
  environment: "development",
  restApiKey: "route-rest-key",
  clientSecret: "route-client-secret",
  redirectUri: "https://dev.example/kakao-callback",
};

const newKakaoUserInfo = {
  id: 987654321,
  kakao_account: {
    email: "new-member@example.com",
    is_email_verified: true,
    name: "김동문",
    phone_number: "+82 10-9876-5432",
  },
};

function kakaoResponses(userInfo = newKakaoUserInfo) {
  const responses = [
    new Response(JSON.stringify({ access_token: "test-access-token" })),
    new Response(JSON.stringify(userInfo)),
  ];
  return async () => responses.shift()!;
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

function kakaoAuthStorageDouble(overrides: Record<string, unknown> = {}) {
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
    createOrRefreshPendingRegistration: async (registration: any) => ({
      id: 1,
      ...registration,
      status: "pending",
      createdAt: new Date(),
    }),
    ...overrides,
  } as any;
}

async function startServer(
  dependencies: RouteDependencies,
  options: { failStartSessionSave?: boolean } = {},
) {
  const app = express();
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
  app.post("/__test/kakao-state", (req, res) => {
    req.session.kakaoOAuthState = "seeded-oauth-state";
    req.session.save((error) => {
      if (error) return res.status(500).json({ ok: false });
      return res.json({ state: req.session.kakaoOAuthState });
    });
  });
  const server = await registerRoutes(app, dependencies);
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

async function seedKakaoOAuthState(baseUrl: string) {
  const response = await fetch(`${baseUrl}/__test/kakao-state`, { method: "POST" });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie);
  return { cookie, state: "seeded-oauth-state" };
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
      kakaoSyncEnabled: true,
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
    kakaoFetch: async () => responses.shift()!,
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
      createOrRefreshPendingRegistration: async (registration: any) => {
        pendingUserData = registration.userData;
        return { id: 1, ...registration, status: "pending", createdAt: new Date() };
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

test("missing alumni match creates or refreshes pending review with not_found", async () => {
  let pendingUserData: Record<string, unknown> | undefined;
  const server = await startServer({
    getKakaoOAuthConfig: () => config,
    kakaoFetch: kakaoResponses(),
    kakaoAuthStorage: kakaoAuthStorageDouble({
      createOrRefreshPendingRegistration: async (registration: any) => {
        pendingUserData = registration.userData;
        return { id: 1, ...registration, status: "pending", createdAt: new Date() };
      },
    }),
  });
  try {
    const response = await postKakaoAuthorize(server.baseUrl);
    assert.equal(response.status, 202);
    assert.equal(pendingUserData?.conflictReason, "not_found");
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
      createOrRefreshPendingRegistration: async (registration: any) => {
        pendingUserData = registration.userData;
        return { id: 1, ...registration, status: "pending", createdAt: new Date() };
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
      createOrRefreshPendingRegistration: async (registration: any) => {
        pendingUserData = registration.userData;
        return { id: 1, ...registration, status: "pending", createdAt: new Date() };
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
      createOrRefreshPendingRegistration: async (registration: any) => {
        pendingUserData = registration.userData;
        return { id: 1, ...registration, status: "pending", createdAt: new Date() };
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
      createOrRefreshPendingRegistration: async (registration: any) => {
        pendingUserData = registration.userData;
        return { id: 1, ...registration, status: "pending", createdAt: new Date() };
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
  const server = await startServer({
    getKakaoOAuthConfig: () => {
      throw new KakaoOAuthConfigurationError(["KAKAO_DEV_CLIENT_SECRET"]);
    },
  });
  try {
    const seeded = await seedKakaoOAuthState(server.baseUrl);
    const response = await postKakaoAuthorize(server.baseUrl, { code: "test-code" }, seeded);
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
