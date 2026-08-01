import assert from "node:assert/strict";
import test from "node:test";
import { parseObituaryEventSource, parseObituarySms } from "./obituary-parser";

test("does not invent a relationship when an obituary source has no relationship evidence", () => {
  const parsed = parseObituarySms("故 홍길동님 별세 안내\n빈소: 동국병원 장례식장");

  assert.equal(parsed.deceasedRelation, undefined);
  assert.equal(Object.hasOwn(parsed, "deceasedRelation"), false);
});

test("keeps an explicitly stated approved relationship", () => {
  const parsed = parseObituarySms("김동국 동문 부친상\n故 홍길동님 별세");

  assert.equal(parsed.deceasedRelation, "부친");
});

test("does not treat unrelated words as an obituary relationship", () => {
  assert.equal(parseObituarySms("교통사고로 부상하여 치료 중입니다").deceasedRelation, undefined);
  assert.equal(parseObituarySms("장인정신으로 만든 안내문입니다").deceasedRelation, undefined);
  assert.equal(parseObituarySms("부친과 함께 참석했습니다").deceasedRelation, undefined);
});

test("recognizes explicit relationship expressions and normalizes in-laws", () => {
  assert.equal(parseObituarySms("김동국 동문 장인상").deceasedRelation, "빙부");
  assert.equal(parseObituarySms("고인과의 관계: 장모").deceasedRelation, "빙모");
  assert.equal(parseObituarySms("김동국 동문 모친께서 별세하셨습니다").deceasedRelation, "모친");
});

test("Given a dated possessive obituary sentence, When parsing, Then it keeps the relationship", () => {
  const parsed = parseObituarySms(
    "동국한의 07학번 김동국동문의 부친께서 2026년 10월 28일 별세하셨기에 삼가 알려드립니다.",
  );

  assert.equal(parsed.deceasedRelation, "부친");
});

test("Given a possessive alumni obituary sentence, When parsing, Then it keeps the member name", () => {
  const parsed = parseObituaryEventSource(
    "동국한의 07학번 김동국동문의 부친께서 2026년 10월 28일 별세하셨기에 삼가 알려드립니다.",
  );

  assert.equal(parsed.draft.relatedMemberName, "김동국");
});

test("infers a father obituary only when a named member is listed as the deceased man's daughter", () => {
  const parsed = parseObituaryEventSource(`
졸업21기 조은영
故 조성목
(남/78세)
딸
조은영
발인
2026년 8월 3일 10시 00분
빈소
기품장례식장 1호실
  `.trim());

  assert.equal(parsed.draft.relatedMemberName, "조은영");
  assert.equal(parsed.draft.details.relationship, "부친");
  assert.equal(parsed.draft.title, "조은영 동문 부친상");
});

test("does not infer a relationship from a family role without a matching member hint", () => {
  const parsed = parseObituaryEventSource("故 조성목\n남/78세\n딸\n조은영");

  assert.equal(parsed.draft.relatedMemberName, undefined);
  assert.equal(parsed.draft.details.relationship, undefined);
});

test("does not infer a parent relationship when the deceased sex is absent", () => {
  const parsed = parseObituaryEventSource("졸업21기 조은영\n故 조성목\n딸\n조은영");

  assert.equal(parsed.draft.relatedMemberName, "조은영");
  assert.equal(parsed.draft.details.relationship, undefined);
});

test("maps a standard obituary message into the community-event draft", () => {
  const parsed = parseObituaryEventSource(`
김동국 동문 부친상
故김한의 (향년 88세)
발인: 2026년 6월 12일(금요일) 오전 7시 30분
빈소: 동국병원 장례식장 202호실
장지: 동국추모공원
상주: 김동국
마음 전하실 곳: 동국은행 000-000-000000 김동국
연락처: 010-0000-0000
https://example.com/obituary
  `.trim());

  assert.deepEqual(parsed.missingFields, []);
  assert.equal(parsed.draft.eventType, "obituary");
  assert.equal(parsed.draft.relatedMemberName, "김동국");
  assert.equal(parsed.draft.eventDate, "2026년 6월 12일(금요일) 오전 7시 30분");
  assert.equal(parsed.draft.location, "동국병원 장례식장 202호실");
  assert.equal(parsed.draft.contactNumber, "010-0000-0000");
  assert.equal(parsed.draft.accountInfo, "동국은행 000-000-000000 김동국");
  assert.deepEqual(parsed.draft.sourceUrls, ["https://example.com/obituary"]);
  assert.deepEqual(parsed.draft.details, {
    deceasedName: "김한의",
    deceasedAge: 88,
    relationship: "부친",
    funeralDate: "2026년 6월 12일(금요일) 오전 7시 30분",
    funeralHome: "동국병원 장례식장 202호실",
    accountInfo: "동국은행 000-000-000000 김동국",
    sourceUrl: "https://example.com/obituary",
    familyContact: "010-0000-0000",
    burialPlace: "동국추모공원",
    chiefMourner: "김동국",
  });
});

test("extracts a deceased age without an explicit lifespan label from public obituary profiles", () => {
  const parsed = parseObituaryEventSource("故김한의\n76세/ 남");

  assert.equal(parsed.draft.details.deceasedAge, 76);
});

test("extracts a deceased age from a parenthesized gender-first public profile", () => {
  const parsed = parseObituaryEventSource("故김한의\n(남/78세)");

  assert.equal(parsed.draft.details.deceasedAge, 78);
});

test("skips the obituary section heading when extracting chief mourners", () => {
  const parsed = parseObituaryEventSource(`
상주 정보
상주
김동국 김한방
사위
이동국
  `.trim());

  assert.equal(parsed.draft.details.chiefMourner, "김동국 김한방");
});

test("does not treat account selection instructions as a condolence account", () => {
  const parsed = parseObituaryEventSource(`
마음 전하실 곳
조의금을 받으실 상주를 선택하세요.
  `.trim());

  assert.equal(parsed.draft.accountInfo, undefined);
  assert.equal(parsed.draft.details.accountInfo, undefined);
});

test("joins a funeral room split onto the next public page line", () => {
  const parsed = parseObituaryEventSource(`
빈소
동국병원 장례식장
8호실
  `.trim());

  assert.equal(parsed.draft.location, "동국병원 장례식장 8호실");
  assert.equal(parsed.draft.details.funeralHome, "동국병원 장례식장 8호실");
});

test("reports required obituary fields that have no source evidence", () => {
  const parsed = parseObituaryEventSource("故김한의\n관계: 모친\n발인: 2026년 6월 12일");

  assert.deepEqual(parsed.missingFields, ["details.deceasedAge", "details.funeralHome"]);
  assert.equal(parsed.draft.details.deceasedAge, undefined);
  assert.equal(parsed.draft.details.funeralHome, undefined);
});

test("normalizes every approved obituary relationship in event drafts", () => {
  const cases = [
    ["본인상", "본인"],
    ["부친상", "부친"],
    ["모친상", "모친"],
    ["장인상", "빙부"],
    ["장모상", "빙모"],
    ["시부상", "시부"],
    ["시모상", "시모"],
    ["자녀상", "자녀"],
  ] as const;

  for (const [source, expected] of cases) {
    assert.equal(parseObituaryEventSource(source).draft.details.relationship, expected);
  }
});
