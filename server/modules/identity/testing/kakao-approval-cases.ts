import assert from "node:assert/strict";
import test from "node:test";
import { KakaoOAuthConfigurationError } from "../../../integrations/kakao/kakao-oauth-config";
import { PendingRegistrationConflictError, PhoneRegistrationConflictError } from "../../../storage";
import {
  createdUser,
  startServer,
  createAdminSession,
  config,
  beginKakaoAuthorization,
  postKakaoAuthorize,
} from "./kakao-oauth-fixtures";

export function registerKakaoApprovalCases() {
  test("admin approval phone conflict returns 409 with a safe message", async () => {
    const adminUser = { ...createdUser, id: 1, isAdmin: true };
    const server = await startServer({
      getUserForAdmin: async () => adminUser,
      pendingRegistrationStorage: {
        approvePendingRegistration: async () => {
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
      assert.deepEqual(await response.json(), {
        message: "이미 가입된 전화번호입니다",
        description: "승인 상태는 변경되지 않았습니다.",
      });
    } finally {
      await server.close();
    }
  });

  test("admin approval unresolved identity or alumni conflict returns 409", async () => {
    let updateCalls = 0;
    const adminUser = { ...createdUser, id: 1, isAdmin: true };
    const server = await startServer({
      getUserForAdmin: async () => adminUser,
      pendingRegistrationStorage: {
        approvePendingRegistration: async () => {
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
    } finally {
      await server.close();
    }
  });
}
