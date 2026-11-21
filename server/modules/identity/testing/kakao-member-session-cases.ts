import assert from "node:assert/strict";
import test from "node:test";
import {
  PendingRegistrationConflictError,
  PhoneRegistrationConflictError,
} from "../registration-support";
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
  newKakaoUserInfo,
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
      id: "00000000-0000-4000-8000-000000000007",
      kakaoId: "123456789",
      email: "old@example.com",
      name: "옛이름",
      graduationYear: 2004,
      isVerified: true,
      isAdmin: false,
      kakaoSyncEnabled: true,
      profileImage: null,
      phoneNumber: "010-5555-5555",
      birthday: "1225",
      birthdayType: "LUNAR",
      isLeapMonth: true,
      activityRegion: "서울특별시",
      joinedAt: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-02T00:00:00.000Z"),
    };
    let savedUpdates: Partial<User> | undefined;
    let storedUser = existingUser;
    const server = await startServer({
      getKakaoOAuthConfig: () => config,
      kakaoFetch,
      kakaoAuthStorage: kakaoAuthStorageDouble({
        getUser: async () => storedUser,
        getUserByKakaoId: async () => existingUser,
        finalizeKakaoLogin: finalizeKakaoLoginDouble(existingUser, (updates) => {
          savedUpdates = updates;
          storedUser = { ...existingUser, ...updates };
        }),
        findAlumniByName: async () => {
          throw new Error("a returning member needs no roster match");
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
        name: "홍길동",
        email: "member@example.com",
        phoneNumber: "+82 10-1234-5678",
        profileImage: "https://cdn.example.com/profile.jpg",
        birthday: "0101",
        birthdayType: "SOLAR",
        isLeapMonth: false,
      });
      const responseBody = await response.json();
      assert.deepEqual(responseBody.user, {
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
        joinedAt: null,
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
    const storedUser = { ...createdUser, isAdmin: false };
    let savedUpdates: Partial<User> | undefined;
    const server = await startServer({
      getKakaoOAuthConfig: () => config,
      kakaoFetch: kakaoResponses(),
      isKakaoAdministrator: (kakaoId) => kakaoId === createdUser.kakaoId,
      kakaoAuthStorage: kakaoAuthStorageDouble({
        getUser: async () => storedUser,
        getUserByKakaoId: async () => storedUser,
        finalizeKakaoLogin: finalizeKakaoLoginDouble(storedUser, (updates) => {
          savedUpdates = updates;
        }),
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
        finalizeKakaoLogin: finalizeKakaoLoginDouble(storedUser, (updates) => {
          savedUpdates = updates;
        }),
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

  for (const needsAgreement of [false, true]) {
    const scenario = needsAgreement
      ? "explicit consent required clears"
      : "omitted values preserve";
    test(`${scenario} the stored Kakao photo and birthday`, async () => {
      const storedUser = {
        ...createdUser,
        profileImage: "https://cdn.example.com/profile.jpg",
        birthday: "0215",
        birthdayType: "LUNAR",
        isLeapMonth: true,
      };
      const info = {
        ...newKakaoUserInfo,
        kakao_account: {
          ...newKakaoUserInfo.kakao_account,
          ...(needsAgreement && {
            birthday_needs_agreement: true,
            profile_image_needs_agreement: true,
          }),
        },
      };
      const server = await startServer({
        getKakaoOAuthConfig: () => config,
        kakaoFetch: kakaoResponses(info),
        kakaoAuthStorage: kakaoAuthStorageDouble({
          getUserByKakaoId: async () => storedUser,
          finalizeKakaoLogin: finalizeKakaoLoginDouble(storedUser),
        }),
      });
      try {
        const response = await postKakaoAuthorize(server.baseUrl);
        assert.equal(response.status, 200);
        const { user } = await response.json();
        for (const key of ["profileImage", "birthday", "birthdayType", "isLeapMonth"] as const) {
          assert.equal(user[key], needsAgreement ? null : storedUser[key]);
        }
      } finally {
        await server.close();
      }
    });
  }

  for (const conflict of [
    new PendingRegistrationConflictError("email_conflict"),
    new PhoneRegistrationConflictError(),
  ]) {
    test(`existing member contact conflict refuses the login: ${conflict.name}`, async () => {
      const server = await startServer({
        getKakaoOAuthConfig: () => config,
        kakaoFetch: kakaoResponses(),
        kakaoAuthStorage: kakaoAuthStorageDouble({
          getUserByKakaoId: async () => createdUser,
          finalizeKakaoLogin: async () => {
            throw conflict;
          },
          createOrRefreshPendingRegistration: async () => {
            throw new Error("unexpected registration");
          },
        }),
      });
      try {
        const auth = await beginKakaoAuthorization(server.baseUrl);
        const response = await postKakaoAuthorize(server.baseUrl, { code: "test-code" }, auth);
        assert.equal(response.status, 409);
        assert.match(
          (await response.json()).message,
          conflict instanceof PhoneRegistrationConflictError ? /휴대전화/ : /이메일/,
        );
        const me = await fetch(`${server.baseUrl}/api/auth/me`, {
          headers: { cookie: auth.cookie },
        });
        assert.equal(me.status, 401);
      } finally {
        await server.close();
      }
    });
  }
}
