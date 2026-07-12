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
import { PhoneRegistrationConflictError } from "./storage";
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

async function startServer(dependencies: RouteDependencies) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "test-session-secret", resave: false, saveUninitialized: false }));
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

test("authorization start redirects with the selected configuration", async () => {
  const server = await startServer({ getKakaoOAuthConfig: () => config });
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/start`, {
      redirect: "manual",
    });
    assert.equal(response.status, 302);
    const location = new URL(response.headers.get("location") ?? "");
    assert.equal(location.searchParams.get("client_id"), config.restApiKey);
    assert.equal(location.searchParams.get("redirect_uri"), config.redirectUri);
    assert.equal(location.searchParams.has("client_secret"), false);
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
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });
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
      createPendingRegistration: async () => {
        throw new Error("pending registration should not be created");
      },
    },
  });
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });
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

    const cookie = response.headers.get("set-cookie");
    assert.ok(cookie);
    const meResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
      headers: { cookie },
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
    profileImage: null,
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
      createPendingRegistration: async () => {
        throw new Error("pending registration should not be created");
      },
    },
  });
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(savedUpdates, {
      birthday: null,
      birthdayType: null,
      isLeapMonth: null,
    });
  } finally {
    await server.close();
  }
});

test("normalized phone duplicate does not create another member", async () => {
  let createUserCalled = false;
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
      createPendingRegistration: async () => {
        throw new Error("pending registration should not be created");
      },
    },
  };
  const server = await startServer(dependencies);
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });

    assert.equal(response.status, 409);
    assert.equal(createUserCalled, false);
    assert.deepEqual(await response.json(), {
      message: "이미 가입된 전화번호입니다",
      description: "기존 계정으로 로그인하거나 관리자에게 문의해주세요.",
    });
  } finally {
    await server.close();
  }
});

test("already claimed alumni record requires approval without creating a member", async () => {
  let createUserCalled = false;
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
      createPendingRegistration: async () => {
        throw new Error("pending registration should not be created");
      },
    },
  };
  const server = await startServer(dependencies);
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });

    assert.equal(response.status, 202);
    assert.equal(createUserCalled, false);
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
      createPendingRegistration: async () => {
        throw new Error("pending registration should not be created");
      },
    },
  };
  const server = await startServer(dependencies);
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });

    assert.equal(response.status, 200);
    assert.equal(atomicRegistrationCalled, true);
  } finally {
    await server.close();
  }
});

test("transactional phone race returns the safe duplicate response", async () => {
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
      createPendingRegistration: async () => {
        throw new Error("pending registration should not be created");
      },
    },
  };
  const server = await startServer(dependencies);
  try {
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });

    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), {
      message: "이미 가입된 전화번호입니다",
      description: "기존 계정으로 로그인하거나 관리자에게 문의해주세요.",
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
    const response = await fetch(`${server.baseUrl}/api/auth/kakao/authorize`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "test-code" }),
    });
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
