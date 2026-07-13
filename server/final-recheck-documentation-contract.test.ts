import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function read(path: string) {
  return readFile(new URL(path, root), "utf8");
}

test("Kakao callback documentation describes the actual SPA authorization-code flow", async () => {
  const [guide, walkthrough] = await Promise.all([
    read("docs/kakao-consent-review-guide.md"),
    read("walkthrough.md"),
  ]);

  for (const document of [guide, walkthrough]) {
    assert.match(document, /카카오가 callback URL의 query로 인가 코드와 state를 전달/);
    assert.match(document, /브라우저가 인가 코드와 state를 서버에 한 번 전달/);
    assert.match(document, /서버 응답과 앱 로그에 전체 인가 코드나 토큰을 남기지 않/);
    assert.doesNotMatch(document, /브라우저[^\n]*전체 인가 코드[^\n]*노출하지 않/);
  }
});

test("planning proposal distinguishes the managed alumni source from the runtime copy", async () => {
  const proposal = await read("planning_proposal.md");
  const currentPlan = proposal.slice(0, proposal.indexOf("## 9. 변경되거나 폐기된 방향"));

  assert.match(proposal, /카카오 REST OAuth/);
  assert.doesNotMatch(currentPlan, /카카오싱크/);
  assert.match(proposal, /카카오 JavaScript SDK·카카오싱크[\s\S]*방향 변경/);
  assert.match(proposal, /PostgreSQL `alumni_database`/);
  assert.match(proposal, /1회 이관/);
  assert.match(proposal, /Google Sheets를 동문 명부의 (?:\*\*)?관리 원본/);
  assert.match(proposal, /런타임 복제본/);
  assert.doesNotMatch(proposal, /신규 가입 매칭[^\n]*Google Sheets[^\n]*의존/);
});

test("planning proposal is the single current product and development plan", async () => {
  const [proposal, roadmap, readme, replit, walkthrough] = await Promise.all([
    read("planning_proposal.md"),
    read("roadmap.md"),
    read("README.md"),
    read("replit.md"),
    read("walkthrough.md"),
  ]);

  assert.match(proposal, /제품·개발 통합 계획서/);
  assert.match(proposal, /현재 검증 완료 기반/);
  assert.match(proposal, /P0\/P1 보안·무결성 과제/);
  assert.match(proposal, /현재 진행 중인 개발/);
  assert.match(proposal, /장기·보류 과제/);
  assert.match(proposal, /변경되거나 폐기된 방향/);
  assert.match(proposal, /community_events` 17개 컬럼 확인/);
  assert.match(proposal, /Supabase 클라이언트 로그인[\s\S]*방향 변경/);
  assert.doesNotMatch(proposal, /\*\*미구현\*\*: 통합 경조사 모델/);

  assert.match(roadmap, /planning_proposal\.md/);
  assert.match(roadmap, /독립적인 상태나 계획을 관리하지 않습니다/);
  assert.doesNotMatch(roadmap, /## 긴급|## 다음|## 이후|\| P0 \|/);

  for (const document of [readme, replit, walkthrough]) {
    assert.match(document, /planning_proposal\.md/);
  }
  assert.doesNotMatch(readme, /\[roadmap\.md\]/);
});

test("development continues before one consolidated user QA pass", async () => {
  const [proposal, walkthrough, changelog] = await Promise.all([
    read("planning_proposal.md"),
    read("walkthrough.md"),
    read("CHANGELOG.md"),
  ]);

  assert.match(proposal, /개발 완료 후 통합 QA에서 한 번에 진행/);
  assert.match(proposal, /자동화·개발 DB·개발 서버 검증 결과/);
  assert.match(proposal, /결제박사 사용 예정/);
  for (const term of ["API", "수수료", "정산", "환불", "영수증", "보안 조건"]) {
    assert.match(proposal, new RegExp(term));
  }
  assert.match(walkthrough, /## QA 실행 원칙/);
  assert.match(walkthrough, /기능별로 사용자에게 반복 요청하지 않고 누적/);
  assert.match(changelog, /핵심 개발 완료 후 통합 QA에서 한 번에 수행/);
});

test("privacy policy and approved design record the pending rejection destruction contract", async () => {
  const [privacy, design, plan] = await Promise.all([
    read("client/src/pages/privacy.tsx"),
    read("docs/superpowers/specs/2026-07-12-kakao-consent-and-account-deletion-design.md"),
    read("docs/superpowers/plans/2026-07-12-kakao-consent-and-account-deletion.md"),
  ]);

  for (const document of [privacy, design, plan]) {
    assert.match(
      document,
      /가입 거절[^\n]*즉시 카카오 연결[^\n]*해제[^\n]*신청정보[^\n]*파기[^\n]*실패[^\n]*거절 미완료/,
    );
  }
});

test("termination marker purpose, retention, admin-key scope, and production schema order are documented", async () => {
  const [agents, replit, privacy, design, plan] = await Promise.all([
    read("AGENTS.md"),
    read("replit.md"),
    read("client/src/pages/privacy.tsx"),
    read("docs/superpowers/specs/2026-07-12-kakao-consent-and-account-deletion-design.md"),
    read("docs/superpowers/plans/2026-07-12-kakao-consent-and-account-deletion.md"),
  ]);

  for (const document of [agents, replit]) {
    assert.match(document, /회원 탈퇴 및 가입 거절의 카카오 연결 해제/);
  }
  for (const document of [privacy, design, plan]) {
    assert.match(document, /HMAC-SHA-256/);
    assert.match(document, /SESSION_SECRET/);
    assert.match(document, /종료 시각/);
    assert.match(document, /최신 marker 1건/);
    assert.match(document, /종료보다 먼저 시작된 OAuth/);
    assert.match(document, /종료 이후 새로 시작한 OAuth/);
  }

  const productionSchema = replit.slice(replit.indexOf("프로덕션 선행 additive 스키마 순서"));
  const stateTable = productionSchema.indexOf("kakao_oauth_states");
  const startedAtColumn = productionSchema.indexOf("kakao_oauth_states.started_at");
  const markerTable = productionSchema.indexOf("kakao_identity_terminations", startedAtColumn);
  const republish = productionSchema.indexOf("Republish", markerTable);
  assert.ok(stateTable >= 0 && stateTable <= startedAtColumn);
  assert.ok(startedAtColumn < markerTable);
  assert.ok(markerTable < republish);
});
