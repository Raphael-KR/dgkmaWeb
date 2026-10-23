import assert from "node:assert/strict";
import test from "node:test";
import {
  KakaoAdminAllowlistConfigurationError,
  isConfiguredKakaoAdministrator,
  resolveKakaoAdminAllowlist,
} from "./kakao-admin-allowlist";

const completeEnv = {
  KAKAO_DEV_ADMIN_USER_IDS: "123456789, 987654321,123456789",
  KAKAO_PROD_ADMIN_USER_IDS: "555555555",
} satisfies NodeJS.ProcessEnv;

test("development administrator allowlist is selected by default and deduplicated", () => {
  const config = resolveKakaoAdminAllowlist({ ...completeEnv });

  assert.equal(config.environment, "development");
  assert.deepEqual([...config.kakaoUserIds], ["123456789", "987654321"]);
  assert.equal(isConfiguredKakaoAdministrator("123456789", config), true);
  assert.equal(isConfiguredKakaoAdministrator("555555555", config), false);
});

test("production administrator allowlist requires REPLIT_DEPLOYMENT=1", () => {
  const config = resolveKakaoAdminAllowlist({
    ...completeEnv,
    REPLIT_DEPLOYMENT: "1",
  });

  assert.equal(config.environment, "production");
  assert.deepEqual([...config.kakaoUserIds], ["555555555"]);
  assert.equal(
    resolveKakaoAdminAllowlist({ ...completeEnv, REPLIT_DEPLOYMENT: "true" }).environment,
    "development",
  );
});

test("a missing selected administrator allowlist safely grants nobody", () => {
  const development = resolveKakaoAdminAllowlist({});
  const production = resolveKakaoAdminAllowlist({ REPLIT_DEPLOYMENT: "1" });

  assert.deepEqual([...development.kakaoUserIds], []);
  assert.deepEqual([...production.kakaoUserIds], []);
  assert.equal(isConfiguredKakaoAdministrator("123456789", development), false);
});

test("invalid administrator identifiers report only the selected variable name", () => {
  assert.throws(
    () => resolveKakaoAdminAllowlist({
      KAKAO_DEV_ADMIN_USER_IDS: "123456789,not-a-kakao-id",
    }),
    (error) => {
      assert.ok(error instanceof KakaoAdminAllowlistConfigurationError);
      assert.equal(error.variableName, "KAKAO_DEV_ADMIN_USER_IDS");
      assert.doesNotMatch(error.message, /123456789|not-a-kakao-id/);
      return true;
    },
  );
});
