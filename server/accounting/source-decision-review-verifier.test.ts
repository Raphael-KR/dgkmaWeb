import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("live source review verifier is Development-only and emits no review display", async () => {
  const source = await readFile(new URL("../../scripts/verify-source-decision-review-v2.ts", import.meta.url), "utf8");
  assert.match(source, /arg\("--target"\) !== "development"/);
  assert.match(source, /readSourceDecisionReview/);
  assert.match(source, /terminal_transaction: "ROLLBACK"/);
  assert.doesNotMatch(source.slice(source.indexOf("console.log")), /reviewDisplay|decisionPayload/);
  assert.doesNotMatch(source, /PROD_DATABASE|production/);
});
