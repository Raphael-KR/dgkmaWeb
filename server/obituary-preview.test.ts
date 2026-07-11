import assert from "node:assert/strict";
import test from "node:test";
import { admissionYearLabel } from "./obituary-preview";

test("admission year labels require a real calendar date", () => {
  assert.equal(admissionYearLabel("1986-03-02"), "86학번");
  assert.equal(admissionYearLabel("1986년 3월 2일"), "86학번");
  assert.equal(admissionYearLabel("1986-02-31"), undefined);
  assert.equal(admissionYearLabel("1986"), undefined);
  assert.equal(admissionYearLabel("알 수 없음"), undefined);
});
