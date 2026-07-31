import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const catalog = readFileSync("scripts/database-schema-catalog.sql", "utf8");
const fixture = JSON.parse(
  readFileSync("server/fixtures/database-architecture/task-4/catalog-cases.json", "utf8"),
) as {
  schema_version: string;
  required_sections: string[];
  failure_cases: Array<{ name: string; mutation: string; expected_result: string }>;
};

test("catalog safety gate precedes every canonical object-class section", () => {
  assert.equal(fixture.schema_version, "dgkma-task-4-catalog-fixtures-v1");
  const safetyOffset = catalog.indexOf("__SAFETY_GATE__ ok");
  assert.ok(safetyOffset >= 0);
  let priorOffset = safetyOffset;
  for (const section of fixture.required_sections) {
    const marker = "__SECTION__ " + section;
    assert.equal(catalog.split(marker).length - 1, 1, marker + " must appear once");
    const offset = catalog.indexOf(marker);
    assert.ok(offset > priorOffset, marker + " must be in canonical order after the safety gate");
    priorOffset = offset;
  }
  assert.ok(catalog.indexOf("__CATALOG_INSPECTION_COMPLETE__") > priorOffset);
});

test("catalog captures security and migration drift without weakening read-only gates", () => {
  for (const token of [
    "BEGIN TRANSACTION READ ONLY",
    "SET LOCAL statement_timeout = '5s'",
    "current_database() = :'expected_database'",
    "current_setting('transaction_read_only') = 'on'",
    "WHEN 'x' THEN 'EXCLUDE'",
    "tgdeferrable AS is_deferrable",
    "tginitdeferred AS initially_deferred",
    "pg_get_userbyid(c.relowner) AS owner_name",
    "pg_get_userbyid(p.proowner) AS owner_name",
    "pg_default_acl",
    "p.polroles",
    "pg_get_functiondef(p.oid)",
    "p.proconfig",
    "search_path=%",
    "pg_available_extensions",
    "to_regprocedure('gen_random_uuid()')",
    "public.schema_release_runs",
    "public.schema_change_ledger",
    "public.schema_capability_receipts",
  ]) {
    assert.ok(catalog.includes(token), "missing catalog contract: " + token);
  }
  assert.match(catalog, /string_agg\(entry::text, ',' ORDER BY entry::text\)/);
  assert.match(catalog, /ORDER BY pg_catalog\.to_jsonb\(r\)::text/);
});

test("failure fixture closes the exact three refusal paths", () => {
  assert.deepEqual(
    fixture.failure_cases,
    [
      {
        name: "wrong_expected_database",
        mutation: "expected_database_mismatch",
        expected_result: "nonzero_before_catalog_body",
      },
      {
        name: "writable_transaction",
        mutation: "remove_read_only_transaction",
        expected_result: "nonzero_before_catalog_body",
      },
      {
        name: "statement_timeout",
        mutation: "force_statement_timeout",
        expected_result: "nonzero_before_catalog_body",
      },
    ],
  );
});
