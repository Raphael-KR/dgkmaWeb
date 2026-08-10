import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("policy preview verifier is read-only, exact-graph bound, and PII-free on stdout", async () => {
  const source = await readFile(new URL("../../scripts/verify-ledger-dues-policy-preview-v2.ts", import.meta.url), "utf8");
  assert.match(source, /REPEATABLE READ READ ONLY/);
  assert.match(source, /terminal_transaction: "ROLLBACK"/);
  assert.match(source, /expectedResultCount = 2 \+ input\.rows\.length \* 3/);
  assert.match(source, /result_entities !== expectedResultCount/);
  assert.match(source, /audits !== expectedResultCount/);
  assert.match(source, /decision_items !== 0/);
  assert.match(source, /linked_policy_rows !== 0/);
  assert.doesNotMatch(source.slice(source.indexOf("console.log")), /normalized_payload|raw_payload|source_display_snapshot/);
  assert.doesNotMatch(source, /PROD_DATABASE|production/);
});
