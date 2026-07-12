import assert from "node:assert/strict";
import test from "node:test";
import {
  KakaoAdminConfigurationError,
  resolveKakaoAdminConfig,
} from "./kakao-admin-config";

const completeEnv = {
  KAKAO_DEV_ADMIN_KEY: "development-admin-secret",
  KAKAO_PROD_ADMIN_KEY: "production-admin-secret",
} satisfies NodeJS.ProcessEnv;

test("development administrator key is the default", () => {
  const config = resolveKakaoAdminConfig({ ...completeEnv });

  assert.deepEqual(config, {
    environment: "development",
    adminKey: "development-admin-secret",
  });
});

test("production administrator key requires REPLIT_DEPLOYMENT=1", () => {
  const config = resolveKakaoAdminConfig({
    ...completeEnv,
    REPLIT_DEPLOYMENT: "1",
  });

  assert.deepEqual(config, {
    environment: "production",
    adminKey: "production-admin-secret",
  });
  assert.equal(
    resolveKakaoAdminConfig({ ...completeEnv, REPLIT_DEPLOYMENT: "true" }).environment,
    "development",
  );
});

test("missing selected administrator key reports its variable name without its value", () => {
  assert.throws(
    () => resolveKakaoAdminConfig({ KAKAO_DEV_ADMIN_KEY: "  " }),
    (error) => {
      assert.ok(error instanceof KakaoAdminConfigurationError);
      assert.deepEqual(error.missingVariables, ["KAKAO_DEV_ADMIN_KEY"]);
      assert.doesNotMatch(error.message, /development-admin-secret/);
      return true;
    },
  );
});

test("missing production administrator key reports the production variable only", () => {
  assert.throws(
    () => resolveKakaoAdminConfig({
      REPLIT_DEPLOYMENT: "1",
      KAKAO_DEV_ADMIN_KEY: "development-admin-secret",
      KAKAO_PROD_ADMIN_KEY: "  ",
    }),
    (error) => {
      assert.ok(error instanceof KakaoAdminConfigurationError);
      assert.deepEqual(error.missingVariables, ["KAKAO_PROD_ADMIN_KEY"]);
      assert.doesNotMatch(error.message, /development-admin-secret/);
      return true;
    },
  );
});
