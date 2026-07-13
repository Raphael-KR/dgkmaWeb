import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("deployment docs and environment example match the transitional alumni sources", async () => {
  const [envExample, replitGuide, proposal] = await Promise.all([
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../replit.md", import.meta.url), "utf8"),
    readFile(new URL("../planning_proposal.md", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(envExample, /^KAKAO_ADMIN_KEY=/m);
  assert.match(envExample, /^KAKAO_DEV_ADMIN_KEY=""$/m);
  assert.match(envExample, /^KAKAO_PROD_ADMIN_KEY=""$/m);
  assert.match(replitGuide, /Google Sheets를 동문 명부의 \*\*관리 원본\*\*/);
  assert.match(replitGuide, /PostgreSQL `alumni_database`[^\n]*\*\*런타임 복제본\*\*/);
  assert.doesNotMatch(replitGuide, /아직 Google Sheets 런타임 조회를 사용/);
  assert.match(proposal, /Google Sheets를 동문 명부의 \*\*관리 원본\*\*/);
  assert.match(proposal, /PostgreSQL `alumni_database`[^\n]*\*\*런타임 복제본\*\*/);
});
