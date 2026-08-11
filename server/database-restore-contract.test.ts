import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  authorizeRestoreReconcile,
  readRestoreReceipt,
  readSyntheticSequence60Descriptor,
  RESTORE_READINESS,
  sha256,
  type RestoreTargetKind,
} from "../scripts/database-restore-contract";

const root = process.cwd();
const fixtureRoot = path.join(root, "server/fixtures/database-architecture/task-5");
const receiptPath = path.join(fixtureRoot, "synthetic-restore-receipt.json");
const descriptorPath = path.join(fixtureRoot, "synthetic-sequence-60.json");

test("restore receipt schema and descriptor are closed, bound, and explicitly pending", () => {
  const schemaPath = path.join(root, "docs/restore-contracts/restore-validation.schema.json");
  const descriptorContractPath = path.join(root, "docs/restore-contracts/restore-validation.descriptor.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8")) as Record<string, unknown>;
  const descriptor = JSON.parse(readFileSync(descriptorContractPath, "utf8")) as Record<string, unknown>;
  const required = schema.required as string[];

  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.additionalProperties, false);
  assert.equal(required.length, 31);
  assert.equal(new Set(required).size, 31);
  assert.equal(descriptor.receipt_schema_sha256, sha256(readFileSync(schemaPath)));
  assert.equal(descriptor.allowed_target_kind, "disposable-test");
  assert.equal(descriptor.restore_reconcile_path, "migrations/manual/0060_restore_security_reconcile.sql");
  assert.equal(descriptor.readiness, RESTORE_READINESS);
  assert.equal(RESTORE_READINESS, "pending Todo 22 measured drill");
  assert.equal(existsSync(path.join(root, String(descriptor.restore_reconcile_path))), true);

  const sequence60 = JSON.parse(
    readFileSync(path.join(root, "migrations/artifacts/0060_database_security.json"), "utf8"),
  ) as Record<string, unknown>;
  assert.equal(sequence60.materialization_state, "materialized");
  assert.match(String(sequence60.artifact_sha256), /^[0-9a-f]{64}$/);
});

test("checksum-bound synthetic sequence 60 authorizes only a disposable dry authorization", () => {
  const descriptor = readSyntheticSequence60Descriptor(descriptorPath);
  const receipt = readRestoreReceipt(receiptPath);
  assert.equal(receipt.sequence_60_artifact_sha256, descriptor.artifact_sha256);
  assert.equal(receipt.restore_reconcile_sha256, descriptor.restore_reconcile_sha256);
  assert.deepEqual(
    authorizeRestoreReconcile({ targetKind: "disposable-test", descriptorPath, receiptPath }),
    {
      result: "authorized",
      sql_executions: 0,
      restore_reconcile_sha256: descriptor.restore_reconcile_sha256,
    },
  );
});

test("materialized runtime restore sidecar normalizes to the same closed authorization contract", () => {
  const runtimeDescriptorPath = path.join(root, "migrations/artifacts/0060_database_security.restore.json");
  const descriptor = readSyntheticSequence60Descriptor(runtimeDescriptorPath);
  assert.equal(descriptor.sequence_no, 60);
  assert.equal(descriptor.artifact_id, "database-security-v1");
  assert.equal(descriptor.materialization_state, "materialized");
  assert.equal(sha256(readFileSync(descriptor.artifact_path)), descriptor.artifact_sha256);
  assert.equal(sha256(readFileSync(descriptor.restore_reconcile_path)), descriptor.restore_reconcile_sha256);
});

test("target, checksum, role-membership, and default-privilege attacks reject before SQL", () => {
  const fixtures = JSON.parse(readFileSync(path.join(fixtureRoot, "failure-cases.json"), "utf8")) as {
    cases: Array<{
      name: string;
      target_kind: RestoreTargetKind;
      descriptor: string | null;
      receipt: string;
      expected_error: string;
    }>;
  };

  assert.equal(fixtures.cases.length, 5);
  for (const fixture of fixtures.cases) {
    let sqlExecutions = 0;
    if (fixture.name.startsWith("checksum_consistent_")) {
      assert.notEqual(fixture.descriptor, null);
      const adversarialDescriptorPath = path.join(fixtureRoot, fixture.descriptor!);
      const descriptor = readSyntheticSequence60Descriptor(adversarialDescriptorPath);
      const receipt = readRestoreReceipt(path.join(fixtureRoot, fixture.receipt));
      assert.equal(sha256(readFileSync(descriptor.artifact_path)), descriptor.artifact_sha256);
      assert.equal(sha256(readFileSync(descriptor.restore_reconcile_path)), descriptor.restore_reconcile_sha256);
      assert.equal(receipt.sequence_60_artifact_sha256, descriptor.artifact_sha256);
      assert.equal(receipt.restore_reconcile_sha256, descriptor.restore_reconcile_sha256);
    }
    assert.throws(
      () => {
        authorizeRestoreReconcile({
          targetKind: fixture.target_kind,
          descriptorPath: fixture.descriptor ? path.join(fixtureRoot, fixture.descriptor) : null,
          receiptPath: path.join(fixtureRoot, fixture.receipt),
        });
        sqlExecutions += 1;
      },
      (error: unknown) => error instanceof Error && error.message === fixture.expected_error,
      fixture.name,
    );
    assert.equal(sqlExecutions, 0, fixture.name);
  }
});

test("runbook fixes dump, restore, retention, rollout, cleanup, and Production gates", () => {
  const runbook = readFileSync(path.join(root, "docs/database-operations.md"), "utf8");
  const requiredClauses = [
    "pending Todo 22 measured drill",
    "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY",
    "pg_export_snapshot()",
    "txid_current_snapshot()",
    "pg_dump --format=custom --compress=9 --no-owner --no-acl --snapshot=\"$restore_snapshot_id\"",
    "pg_restore --exit-on-error --single-transaction --no-owner --no-acl",
    "migrations/manual/0060_restore_security_reconcile.sql",
    "500행 또는 5초",
    "최대 10개 batch",
    "24시간",
    "30일",
    "expand → capability/catalog preflight → ordinary → manual variant → verify → backfill → compatibility compare → explicit cutover",
    "Production backup/restore는 이 계약의 범위 밖",
    "RPO/RTO는 policy-pending",
    "shred --remove=unlink --zero",
  ];
  for (const clause of requiredClauses) assert.ok(runbook.includes(clause), clause);
});
