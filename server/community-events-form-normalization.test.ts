import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOptionalNumber,
  normalizeOptionalRelationship,
  normalizeOptionalText,
} from "../client/src/pages/events/event-field-normalization";

test("blank optional obituary text serializes as undefined", () => {
  assert.equal(normalizeOptionalText(""), undefined);
  assert.equal(normalizeOptionalText("  \t\n"), undefined);
  assert.equal(normalizeOptionalText("  동국병원  "), "동국병원");
});

test("empty relationship selection serializes as undefined", () => {
  assert.equal(normalizeOptionalRelationship(""), undefined);
  assert.equal(normalizeOptionalRelationship("   "), undefined);
  assert.equal(normalizeOptionalRelationship("부친"), "부친");
});

test("invalid obituary numbers serialize as undefined while valid numbers remain", () => {
  assert.equal(normalizeOptionalNumber(""), undefined);
  assert.equal(normalizeOptionalNumber("   "), undefined);
  assert.equal(normalizeOptionalNumber("not-a-number"), undefined);
  assert.equal(normalizeOptionalNumber(Number.NaN), undefined);
  assert.equal(normalizeOptionalNumber("88"), 88);
});
