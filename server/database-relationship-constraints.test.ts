import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  applyLegacyObituaryDeleteFixture,
  decideRelationshipSequence20,
  detectRelationshipBlockers,
  developmentRelationshipPreflightSql,
  PINNED_BASELINE_COMMIT,
  RELATIONSHIP_CONSTRAINTS,
  RELATIONSHIP_PREFLIGHT_RULES,
  SEQUENCE_15_RELATIONSHIP_QUARANTINE,
  SEQUENCE_20_RELATIONSHIP_RECHECK,
  sequence20RelationshipLockedRecheckSql,
  type RelationshipFixture,
  validateRelationshipContract,
} from "../scripts/database-relationship-constraints";

const happy = JSON.parse(
  readFileSync("server/fixtures/database-architecture/task-7/relationship-cases.json", "utf8"),
) as { state: RelationshipFixture; delete_obituary_id: number; expected_preserved_event_id: number };
const conflict = JSON.parse(
  readFileSync("server/fixtures/database-architecture/task-7/conflict-cases.json", "utf8"),
) as { state: RelationshipFixture; expected_blockers: Array<{ blocker_code: string; row_ids: number[] }> };

test("canonical manifest, current source, and pending lifecycle close the Todo 7 contract", () => {
  assert.equal(validateRelationshipContract(), RELATIONSHIP_CONSTRAINTS);
  assert.equal(RELATIONSHIP_CONSTRAINTS.length, 4);
  assert.deepEqual(RELATIONSHIP_CONSTRAINTS[0], {
    rule_token: "matched_user_id_unique",
    table: "alumni_database",
    kind: "partial_unique",
    columns: ["matched_user_id"],
    predicate_sql: "matched_user_id IS NOT NULL",
    cardinality: "one_user_to_zero_or_one_alumni_row",
    supporting_index: "alumni_database__matched_user_id__idx",
    existing_foreign_key: {
      referenced_table: "users",
      referenced_columns: ["id"],
      on_delete: "NO ACTION",
      on_update: "NO ACTION",
    },
  });
  const legacy = RELATIONSHIP_CONSTRAINTS[1];
  assert.equal(legacy.nullable, true);
  assert.equal(legacy.on_delete, "SET NULL");
  assert.equal(legacy.on_update, "RESTRICT");
  assert.equal(legacy.support_source, "pinned_baseline_existing_unique");
  assert.equal(RELATIONSHIP_CONSTRAINTS[2].predicate_sql, "status='pending'");
  assert.equal(RELATIONSHIP_CONSTRAINTS[3].canonical_expression_sql, "lower(btrim(email))");
});

test("existing alumni FK is identical in the pinned alteration and manifest registry", () => {
  const manifest = JSON.parse(readFileSync("docs/database-manifest.yaml", "utf8"));
  const registryFk = manifest.foreign_keys.find((foreignKey: { table: string; columns: string[] }) =>
    foreignKey.table === "alumni_database" && foreignKey.columns.join(",") === "matched_user_id"
  );
  assert.equal(RELATIONSHIP_CONSTRAINTS[0].existing_foreign_key.on_update, "NO ACTION");
  assert.equal(registryFk.on_update, "NO ACTION");
  assert.ok(manifest.existing_table_alterations.find((entry: { table: string; literal_sql_fragments: string[] }) =>
    entry.table === "alumni_database" && entry.literal_sql_fragments.includes("ON DELETE NO ACTION ON UPDATE NO ACTION")
  ));
});

test("pinned baseline proves the legacy gap and reusable unique support", () => {
  const baseline = JSON.parse(
    readFileSync("server/fixtures/database-architecture/task-7/pinned-baseline.json", "utf8"),
  );
  assert.equal(baseline.source_commit, PINNED_BASELINE_COMMIT);
  assert.equal(baseline.source_path, "docs/database-schema.md");
  assert.equal(baseline.source_git_blob_oid, "ff62cdec5c87794c8888d1d0c758cbdef7958d93");
  assert.equal(baseline.source_sha256, "6d6fc85bc51ebf00213c76a29a299f28bc619074e1d95e1c621b50cb9dac9778");
  assert.deepEqual(baseline.facts, {
    alumni_matched_user_fk: "alumni_database_matched_user_id_users_id_fk",
    alumni_matched_user_on_delete: "NO ACTION",
    alumni_matched_user_on_update: "NO ACTION",
    alumni_matched_user_unique: false,
    community_legacy_obituary_unique: "community_events_legacy_obituary_id_unique",
    community_legacy_obituary_fk: false,
    pending_identity_unique_constraints: 0,
  });
});

test("zero-conflict fixture permits only later materialization", () => {
  assert.deepEqual(detectRelationshipBlockers(happy.state), []);
  assert.deepEqual(decideRelationshipSequence20([]), {
    result: "clear_for_todo_16_materialization",
    locked_recheck_required: true,
    blocker_count: 0,
    constraints_allowed: true,
    source_rewrites: 0,
    automatic_merge: false,
    automatic_delete: false,
    ddl_materialized_by_todo_7: false,
    ddl_applied_by_todo_7: false,
  });
});

test("SET NULL deletion preserves the complete canonical community-event row", () => {
  const before = happy.state.community_events.find((event) => event.id === happy.expected_preserved_event_id);
  assert.ok(before);
  const after = applyLegacyObituaryDeleteFixture(happy.state, happy.delete_obituary_id);
  const preserved = after.community_events.find((event) => event.id === happy.expected_preserved_event_id);
  assert.deepEqual(preserved, { ...before, legacy_obituary_id: null });
  assert.equal(after.community_events.length, happy.state.community_events.length);
  assert.equal(after.obituaries.some((row) => row.id === happy.delete_obituary_id), false);
  assert.deepEqual(happy.state.community_events.find((event) => event.id === happy.expected_preserved_event_id), before);
});

test("duplicate, orphan, and blank-email conflicts quarantine deterministically", () => {
  const blockers = detectRelationshipBlockers(conflict.state);
  assert.deepEqual(
    blockers.map(({ blocker_code, row_ids }) => ({ blocker_code, row_ids })),
    conflict.expected_blockers,
  );
  assert.equal(new Set(blockers.map((entry) => entry.predicate_id)).size, RELATIONSHIP_PREFLIGHT_RULES.length);
  assert.ok(blockers.every((entry) => entry.sequence15_status === "open"));
  assert.ok(blockers.every((entry) => entry.sequence20_outcome === "block_before_ddl"));
  assert.deepEqual(decideRelationshipSequence20(blockers), {
    result: "blocked_by_quarantine",
    locked_recheck_required: true,
    blocker_count: 5,
    constraints_allowed: false,
    source_rewrites: 0,
    automatic_merge: false,
    automatic_delete: false,
    ddl_materialized_by_todo_7: false,
    ddl_applied_by_todo_7: false,
  });
});

test("Todo 7 definitions remain read-only while Todo 16 owns sequence 20 DDL", () => {
  assert.equal(SEQUENCE_15_RELATIONSHIP_QUARANTINE.append_only, true);
  assert.equal(SEQUENCE_15_RELATIONSHIP_QUARANTINE.automatic_merge, false);
  assert.equal(SEQUENCE_15_RELATIONSHIP_QUARANTINE.automatic_delete, false);
  assert.deepEqual(SEQUENCE_20_RELATIONSHIP_RECHECK.lock_tables, [
    "alumni_database", "community_events", "obituaries", "pending_registrations",
  ]);
  assert.equal(SEQUENCE_20_RELATIONSHIP_RECHECK.lock_mode, "SHARE ROW EXCLUSIVE");
  assert.equal(SEQUENCE_20_RELATIONSHIP_RECHECK.repeated_predicate_ids.length, 5);
  assert.equal(SEQUENCE_20_RELATIONSHIP_RECHECK.ddl_materialized_by_todo_7, false);
  assert.equal(SEQUENCE_20_RELATIONSHIP_RECHECK.ddl_applied_by_todo_7, false);
  const locked = sequence20RelationshipLockedRecheckSql();
  assert.match(locked, /^LOCK TABLE alumni_database, community_events, obituaries, pending_registrations IN SHARE ROW EXCLUSIVE MODE;/);
  for (const rule of RELATIONSHIP_PREFLIGHT_RULES) {
    assert.match(locked, new RegExp(rule.blocker_code));
    assert.match(locked, new RegExp(rule.reason_code));
  }
  assert.doesNotMatch(locked, /^\s*(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/im);
  assert.equal(existsSync("migrations/0020_existing_integrity.sql"), true);
});

test("Development preflight is raw-value read-only and emits only blocker codes and row IDs", () => {
  const sql = developmentRelationshipPreflightSql();
  assert.match(sql, /^BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql, /lower\(btrim\(email\)\) AS email_canonical/);
  for (const rule of RELATIONSHIP_PREFLIGHT_RULES) assert.match(sql, new RegExp(rule.blocker_code));
  for (const rule of RELATIONSHIP_PREFLIGHT_RULES) assert.match(sql, new RegExp(rule.reason_code));
  assert.match(sql, /array_agg\(id ORDER BY id\)/);
  assert.doesNotMatch(sql, /^\s*(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE)\b/im);
  assert.match(sql, /ROLLBACK;\n$/);
  assert.doesNotMatch(sql, /SELECT[^;]*(?:kakao_id|email_canonical),/i);
});

test("canonical manifest bytes remain pinned", () => {
  const digest = execFileSync("shasum", ["-a", "256", "docs/database-manifest.yaml"], { encoding: "utf8" })
    .trim().split(/\s+/)[0];
  assert.equal(digest, "bf7216af6f30a366c0adad4b355fc6c4bed0aaf625154a70d063db2864d86b3b");
});

test("Todo 7 harness can select only the no-write alumni sync source test", () => {
  const verifier = readFileSync("scripts/verify-database-architecture.ts", "utf8");
  const start = verifier.indexOf("function runTaskSeven");
  const end = verifier.indexOf("if (process.argv[2]", start);
  const taskSeven = start >= 0 && end > start ? verifier.slice(start, end) : "";
  const mainTestStart = taskSeven.indexOf("const tests = runLogged");
  const mainTestEnd = taskSeven.indexOf("], testLog);", mainTestStart);
  assert.ok(mainTestStart >= 0 && mainTestEnd > mainTestStart);
  assert.doesNotMatch(taskSeven.slice(mainTestStart, mainTestEnd), /server\/alumni-sync-storage\.test\.ts/);
  const pattern = "--test-name-pattern=alumni sync storage uses one advisory-locked transaction without delete";
  const patternIndex = taskSeven.indexOf(pattern);
  const syncFileIndex = taskSeven.indexOf('"server/alumni-sync-storage.test.ts"');
  assert.ok(patternIndex >= 0 && syncFileIndex > patternIndex);
  assert.equal((taskSeven.match(/"server\/alumni-sync-storage\.test\.ts"/g) ?? []).length, 1);
  assert.doesNotMatch(taskSeven, /development helium fixture proves preview, guarded apply, rollback, and cleanup/);
});
