import assert from "node:assert/strict";
import test from "node:test";
import { requestKakaoToken, requestKakaoUser } from "./kakao-client";

test("Kakao transport preserves endpoint, headers, body, and unread response", async () => {
  const response = new Response("not-json", { status: 503 });
  const requests: Array<{ url: unknown; init: RequestInit | undefined }> = [];
  const kakaoFetch: typeof fetch = async (url, init) => {
    requests.push({ url, init });
    return response;
  };
  const params = new URLSearchParams({ code: "test-only-code", grant_type: "authorization_code" });
  assert.equal(await requestKakaoToken(params, kakaoFetch), response);
  assert.equal(await requestKakaoUser("test-only-token", kakaoFetch), response);
  assert.equal(response.bodyUsed, false);
  assert.deepEqual(requests, [
    {
      url: "https://kauth.kakao.com/oauth/token",
      init: {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      },
    },
    {
      url: "https://kapi.kakao.com/v2/user/me?secure_resource=true",
      init: { headers: { Authorization: "Bearer test-only-token" } },
    },
  ]);
});
