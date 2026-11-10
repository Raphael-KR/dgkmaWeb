import assert from "node:assert/strict";
import test from "node:test";
import type { User } from "@shared/schema";
import { PhoneRegistrationConflictError } from "../../../storage";
import type { PendingRegistrationReviewInput } from "../../../storage";
import {
  createdUser,
  startServer,
  config,
  kakaoResponses,
  kakaoAuthStorageDouble,
  createAdminSession,
  postKakaoAuthorize,
  newKakaoUserInfo,
  alumniRecord,
  finalizeKakaoLoginDouble,
} from "./kakao-oauth-fixtures";

export function registerKakaoRegistrationClaimCases() {
  test("pending registration revokes a pre-authenticated session for a different Kakao identity", async () => {
    const preAuthenticatedMember: User = {
      ...createdUser,
      id: 1,
      kakaoId: "111222333",
      email: "pre-authenticated@example.com",
    };
    let pendingRegistrationCalls = 0;
    let memberWriteCalls = 0;
    let finalizeLoginCalls = 0;
    let pendingRegistration: PendingRegistrationReviewInput | undefined;
    const server = await startServer({
      getKakaoOAuthConfig: () => config,
      kakaoFetch: kakaoResponses(),
      kakaoAuthStorage: kakaoAuthStorageDouble({
        getUser: async (userId) =>
          userId === preAuthenticatedMember.id ? preAuthenticatedMember : undefined,
        createUserWithAlumniClaim: async () => {
          memberWriteCalls += 1;
          return createdUser;
        },
        updateUser: async () => {
          memberWriteCalls += 1;
          return createdUser;
        },
        finalizeKakaoLogin: async () => {
          finalizeLoginCalls += 1;
          return createdUser;
        },
        createOrRefreshPendingRegistration: async (registration) => {
          pendingRegistrationCalls += 1;
          pendingRegistration = registration;
          return {
            kind: "pending" as const,
            registration: { id: 1, ...registration, status: "pending", createdAt: new Date() },
          };
        },
      }),
    });
    try {
      const cookie = await createAdminSession(server.baseUrl);
      const beforeAuthorizationResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { cookie },
      });
      assert.equal(beforeAuthorizationResponse.status, 200);
      assert.equal((await beforeAuthorizationResponse.json()).user.id, preAuthenticatedMember.id);

      const startResponse = await fetch(`${server.baseUrl}/api/auth/kakao/start`, {
        headers: { cookie },
        redirect: "manual",
      });
      assert.equal(startResponse.status, 302);
      const startLocation = new URL(startResponse.headers.get("location") ?? "");
      const state = startLocation.searchParams.get("state");
      assert.ok(state, "OAuth state query parameter is required");

      const pendingResponse = await postKakaoAuthorize(
        server.baseUrl,
        { code: "test-code" },
        { cookie, state },
      );
      assert.equal(pendingResponse.status, 202);
      assert.equal((await pendingResponse.json()).requiresApproval, true);
      assert.equal(pendingRegistrationCalls, 1);
      assert.equal(memberWriteCalls, 0);
      assert.equal(finalizeLoginCalls, 0);
      assert.equal(pendingRegistration?.userData.conflictReason, "not_found");
      assert.equal(pendingRegistration?.kakaoId, String(newKakaoUserInfo.id));
      assert.notEqual(pendingRegistration?.kakaoId, preAuthenticatedMember.kakaoId);

      const afterPendingResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { cookie },
      });
      assert.equal(afterPendingResponse.status, 401);
      assert.deepEqual(await afterPendingResponse.json(), { message: "Not authenticated" });
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
        createUserWithAlumniClaim: async () => {
          createUserCalled = true;
          return createdUser;
        },
        updateUser: async () => undefined,
        finalizeKakaoLogin: finalizeKakaoLoginDouble(),
        createOrRefreshPendingRegistration: async (
          registration: PendingRegistrationReviewInput,
        ) => {
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
        createUserWithAlumniClaim: async () => {
          createUserCalled = true;
          return createdUser;
        },
        updateUser: async () => undefined,
        finalizeKakaoLogin: finalizeKakaoLoginDouble(),
        createOrRefreshPendingRegistration: async (
          registration: PendingRegistrationReviewInput,
        ) => {
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
        createUserWithAlumniClaim: async () => {
          atomicRegistrationCalled = true;
          return createdUser;
        },
        updateUser: async () => undefined,
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
        createUserWithAlumniClaim: async () => {
          throw new PhoneRegistrationConflictError();
        },
        updateUser: async () => undefined,
        finalizeKakaoLogin: finalizeKakaoLoginDouble(),
        createOrRefreshPendingRegistration: async (
          registration: PendingRegistrationReviewInput,
        ) => {
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
}
