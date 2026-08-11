import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { readArtifactDescriptors } from "../scripts/schema-ledger";
import {
  planRetentionRun,
  RETENTION_CONTRACT,
  RETENTION_JOBS,
  RETENTION_METRIC_FIELDS,
  resolveTaskTenCommitSha,
  retentionAdvisoryLockKey,
  STARTUP_ARTIFACTS,
  STARTUP_LATEST_REQUIRED,
  STARTUP_MANIFEST_SHA256,
  STARTUP_REQUIRED_SEQUENCES,
  startupLedgerInventorySql,
  type StartupDescriptor,
  type StartupLedgerRow,
  validateRetentionMetric,
  verifyRuntimeBoundary,
  verifyStartupLedger,
} from "../scripts/startup-retention-contract";

const root = "server/fixtures/database-architecture/task-10";
const ready = JSON.parse(readFileSync(`${root}/startup-ready.json`, "utf8")) as {
  descriptors: StartupDescriptor[];
  ledger_rows: StartupLedgerRow[];
};
const failures = JSON.parse(readFileSync(`${root}/startup-failure-cases.json`, "utf8")) as {
  cases: Array<{ kind: string; expected_code: string; ledger_rows?: StartupLedgerRow[]; remove_sequence?: number }>;
};
const retention = JSON.parse(readFileSync(`${root}/retention-cases.json`, "utf8")) as {
  now: string;
  cases: Array<{ job_id: Parameters<typeof planRetentionRun>[0]; rows: Parameters<typeof planRetentionRun>[1]; expected_selected_keys: string[] }>;
};

test("exact materialized ledger through sequence 130 is ready with zero emitted DDL", () => {
  assert.deepEqual(STARTUP_REQUIRED_SEQUENCES, [1, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130]);
  assert.deepEqual(STARTUP_LATEST_REQUIRED, { sequence_no: 130, artifact_id: "schema-exception-registry-enforcement-v1" });
  assert.equal(STARTUP_ARTIFACTS.length, 16);
  const result = verifyStartupLedger(ready.ledger_rows, ready.descriptors);
  assert.equal(result.ready, true);
  assert.equal(result.code, "startup_ledger_ready");
  assert.equal(result.observed_latest_sequence, 130);
  assert.equal(result.capability_variant, "preferred_btree_gist");
  assert.deepEqual(result.emitted_ddl, []);
  assert.equal(result.schema_writes, 0);

  const fallbackDescriptors = ready.descriptors;
  const fallbackRows = ready.ledger_rows.map((row) => row.sequence_no === 40
    ? { ...row, artifact_id: "accounting-temporal-fallback-v1", artifact_sha256: "f".repeat(64), capability_variant: "deferred_trigger_fallback" as const }
    : { ...row, capability_variant: "deferred_trigger_fallback" as const });
  assert.equal(verifyStartupLedger(fallbackRows, fallbackDescriptors).ready, true);
});

test("missing, old, drifted, and currently unmaterialized ledgers fail closed", () => {
  for (const fixture of failures.cases) {
    const rows = fixture.kind === "old"
      ? ready.ledger_rows.filter((row) => row.sequence_no !== fixture.remove_sequence)
      : fixture.ledger_rows ?? [];
    const result = verifyStartupLedger(rows, ready.descriptors);
    assert.equal(result.ready, false);
    assert.equal(result.code, fixture.expected_code);
    assert.deepEqual(result.emitted_ddl, []);
    assert.equal(result.schema_writes, 0);
  }
  const drifted = ready.ledger_rows.map((row) => row.sequence_no === 130 ? { ...row, executor_version: "schema-ledger-v0" } : row);
  assert.equal(verifyStartupLedger(drifted, ready.descriptors).code, "startup_ledger_exact_version_mismatch");
  const repositoryDescriptors = readArtifactDescriptors() as StartupDescriptor[];
  assert.equal(
    verifyStartupLedger(ready.ledger_rows, repositoryDescriptors).code,
    "startup_ledger_exact_version_mismatch",
  );
});

test("startup inventory is SELECT-only READ ONLY/ROLLBACK and cannot emit DDL", () => {
  const sql = startupLedgerInventorySql();
  assert.match(sql, /^BEGIN TRANSACTION READ ONLY;/);
  assert.match(sql, /FROM public\.schema_change_ledger AS l/);
  assert.match(sql, /JOIN public\.schema_release_runs AS r/);
  assert.match(sql, /ROLLBACK;\n$/);
  assert.doesNotMatch(sql, /^\s*(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE|MERGE|GRANT|REVOKE)\b/im);
});

test("explicit Todo 10 commit SHA avoids local Git fallback and rejects malformed input", () => {
  const valid = "aff25872993303b44e1082bcd7f89f4b281b983e";
  let calls = 0;
  const fallback = () => { calls += 1; return valid; };
  assert.equal(resolveTaskTenCommitSha(valid, fallback), valid);
  assert.equal(calls, 0);
  assert.throws(() => resolveTaskTenCommitSha("bad", fallback), /task_10_commit_sha_invalid/);
  assert.equal(calls, 0);
  assert.equal(resolveTaskTenCommitSha(undefined, fallback), valid);
  assert.equal(calls, 1);
});

test("retention definitions close hourly lock, batch, cutoff, cursor, and metric literals", () => {
  assert.deepEqual(RETENTION_CONTRACT, {
    schedule: "hourly",
    lock_scope: "single_advisory_lock",
    lock_namespace: "dgkma-retention-v1",
    rows_per_batch: 500,
    batch_time_limit_ms: 5000,
    max_batches: 10,
    pending_hmac_secret: "ACCOUNTING_PII_HMAC_KEY_V1",
    metric_fields: RETENTION_METRIC_FIELDS,
  });
  assert.equal(typeof retentionAdvisoryLockKey(), "bigint");
  assert.equal(retentionAdvisoryLockKey(), retentionAdvisoryLockKey());
  assert.deepEqual(RETENTION_JOBS.map((job) => [job.table, job.cutoff, job.cursor, job.effect]), [
    ["session", "now()", ["expire", "sid"], "delete"],
    ["kakao_oauth_states", "now()-24 hours", ["expires_at", "state_hash"], "delete"],
    ["kakao_identity_terminations", "now()-30 days", ["terminated_at", "identity_hash"], "delete"],
    ["pending_registrations", "now()-30 days", ["created_at", "id"], "redact"],
  ]);
  assert.deepEqual(RETENTION_METRIC_FIELDS, ["table", "cutoff", "count", "duration", "outcome"]);
});

test("retention fixture selects only strictly expired and eligible stable keys without writes", () => {
  for (const fixture of retention.cases) {
    const result = planRetentionRun(fixture.job_id, fixture.rows, retention.now, { hmacKeyPresent: true });
    assert.deepEqual(result.selected_keys, fixture.expected_selected_keys, fixture.job_id);
    assert.equal(result.planned_effects, fixture.expected_selected_keys.length);
    assert.deepEqual(result.emitted_sql, []);
    assert.equal(result.writes_executed, 0);
  }
  const blocked = planRetentionRun("rejected_pending", retention.cases[3].rows, retention.now, { hmacKeyPresent: false });
  assert.equal(blocked.outcome, "blocked_missing_hmac");
  assert.equal(blocked.planned_effects, 0);
  assert.deepEqual(blocked.selected_keys, []);
});

test("retention planner caps each batch at 500 and every run at 10 batches", () => {
  const rows = Array.from({ length: 5001 }, (_, index) => ({
    expire: "2026-07-01T00:00:00.000Z",
    sid: `expired-${String(index).padStart(5, "0")}`,
  }));
  const result = planRetentionRun("sessions", rows, retention.now, { hmacKeyPresent: true });
  assert.equal(result.batches.length, 10);
  assert.ok(result.batches.every((batch) => batch.length === 500));
  assert.equal(result.selected_keys.length, 5000);
  assert.equal(result.writes_executed, 0);
});

test("retention metric allowlist rejects identity or secret fields", () => {
  assert.doesNotThrow(() => validateRetentionMetric({
    table: "session", cutoff: "now()", count: 0, duration: 1, outcome: "no_eligible_rows",
  }));
  assert.throws(() => validateRetentionMetric({
    table: "session", cutoff: "now()", count: 0, duration: 1, outcome: "ok", sid: "secret",
  }), /retention_metric_field_not_allowed/);
});

test("Todo 16 removes runtime DDL and wires the fail-closed ledger verifier", () => {
  assert.doesNotThrow(() => verifyRuntimeBoundary());
  const source = readFileSync("server/index.ts", "utf8");
  assert.doesNotMatch(source, /CREATE TABLE IF NOT EXISTS "session"/);
  assert.doesNotMatch(source, /CREATE INDEX IF NOT EXISTS session_expire_idx/);
  assert.match(source, /verifyStartupSchema/);
  assert.equal(existsSync("migrations/manual/0060_database_security.sql"), true);
  assert.equal(
    execFileSync("shasum", ["-a", "256", "docs/database-manifest.yaml"], { encoding: "utf8" }).trim().split(/\s+/)[0],
    STARTUP_MANIFEST_SHA256,
  );
});

test("Todo 10 verifier harness selects only pure fixture tests and no integration test", () => {
  const verifier = readFileSync("scripts/verify-database-architecture.ts", "utf8");
  const start = verifier.indexOf("function runTaskTen");
  const end = verifier.indexOf("if (process.argv[2]", start);
  const taskTen = start >= 0 && end > start ? verifier.slice(start, end) : "";
  const selectionStart = taskTen.indexOf("const tests = runLogged");
  const selectionEnd = taskTen.indexOf(");", selectionStart);
  const testSelection = selectionStart >= 0 && selectionEnd > selectionStart
    ? taskTen.slice(selectionStart, selectionEnd + 2)
    : "";
  assert.match(testSelection, /server\/startup-retention-contract\.test\.ts/);
  assert.doesNotMatch(testSelection, /pool\.query|server\/index\.ts|pending-registration-concurrency|account-deletion-storage/);
});
