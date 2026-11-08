import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);

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
  assert.match(proposal, /현재 구현된 기반/);
  assert.match(proposal, /남은 기능 개발/);
  assert.match(proposal, /기존 기능의 보완과 정리/);
  assert.match(proposal, /결정이 필요한 사항/);
  assert.match(proposal, /변경되거나 폐기된 방향/);
  assert.match(proposal, /`community_events` 기반 네 유형/);
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

test("development uses minimal static checks and the plan tracks missing features", async () => {
  const [proposal, agents, readme, replit, walkthrough] = await Promise.all([
    read("planning_proposal.md"),
    read("AGENTS.md"),
    read("README.md"),
    read("replit.md"),
    read("walkthrough.md"),
  ]);

  for (const document of [proposal, agents, readme, replit, walkthrough]) {
    assert.match(document, /개발 직후[^\n]*정적 검사/);
  }
  assert.doesNotMatch(proposal, /QA|검증|회귀|smoke|npm test/i);
  assert.match(proposal, /관리자 게시글 관리/);
  assert.match(proposal, /관리자 통계·리포팅/);
  assert.match(proposal, /실제 회비·서비스 결제/);
  assert.match(proposal, /결제박사 사용 예정/);
  for (const term of ["API", "수수료", "정산", "환불", "영수증", "보안 조건"]) {
    assert.match(proposal, new RegExp(term));
  }
  assert.match(walkthrough, /## 현재 적용 기준/);
  assert.match(walkthrough, /운영 배포와 실계정 QA는 계속 보류/);
  assert.match(proposal, /모든 `posts`는 회원 전용/);
  assert.match(proposal, /구조화 정보는 `posts` 내부 JSON으로 저장/);
  assert.match(proposal, /기존 경조사·부고의 상세 필드 입력 폼을 모두 제거/);
  assert.match(proposal, /홈페이지 서버에서 OpenAI API를 호출/);
  assert.match(proposal, /기존 경조사·레거시 부고 데이터와 상세 주소는 폐기/);
  assert.match(proposal, /`부고`·`경사` 카테고리를 추가/);
  assert.match(proposal, /`경사`의 JSON 유형은 `결혼`·`개원`만 사용/);
  assert.match(proposal, /`기타` 유형은 제거/);
  assert.match(proposal, /게시문 호칭은 부고·경사 모두 `동문·회원·권리회원`으로 통일/);
  assert.doesNotMatch(proposal, /상세 입력은 등록 명령 이후/);
  assert.match(walkthrough, /등록 명령을 누르기 전에는 상세 필드와 미리보기가 표시되지 않/);
  assert.match(walkthrough, /목록 필터 없이 모든 유형의 경조사가 함께 표시/);
});

test("privacy policy and approved design record the pending rejection destruction contract", async () => {
  const [privacy, design, plan] = await Promise.all([
    read("client/src/features/legal/privacy.tsx"),
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
    read("client/src/features/legal/privacy.tsx"),
    read("docs/superpowers/specs/2026-07-12-kakao-consent-and-account-deletion-design.md"),
    read("docs/superpowers/plans/2026-07-12-kakao-consent-and-account-deletion.md"),
  ]);

  for (const document of [agents, replit]) {
    assert.match(document, /회원 탈퇴(?: 및|와) 가입 거절(?:의 카카오)? 연결 해제/);
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
