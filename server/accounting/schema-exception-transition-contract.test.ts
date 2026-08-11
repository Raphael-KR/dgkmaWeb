import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("sequence 130 installs the exact fail-closed registry and transition objects", () => {
  const sql = readFileSync("migrations/manual/0130_schema_exception_registry_enforcement.sql", "utf8");
  assert.match(sql, /schema_exception_historical_code_migration_required/);
  assert.match(sql, /schema_data_exceptions__rule_code_registry__check/);
  assert.match(sql, /schema_data_exceptions__rule_class_registry__check/);
  assert.match(sql, /schema_data_exceptions__status_resolution__check/);
  assert.match(sql, /schema_data_exceptions__resolution_duplicate__check/);
  assert.match(sql, /schema_data_exceptions__lifecycle_actor__check/);
  assert.match(sql, /schema_data_exceptions__capture_chain__check/);
  assert.match(sql, /CREATE FUNCTION public\.dgkma_validate_schema_exception_transition_v1/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OR DELETE ON public\.schema_data_exceptions/);
  assert.match(sql, /schema_exception_capture_closed/);
  assert.match(sql, /ERRCODE='23514'/);
  assert.doesNotMatch(sql, /users\.email_canonical_nonblank|payments\.amount_positive/);
  assert.equal((sql.match(/'USERS_EMAIL_CANONICAL_BLANK'/g) ?? []).length >= 2, true);
});
