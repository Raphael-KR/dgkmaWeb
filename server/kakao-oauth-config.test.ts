import assert from "node:assert/strict";
import test from "node:test";
import {
  KakaoOAuthConfigurationError,
  buildKakaoAuthorizeUrl,
  buildKakaoTokenBody,
  resolveKakaoOAuthConfig,
} from "./kakao-oauth-config";

const completeEnv = {
  KAKAO_DEV_REST_API_KEY: "dev-rest",
  KAKAO_DEV_CLIENT_SECRET: "dev-secret",
  KAKAO_DEV_REDIRECT_URI:
    "https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback",
  KAKAO_PROD_REST_API_KEY: "prod-rest",
  KAKAO_PROD_CLIENT_SECRET: "prod-secret",
  KAKAO_PROD_REDIRECT_URI: "https://dgkma.org/kakao-callback",
} satisfies NodeJS.ProcessEnv;

test("development configuration is the default", () => {
  const config = resolveKakaoOAuthConfig({ ...completeEnv });
  assert.deepEqual(config, {
    environment: "development",
    restApiKey: "dev-rest",
    clientSecret: "dev-secret",
    redirectUri:
      "https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback",
  });
});

test("production configuration requires REPLIT_DEPLOYMENT=1", () => {
  const config = resolveKakaoOAuthConfig({
    ...completeEnv,
    REPLIT_DEPLOYMENT: "1",
  });
  assert.equal(config.environment, "production");
  assert.equal(config.restApiKey, "prod-rest");
  assert.equal(config.clientSecret, "prod-secret");
  assert.equal(config.redirectUri, "https://dgkma.org/kakao-callback");

  assert.equal(
    resolveKakaoOAuthConfig({ ...completeEnv, REPLIT_DEPLOYMENT: "true" }).environment,
    "development",
  );
});

test("missing selected variables are reported by name only", () => {
  assert.throws(
    () => resolveKakaoOAuthConfig({ KAKAO_DEV_REST_API_KEY: "dev-rest" }),
    (error) => {
      assert.ok(error instanceof KakaoOAuthConfigurationError);
      assert.deepEqual(error.missingVariables, [
        "KAKAO_DEV_CLIENT_SECRET",
        "KAKAO_DEV_REDIRECT_URI",
      ]);
      assert.doesNotMatch(error.message, /dev-rest/);
      return true;
    },
  );
});

test("authorization and token requests use one configuration", () => {
  const config = resolveKakaoOAuthConfig({ ...completeEnv });
  const authorizeUrl = new URL(buildKakaoAuthorizeUrl(config));
  assert.equal(authorizeUrl.origin, "https://kauth.kakao.com");
  assert.equal(authorizeUrl.pathname, "/oauth/authorize");
  assert.equal(authorizeUrl.searchParams.get("client_id"), "dev-rest");
  assert.equal(
    authorizeUrl.searchParams.get("redirect_uri"),
    "https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback",
  );
  assert.equal(authorizeUrl.searchParams.get("response_type"), "code");
  assert.equal(authorizeUrl.searchParams.get("state"), "kakao_login");
  assert.equal(authorizeUrl.searchParams.has("client_secret"), false);
  const scope = authorizeUrl.searchParams.get("scope") ?? "";
  assert.deepEqual(scope.split(",").sort(), [
    "account_email",
    "birthday",
    "name",
    "phone_number",
    "profile_image",
  ]);
  assert.doesNotMatch(scope, /account_ci|ci/);

  const tokenBody = buildKakaoTokenBody(config, "authorization-code");
  assert.equal(tokenBody.get("client_id"), "dev-rest");
  assert.equal(tokenBody.get("client_secret"), "dev-secret");
  assert.equal(
    tokenBody.get("redirect_uri"),
    "https://dc5e5541-525b-4ad6-b914-2d2db70cb4a9-00-flpzugprplfl.spock.replit.dev/kakao-callback",
  );
  assert.equal(tokenBody.get("code"), "authorization-code");
});

test("legacy production redirect URI is rejected without exposing its value", () => {
  assert.throws(
    () =>
      resolveKakaoOAuthConfig({
        ...completeEnv,
        REPLIT_DEPLOYMENT: "1",
        KAKAO_PROD_REDIRECT_URI: "https://dgkma.replit.app/kakao-callback",
      }),
    (error) => {
      assert.ok(error instanceof KakaoOAuthConfigurationError);
      assert.deepEqual(error.missingVariables, ["KAKAO_PROD_REDIRECT_URI"]);
      assert.doesNotMatch(error.message, /dgkma\.replit\.app/);
      return true;
    },
  );
});
