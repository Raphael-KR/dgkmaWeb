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

test("planning proposal names REST OAuth and PostgreSQL alumni_database as current runtime sources", async () => {
  const proposal = await read("planning_proposal.md");

  assert.match(proposal, /카카오 REST OAuth/);
  assert.doesNotMatch(proposal, /카카오싱크/);
  assert.match(proposal, /PostgreSQL `alumni_database`/);
  assert.match(proposal, /1회 이관/);
  assert.match(proposal, /런타임 원본/);
  assert.doesNotMatch(proposal, /신규 가입 매칭[^\n]*Google Sheets[^\n]*의존/);
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
  const markerTable = productionSchema.indexOf("kakao_identity_terminations");
  const startedAtColumn = productionSchema.indexOf("kakao_oauth_states.started_at");
  const republish = productionSchema.indexOf("Republish", startedAtColumn);
  assert.ok(markerTable >= 0 && markerTable < startedAtColumn);
  assert.ok(startedAtColumn < republish);
});
