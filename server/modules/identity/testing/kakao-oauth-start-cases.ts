import assert from "node:assert/strict";
import test from "node:test";
import { KakaoOAuthConfigurationError } from "../../../integrations/kakao/kakao-oauth-config";
import type { KakaoOAuthStateStore } from "../kakao-oauth-state";
import { KAKAO_OAUTH_STATE_TTL_MS } from "../kakao-oauth-state";
import {
  startServer,
  config,
  beginKakaoAuthorization,
  kakaoAuthStorageDouble,
  createAdminSession,
  createdUser,
  postKakaoAuthorize,
  newKakaoUserInfo,
} from "./kakao-oauth-fixtures";

export function registerKakaoOAuthStartCases() {
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

  test("authorization start does not revoke an existing authenticated session", async () => {
    const server = await startServer({
      getKakaoOAuthConfig: () => config,
      kakaoAuthStorage: kakaoAuthStorageDouble(),
    });
    try {
      const cookie = await createAdminSession(server.baseUrl);
      const beforeStart = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { cookie },
      });
      assert.equal(beforeStart.status, 200);

      const startResponse = await fetch(`${server.baseUrl}/api/auth/kakao/start`, {
        headers: { cookie },
        redirect: "manual",
      });
      assert.equal(startResponse.status, 302);

      const afterStart = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { cookie },
      });
      assert.equal(afterStart.status, 200);
      assert.equal((await afterStart.json()).user.id, createdUser.id);
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
    const server = await startServer(
      {
        getKakaoOAuthConfig: () => config,
        kakaoFetch: async () => {
          tokenExchangeCalls += 1;
          return new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 });
        },
      },
      { synchronizeAuthorizeRequests: true },
    );

    try {
      const authorization = await beginKakaoAuthorization(server.baseUrl);
      const responses = await Promise.all([
        postKakaoAuthorize(server.baseUrl, { code: "first-code" }, authorization),
        postKakaoAuthorize(server.baseUrl, { code: "second-code" }, authorization),
      ]);

      assert.deepEqual(
        responses.map(({ status }) => status),
        [400, 400],
      );
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
    const server = await startServer(
      {
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
      },
      { synchronizeAuthorizeRequests: true },
    );

    try {
      const authorization = await beginKakaoAuthorization(server.baseUrl);
      const callbackResponses = await Promise.all([
        postKakaoAuthorize(server.baseUrl, { code: "winner-code" }, authorization),
        postKakaoAuthorize(server.baseUrl, { code: "loser-code" }, authorization),
      ]);

      assert.deepEqual(callbackResponses.map(({ status }) => status).sort(), [200, 400]);
      assert.equal(tokenExchangeCalls, 1);
      const winnerResponse = callbackResponses.find(({ status }) => status === 200);
      assert.ok(winnerResponse, "one callback must complete the member login");
      const authenticatedCookie = winnerResponse.headers.get("set-cookie");
      assert.ok(authenticatedCookie, "winning callback must issue an authenticated session cookie");
      const meResponse = await fetch(`${server.baseUrl}/api/auth/me`, {
        headers: { cookie: authenticatedCookie },
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
}
