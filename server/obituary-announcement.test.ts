import assert from "node:assert/strict";
import test from "node:test";
import { renderObituaryAnnouncement } from "@shared/obituary-announcement";

const input = {
  graduationClass: "8기",
  admissionYear: "86학번",
  memberName: "김동국",
  membershipTier: "권리회원",
  memberTitle: "동국한의원 원장",
  relationship: "부친" as const,
  deceasedName: "김한의",
  deceasedAge: 88,
  funeralHome: "동국병원 장례식장 202호실",
  funeralDate: "2026년 6월 12일(금요일)",
  memberPhone: "010-0000-0000",
  accountInfo: "동국은행 000-000-000000 김동국",
  sourceUrl: "https://example.com/obituary",
};

test("renders the approved obituary template in writing-guide order", () => {
  const text = renderObituaryAnnouncement(input);

  assert.equal(
    text,
    `#부고
본회 졸업8기(86학번) 김동국 권리회원(동국한의원 원장) 부친상

- 고인: 故김한의 (향년 88세)
- 빈소: 동국병원 장례식장 202호실
- 발인: 2026년 6월 12일(금요일)

- 연락처: 김동국 010-0000-0000
- 마음 전하실 곳: 동국은행 000-000-000000 김동국

* 유가족 및 장례식장 위치 확인: https://example.com/obituary

삼가 고인의 명복을 빕니다.
-동국대학교 한의과대학 동문회-`,
  );
});

test("self obituary adds the member-self tag", () => {
  assert.match(renderObituaryAnnouncement({ ...input, relationship: "본인" }), /^#부고 #동문본인상\n/);
});

test("omits absent optional lines without empty labels", () => {
  const text = renderObituaryAnnouncement({
    ...input,
    memberTitle: undefined,
    accountInfo: undefined,
    sourceUrl: undefined,
  });

  assert.doesNotMatch(text, /마음 전하실 곳/);
  assert.doesNotMatch(text, /위치 확인/);
  assert.doesNotMatch(text, /\(\)/);
});
