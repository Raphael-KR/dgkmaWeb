import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("post-merge hook installs dependencies without changing database schema", async () => {
  const postMerge = await readFile(
    new URL("../scripts/post-merge.sh", import.meta.url),
    "utf8",
  );
  const replitConfig = await readFile(new URL("../.replit", import.meta.url), "utf8");

  assert.match(postMerge, /npm install/);
  assert.doesNotMatch(postMerge, /db:push|drizzle-kit|migrate-obituaries/i);
  assert.match(replitConfig, /\[postMerge\][\s\S]*path = "scripts\/post-merge\.sh"/);
});

test("deployment guide applies and verifies production schema before Republish", async () => {
  const guide = await readFile(new URL("../replit.md", import.meta.url), "utf8");
  const developmentSchema = "1. Development Database에 additive 스키마를 수동 적용하고 검증합니다.";
  const codeVerification = "2. 배포할 코드에서 테스트, 타입 검사, 빌드를 완료합니다.";
  const productionSchema = "3. Production Database에 additive 스키마를 수동 적용하고 검증합니다.";
  const republish = "4. Replit Deployments에서 Republish합니다.";
  const dataMigration = "5. 스키마와 코드 준비 상태를 확인한 뒤 데이터 마이그레이션을 별도 수동 SQL로 실행합니다.";

  const orderedSteps = [developmentSchema, codeVerification, productionSchema, republish, dataMigration]
    .map((step) => guide.indexOf(step));
  assert.ok(orderedSteps.every((index) => index >= 0), "안전한 배포 순서가 모두 문서화되어야 합니다");
  assert.deepEqual(orderedSteps, [...orderedSteps].sort((a, b) => a - b));
  assert.match(guide, /기존 `obituaries`[^\n]*유지/);
  assert.match(guide, /데이터 마이그레이션[^\n]*SQL 콘솔/);
});
