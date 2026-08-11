import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { expectedCurrentIndexNames } from "../scripts/verify-database-index-workload";

const corpus = JSON.parse(
  readFileSync("server/fixtures/database-architecture/task-8/workload-corpus.json", "utf8"),
) as {
  schema_version: string;
  cardinality_tables: string[];
  existing_indexes: string[];
  manifest_owned_indexes: Array<{
    name: string;
    table: string;
    columns: string[];
    kind: "index" | "unique";
    purpose: string;
    state: string;
  }>;
  workloads: Array<{
    id: string;
    query: string;
    required_prefix: string[];
    manifest_index: string | null;
  }>;
  rejected_future_candidates: Array<{
    name: string;
    table: string;
    columns: string[];
    kind: "index";
    definition: string;
    workload_id: string;
    reason: string;
  }>;
  forbidden_candidate_families: string[];
};

function utf8Prefix(value: string, byteLimit: number): string {
  let result = "";
  for (const character of value) {
    if (Buffer.byteLength(result + character, "utf8") > byteLimit) break;
    result += character;
  }
  return result;
}

function expectedObjectName(
  table: string,
  columns: string[],
  kind: "index" | "unique",
): string {
  const suffix = kind === "unique" ? "key" : "idx";
  const fullName = table + "__" + columns.join("_") + "__" + suffix;
  if (Buffer.byteLength(fullName, "utf8") <= 63) return fullName;
  const digest = createHash("sha256").update(fullName).digest("hex").slice(0, 10);
  return utf8Prefix(fullName, 52) + "_" + digest;
}

test("workload corpus is a closed read-only measurement contract", () => {
  assert.equal(corpus.schema_version, "dgkma-task-8-workload-corpus-v1");
  assert.equal(corpus.cardinality_tables.length, 13);
  assert.equal(new Set(corpus.cardinality_tables).size, 13);
  assert.equal(corpus.existing_indexes.length, 20);
  assert.equal(new Set(corpus.existing_indexes).size, 20);
  assert.equal(corpus.workloads.length, 15);
  assert.equal(new Set(corpus.workloads.map(({ id }) => id)).size, 15);
  assert.equal(expectedCurrentIndexNames(corpus as never).length, 432);
  for (const workload of corpus.workloads) {
    assert.match(workload.query, /^SELECT /);
    assert.doesNotMatch(workload.query, /^(?:INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
    assert.ok(!workload.query.includes(";"));
  }
});

test("every required workload prefix resolves to a fixed manifest index", () => {
  assert.equal(
    expectedObjectName(
      "this_table_name_is_long_enough_for_postgresql_object_name",
      ["first_column", "second_column"],
      "index",
    ),
    "this_table_name_is_long_enough_for_postgresql_object_071db7e428",
  );
  const indexes = new Map(corpus.manifest_owned_indexes.map((index) => [index.name, index]));
  assert.equal(indexes.size, corpus.manifest_owned_indexes.length);
  for (const index of corpus.manifest_owned_indexes) {
    assert.ok(Buffer.byteLength(index.name, "utf8") <= 63);
    if (index.state === "fixed_not_yet_applied") {
      assert.equal(index.name, expectedObjectName(index.table, index.columns, index.kind));
    }
  }
  for (const workload of corpus.workloads) {
    if (workload.required_prefix.length === 0) continue;
    assert.ok(workload.manifest_index, workload.id + " must name its fixed index");
    for (const name of workload.manifest_index!.split("+")) {
      const index = indexes.get(name);
      assert.ok(index, workload.id + " references unknown index " + name);
    }
  }
  const paymentIndex = indexes.get("payments__user_id__idx");
  assert.deepEqual(paymentIndex?.columns, ["user_id"]);
  assert.equal(paymentIndex?.purpose, "fk");
});

test("future candidates are closed, query-bound, and never adopted", () => {
  const workloads = new Set(corpus.workloads.map(({ id }) => id));
  assert.equal(corpus.rejected_future_candidates.length, 6);
  for (const candidate of corpus.rejected_future_candidates) {
    assert.ok(workloads.has(candidate.workload_id));
    assert.match(candidate.definition, /^CREATE INDEX ON public\.[a-z_]+ /);
    assert.match(candidate.reason, /^rejected_future_/);
    assert.equal(
      candidate.name,
      expectedObjectName(candidate.table, candidate.columns, candidate.kind),
    );
    assert.ok(Buffer.byteLength(candidate.name, "utf8") <= 63);
  }
  assert.deepEqual(corpus.forbidden_candidate_families, [
    "trigram",
    "full_text_search",
    "duplicate_left_prefix",
  ]);
});
