import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@shared/schema";
import {
  startServer,
  config,
  finalizeKakaoLoginDouble,
  beginKakaoAuthorization,
  postKakaoAuthorize,
  createdUser,
  kakaoResponses,
  kakaoAuthStorageDouble,
  takeKakaoResponse,
} from "./kakao-oauth-fixtures";

export function registerKakaoMemberSessionCases() {
  test("successful Kakao member login rotates the session before authentication", async () => {
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
        createUserWithAlumniClaim: async () => updatedUser,
        updateUser: async (_id, updates) => {
          savedUpdates = updates;
          return updatedUser;
        },
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
      const authenticatedCookie = response.headers.get("set-cookie");
      assert.ok(authenticatedCookie, "successful login must issue an authenticated session cookie");
      assert.equal(
        authenticatedCookie === authorization.cookie,
        false,
        "successful login must change the session identifier",
      );
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

      const oldSessionResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { cookie: authorization.cookie },
      });
      assert.equal(oldSessionResponse.status, 401);
      assert.deepEqual(await oldSessionResponse.json(), { message: "Not authenticated" });

      const authenticatedSessionResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { cookie: authenticatedCookie },
      });
      assert.equal(authenticatedSessionResponse.status, 200);
      assert.deepEqual(await authenticatedSessionResponse.json(), responseBody);
    } finally {
      await server.close();
    }
  });

  test("a configured Kakao administrator regains database admin status after login", async () => {
    let storedUser: User = { ...createdUser, isAdmin: false };
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
        createUserWithAlumniClaim: async () => existingUser,
        updateUser: async (_id, updates) => {
          savedUpdates = updates;
          return { ...existingUser, ...updates };
        },
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
}
