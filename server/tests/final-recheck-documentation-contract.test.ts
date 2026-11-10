import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

// Check the named policy's content, not unrelated history or every word in a document.
function section(document: string, heading: string) {
  const lines = document.split("\n");
  const start = lines.findIndex((line) => /^#{1,6}\s/.test(line) && line.includes(heading));
  assert.ok(start >= 0, `Missing policy section: ${heading}`);
  const level = lines[start].match(/^#+/)![0].length;
  const end = lines.findIndex(
    (line, index) => index > start && new RegExp(`^#{1,${level}}\\s`).test(line),
  );
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n");
}

test("Kakao documentation preserves the SPA authorization-code boundary", async () => {
  for (const path of [
    "docs/runbooks/kakao-consent-review-guide.md",
    "docs/runbooks/feature-checks.md",
  ]) {
    const document = await read(path);
    assert.match(document, /callback[\s\S]*query[\s\S]*인가 코드[\s\S]*state/);
    assert.match(document, /브라우저[^\n]*인가 코드[^\n]*state[^\n]*서버/);
    assert.match(document, /로그[^\n]*(?:인가 코드|토큰)[^\n]*(?:남기지|기록하지)/);
  }
});

test("roster policy distinguishes the managed source, runtime copy and explicit sync", async () => {
  const roster = section(await read("docs/product/planning-proposal.md"), "동문 명부");
  assert.match(roster, /Google Sheets[\s\S]*관리 원본/);
  assert.match(roster, /PostgreSQL[\s\S]*런타임 복제본/);
  assert.match(roster, /로그인 요청[^\n]*Google Sheets[^\n]*조회하지/);
  assert.match(roster, /관리자[\s\S]*동기화/);
});

test("entry documents link to the current plan and separate history", async () => {
  for (const path of ["AGENTS.md", "README.md", "replit.md", "roadmap.md", "docs/README.md"]) {
    const document = await read(path);
    assert.match(document, /\]\([^)]*planning-proposal\.md(?:#[^)]*)?\)/);
  }
  const index = await read("docs/README.md");
  assert.match(index, /history\//);
  assert.match(index, /정본[\s\S]*이력/);
  assert.doesNotMatch(await read("roadmap.md"), /^#{2,}\s*(?:긴급|다음 개발|이후 개발)/m);
});

test("current product policy preserves post access and feature-first development", async () => {
  const proposal = await read("docs/product/planning-proposal.md");
  assert.match(section(proposal, "접근과 공개 범위"), /모든 `posts`[^\n]*회원 전용/);
  const integration = section(proposal, "게시글과 경조사 통합");
  assert.match(integration, /`posts`[\s\S]*`categories`/);
  assert.match(integration, /`부고`[\s\S]*`경사`[\s\S]*`결혼`[\s\S]*`개원`/);
  const goals = section(proposal, "다음 개발 목표");
  assert.match(goals, /통계|역사|결제/);
  // A QA backlog heading is different from explaining that QA is outside a task.
  assert.doesNotMatch(
    goals,
    /^\s*(?:#{1,6}|[-*]|\d+\.)\s*(?:\*\*)?(?:QA|회귀 검사|smoke check)\s*(?:대기|목록|실행|완료 조건)/im,
  );
  assert.match(await read("AGENTS.md"), /개발 직후[^\n]*정적 검사/);
});

test("current consent and termination guidance does not designate archived submission files", async () => {
  const guide = await read("docs/runbooks/kakao-consent-review-guide.md");
  const submission = section(guide, "심사 신청 입력값");
  assert.match(submission, /과거 심사 자료/);
  assert.doesNotMatch(submission, /회원가입 화면 또는 시나리오:\s*[^\n]*\.pdf/);
  for (const document of [guide, await read("client/src/features/legal/privacy.tsx")]) {
    assert.match(document, /가입 거절[\s\S]*카카오 연결[\s\S]*해제[\s\S]*신청정보[\s\S]*파기/);
    assert.match(document, /HMAC-SHA-256/);
    assert.match(document, /종료 시각/);
  }
});

test("DB instructions distinguish targets and exclude the runtime session table", async () => {
  const operations = await read("docs/runbooks/database-operations.md");
  for (const heading of ["개발 변경", "운영 변경", "완료된 전환과 재실행 경계"])
    section(operations, heading);
  assert.match(section(operations, "운영 변경"), /승인/);
  assert.match(await read("drizzle.config.ts"), /tablesFilter:\s*\["!session"\]/);
  assert.match(
    await read("docs/reference/database-schema.md"),
    /connect-pg-simple[\s\S]*session|session[\s\S]*connect-pg-simple/,
  );
});
