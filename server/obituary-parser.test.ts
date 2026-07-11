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
