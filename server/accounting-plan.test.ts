import assert from "node:assert/strict";
import test from "node:test";
import {
  ACCOUNTING_MANIFEST_COMMIT,
  ACCOUNTING_MANIFEST_SHA256,
  OWNER_DECISION_IDS,
  validateAccountingPlan,
} from "../scripts/validate-accounting-plan";

test("tracked accounting plan binds the sole canonical manifest and complete owner decisions", () => {
  const result = validateAccountingPlan("docs/plans/accounting-dues-prd.md");
  assert.equal(result.result, "approved");
  assert.deepEqual(result.violations, []);
  assert.equal(result.manifest_sha256, ACCOUNTING_MANIFEST_SHA256);
  assert.equal(result.manifest_commit, ACCOUNTING_MANIFEST_COMMIT);
  assert.equal(result.owner_decision_count, OWNER_DECISION_IDS.length);
  assert.equal(result.accounting_gate_pairs, 1);
  assert.equal(result.architecture_gate_pairs, 1);
});

test("obsolete overlap and fixed table-count assumptions emit exact rule codes", () => {
  const result = validateAccountingPlan(
    "server/fixtures/database-architecture/task-11/obsolete-accounting-plan.md",
  );
  assert.equal(result.result, "rejected");
  const rules = result.violations.map((violation) => violation.rule);
  assert.ok(rules.includes("obsolete-overlap-role"));
  assert.ok(rules.includes("fixed-new-table-count"));
});
