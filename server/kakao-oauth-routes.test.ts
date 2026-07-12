import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import test from "node:test";
import express from "express";
import {
  KakaoOAuthConfigurationError,
  type KakaoOAuthConfig,
} from "./kakao-oauth-config";
import { registerRoutes, type RouteDependencies } from "./routes";

const clientAuthPath = new URL("../client/src/lib/auth.ts", import.meta.url);
const config: KakaoOAuthConfig = {
  environment: "development",
  restApiKey: "route-rest-key",
  clientSecret: "route-client-secret",
  redirectUri: "https://dev.example/kakao-callback",
};

async function startServer(dependencies: RouteDependencies) {
  const app = express();
  app.use(express.json());
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
  } finally {
    await server.close();
  }
});

test("successful token exchange fetches secure user info and maps the Kakao response", async () => {
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
    assert.equal(response.status, 200);
    assert.equal(requests.length, 2);
    assert.equal(requests[1]?.input, "https://kapi.kakao.com/v2/user/me?secure_resource=true");
    assert.equal(
      new Headers(requests[1]?.init?.headers).get("Authorization"),
      "Bearer test-access-token",
    );
    assert.deepEqual(await response.json(), {
      kakaoId: "123456789",
      email: "member@example.com",
      name: "홍길동",
      profileImage: "https://cdn.example.com/profile.jpg",
      phoneNumber: "+82 10-1234-5678",
      birthday: "0101",
      birthdayType: "SOLAR",
      isLeapMonth: false,
      accessToken: "test-access-token",
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
  const source = await readFile(clientAuthPath, "utf8");
  assert.match(source, /\/api\/auth\/kakao\/start/);
  assert.doesNotMatch(source, /VITE_KAKAO_REST_API_KEY/);
  assert.doesNotMatch(source, /VITE_KAKAO_REDIRECT_URI/);
});
