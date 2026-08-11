import assert from "node:assert/strict";
import test from "node:test";
import { SCHEMA_EXCEPTION_RULES, assertSchemaExceptionTuple } from "./schema-exception-contract";

test("schema exception registry is the exact 21 plus 4 closed set", () => {
  assert.equal(SCHEMA_EXCEPTION_RULES.length, 25);
  assert.equal(SCHEMA_EXCEPTION_RULES.filter((rule) => rule.exceptionClass === "pre_anchor_blocking").length, 21);
  assert.equal(SCHEMA_EXCEPTION_RULES.filter((rule) => rule.exceptionClass === "legacy_not_valid").length, 4);
  assert.equal(new Set(SCHEMA_EXCEPTION_RULES.map((rule) => rule.predicateSql)).size, 25);
  assert.equal(SCHEMA_EXCEPTION_RULES[0].ruleCode, "USERS_EMAIL_CANONICAL_BLANK");
});

test("every rule accepts only its legal status and resolution tuples", () => {
  for (const rule of SCHEMA_EXCEPTION_RULES) {
    assert.doesNotThrow(() => assertSchemaExceptionTuple({ ruleCode: rule.ruleCode, exceptionClass: rule.exceptionClass, status: "open", resolutionCode: null }));
    assert.doesNotThrow(() => assertSchemaExceptionTuple({ ruleCode: rule.ruleCode, exceptionClass: rule.exceptionClass, status: "resolved", resolutionCode: "SOURCE_FIXED" }));
    assert.doesNotThrow(() => assertSchemaExceptionTuple({ ruleCode: rule.ruleCode, exceptionClass: rule.exceptionClass, status: "waived", resolutionCode: "OWNER_WAIVER" }));
    if (rule.duplicateClass) {
      assert.doesNotThrow(() => assertSchemaExceptionTuple({ ruleCode: rule.ruleCode, exceptionClass: rule.exceptionClass, status: "resolved", resolutionCode: "DUPLICATE_RESOLVED" }));
    } else {
      assert.throws(() => assertSchemaExceptionTuple({ ruleCode: rule.ruleCode, exceptionClass: rule.exceptionClass, status: "resolved", resolutionCode: "DUPLICATE_RESOLVED" }), /schema_exception_resolution_tuple_invalid/);
    }
  }
});

test("altered case, unknown, uncovered class, and free text fail closed", () => {
  const base = { ruleCode: "USERS_EMAIL_CANONICAL_BLANK", exceptionClass: "pre_anchor_blocking", status: "open", resolutionCode: null } as const;
  assert.throws(() => assertSchemaExceptionTuple({ ...base, ruleCode: base.ruleCode.toLowerCase() }), /schema_exception_rule_class_invalid/);
  assert.throws(() => assertSchemaExceptionTuple({ ...base, ruleCode: "UNKNOWN" }), /schema_exception_rule_class_invalid/);
  assert.throws(() => assertSchemaExceptionTuple({ ...base, exceptionClass: "uncovered" }), /schema_exception_rule_class_invalid/);
  assert.throws(() => assertSchemaExceptionTuple({ ...base, status: "resolved", resolutionCode: "fixed by owner" }), /schema_exception_resolution_tuple_invalid/);
  assert.throws(() => assertSchemaExceptionTuple({ ...base, status: "open", resolutionCode: "SOURCE_FIXED" }), /schema_exception_resolution_tuple_invalid/);
});
