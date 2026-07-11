import assert from "node:assert/strict";
import test from "node:test";
import { parseObituarySms } from "./obituary-parser";

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
