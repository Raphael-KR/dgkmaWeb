import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@shared/schema";
import { PendingRegistrationConflictError } from "../../../storage";
import type { PendingRegistrationReviewInput } from "../../../storage";
import {
  newKakaoUserInfo,
  startServer,
  config,
  kakaoResponses,
  kakaoAuthStorageDouble,
  postKakaoAuthorize,
  createdUser,
  beginKakaoAuthorization,
  alumniRecord,
} from "./kakao-oauth-fixtures";

export function registerKakaoRegistrationCases() {
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
        createOrRefreshPendingRegistration: async (
          registration: PendingRegistrationReviewInput,
        ) => {
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
    let storedApprovedUser: User = approvedUser;
    const server = await startServer({
      getKakaoOAuthConfig: () => config,
      kakaoFetch: kakaoResponses(),
      kakaoAuthStorage: kakaoAuthStorageDouble({
        getUser: async (id: number) => (id === approvedUser.id ? storedApprovedUser : undefined),
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
      const authenticatedCookie = response.headers.get("set-cookie");
      assert.ok(
        authenticatedCookie,
        "approved member login must issue an authenticated session cookie",
      );
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
        headers: { cookie: authenticatedCookie },
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
        createOrRefreshPendingRegistration: async (
          registration: PendingRegistrationReviewInput,
        ) => {
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
        createUserWithAlumniClaim: async () => {
          memberWriteCalls += 1;
          return createdUser;
        },
        updateUser: async () => {
          memberWriteCalls += 1;
          return createdUser;
        },
        finalizeKakaoLogin: async () => {
          memberWriteCalls += 1;
          return createdUser;
        },
        createOrRefreshPendingRegistration: async (
          registration: PendingRegistrationReviewInput,
        ) => {
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
}
