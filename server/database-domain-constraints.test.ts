import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  captureObservedPredicates,
  canonicalPhone,
  canonicalPhoneSql,
  canonicalPhoneVectorSql,
  CANONICAL_PHONE_VECTORS,
  decideSequence20,
  developmentInventorySql,
  DOMAIN_EXCEPTION_RULES,
  parseSequence15SqlRegistry,
  sequence15SqlRegistry,
  validateClosedRuleContract,
} from "../scripts/database-domain-constraints";

const fixtures = JSON.parse(
  readFileSync("server/fixtures/database-architecture/task-6/domain-cases.json", "utf8"),
);

test("canonical manifest predicate registry projects bijectively to 21+4 closed exception codes", () => {
  const rules = validateClosedRuleContract();
  assert.equal(rules.length, 25);
  assert.equal(rules.filter((rule) => rule.exception_class === "pre_anchor_blocking").length, 21);
  assert.equal(rules.filter((rule) => rule.exception_class === "legacy_not_valid").length, 4);
  assert.equal(new Set(rules.map((rule) => rule.predicate_id)).size, 25);
  assert.equal(new Set(rules.map((rule) => rule.exception_code)).size, 25);
  const blankEmail = rules.find((rule) => rule.predicate_id === "users.email_canonical_nonblank");
  assert.equal(blankEmail?.exception_code, "USERS_EMAIL_CANONICAL_BLANK");
  assert.equal(blankEmail?.predicate_sql, "email IS NOT NULL AND btrim(email) = ''");
});

test("every fresh-connection fixture captures one exact uppercase code before DDL", () => {
  assert.equal(fixtures.schema_version, "dgkma-domain-constraint-fixtures-v1");
  assert.equal(fixtures.fresh_connection, true);
  assert.equal(fixtures.cases.length, 25);
  for (const fixture of fixtures.cases) {
    const [captured] = captureObservedPredicates([fixture.predicate_id]);
    assert.deepEqual(captured, {
      predicate_id: fixture.predicate_id,
      exception_code: fixture.exception_code,
      exception_class: fixture.exception_class,
      table: DOMAIN_EXCEPTION_RULES.find((rule) => rule.predicate_id === fixture.predicate_id)?.table,
      sequence15_status: "open",
      sequence20_outcome: fixture.sequence20_outcome,
    });
  }
});

test("application and generated SQL registries have the same 25 tuples", () => {
  const sqlProjection = parseSequence15SqlRegistry(sequence15SqlRegistry());
  const applicationProjection = DOMAIN_EXCEPTION_RULES.map(({ predicate_sql: _predicateSql, ...rule }) => rule);
  assert.deepEqual(
    [...sqlProjection].sort((a, b) => a.predicate_id.localeCompare(b.predicate_id)),
    [...applicationProjection].sort((a, b) => a.predicate_id.localeCompare(b.predicate_id)),
  );
});

test("sequence 20 blocks pre-anchor fixtures but permits only NOT VALID legacy checks", () => {
  const pre = captureObservedPredicates(["users.email_canonical_nonblank"]);
  assert.deepEqual(decideSequence20(pre), {
    result: "blocked_pre_anchor",
    pre_anchor_blocking_count: 1,
    legacy_not_valid_count: 0,
    ddl_allowed: false,
    validate_legacy_constraints: false,
    source_rewrites: 0,
  });
  const legacy = captureObservedPredicates(["payments.amount_positive"]);
  assert.deepEqual(decideSequence20(legacy), {
    result: "not_valid_only",
    pre_anchor_blocking_count: 0,
    legacy_not_valid_count: 1,
    ddl_allowed: true,
    validate_legacy_constraints: false,
    source_rewrites: 0,
  });
});

test("omitted, extra, duplicate, and unmapped predicates fail closed before DDL", () => {
  const omission = JSON.parse(
    readFileSync("server/fixtures/database-architecture/task-6/omitted-predicate.json", "utf8"),
  );
  const omitted = DOMAIN_EXCEPTION_RULES.filter(
    (rule) => rule.predicate_id !== omission.omitted_contract_predicate_id,
  );
  assert.throws(
    () => captureObservedPredicates([omission.observed_predicate_id], omitted),
    new RegExp(omission.expected_error),
  );
  assert.throws(() => validateClosedRuleContract("docs/database-manifest.yaml", omitted), /unregistered_schema_exception_rule/);
  assert.throws(
    () => validateClosedRuleContract("docs/database-manifest.yaml", [...DOMAIN_EXCEPTION_RULES, DOMAIN_EXCEPTION_RULES[0]]),
    /unregistered_schema_exception_rule/,
  );
  const altered = DOMAIN_EXCEPTION_RULES.map((rule, index) => index === 0
    ? { ...rule, exception_code: "users_email_canonical_blank" }
    : rule);
  assert.throws(() => validateClosedRuleContract("docs/database-manifest.yaml", altered), /unregistered_schema_exception_rule/);
});

test("Todo 6 defines sequence contracts without materializing future SQL", () => {
  assert.equal(existsSync("migrations/0015_existing_data_exception_capture.sql"), false);
  assert.equal(existsSync("migrations/0020_existing_integrity.sql"), false);
  for (const descriptorPath of [
    "migrations/artifacts/0015_existing_data_exception_capture.json",
    "migrations/artifacts/0020_existing_integrity.json",
  ]) {
    const descriptor = JSON.parse(readFileSync(descriptorPath, "utf8"));
    assert.equal(descriptor.materialization_state, "not_materialized");
    assert.equal(descriptor.artifact_sha256, null);
  }
});

test("Development inventory is a raw-value read-only transaction with both class counts", () => {
  const sql = developmentInventorySql();
  assert.match(sql, /^BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql, /WITH users_projected AS/);
  assert.match(sql, /lower\(btrim\(email\)\) AS email_canonical/);
  assert.match(sql, /SUM\(violation_count\) OVER \(PARTITION BY exception_class\)/);
  assert.match(sql, /\^10\[0-9\]\{8\}\$' THEN '0'\|\|regexp_replace/);
  assert.match(sql, /projection_equal/);
  assert.equal((sql.match(/ AS predicate_id/g) ?? []).length, 25);
  assert.doesNotMatch(sql, /\b(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/i);
  assert.match(sql, /ROLLBACK;\n$/);
});

test("application and manifest-derived SQL cover every canonical phone branch on both surfaces", () => {
  assert.equal(CANONICAL_PHONE_VECTORS.length, 6);
  for (const vector of CANONICAL_PHONE_VECTORS) {
    assert.equal(canonicalPhone(vector.raw), vector.expected, vector.vector_id);
  }
  const manifest = JSON.parse(readFileSync("docs/database-manifest.yaml", "utf8"));
  assert.equal(canonicalPhoneSql("phone_number"), manifest.canonical_phone_sql.replace(/\braw\b/g, "phone_number"));
  const vectorSql = canonicalPhoneVectorSql();
  assert.equal((vectorSql.match(/\('users\.phone_number'/g) ?? []).length, 6);
  assert.equal((vectorSql.match(/\('alumni_database\.mobile'/g) ?? []).length, 6);
  for (const vector of CANONICAL_PHONE_VECTORS) assert.match(vectorSql, new RegExp(vector.vector_id));
});
