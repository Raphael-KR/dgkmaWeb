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
