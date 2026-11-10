import assert from "node:assert/strict";
import test from "node:test";
import { normalizePhoneForComparison } from "./phone-normalization";

test("phone normalization compares Kakao country code with domestic alumni numbers", () => {
  assert.equal(normalizePhoneForComparison("+82 10-9876-5432"), "01098765432");
  assert.equal(normalizePhoneForComparison("010-9876-5432"), "01098765432");
  assert.equal(
    normalizePhoneForComparison("+82 (0)10 9876 5432"),
    normalizePhoneForComparison("010.9876.5432"),
  );
});
