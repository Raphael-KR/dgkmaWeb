import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import type { Pool } from "pg";
import {
  applySequenceOne,
  readArtifactDescriptors,
  verifyArtifactBytes,
  type BootstrapTarget,
  type CapabilityReceipt,
} from "../scripts/schema-ledger";

class LedgerPool {
  present = false;
  transactionPresent = false;
  settings = new Map<string, string>();
  sqlExecutions = 0;
  queryCalls = 0;
  releaseState = "verified";
  events: string[] = [];

  async query(text: string, values: unknown[] = []): Promise<any> {
    this.queryCalls += 1;
    if (text === "BEGIN") {
      this.events.push("begin");
      return { rows: [], rowCount: 0 };
    }
    if (text === "COMMIT") {
      this.present = this.transactionPresent;
      return { rows: [], rowCount: 0 };
    }
    if (text === "ROLLBACK") {
      this.transactionPresent = this.present;
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("to_regclass('public.schema_change_ledger')")) {
      return { rows: [{ present: this.transactionPresent || this.present }], rowCount: 1 };
    }
    if (text.includes("current_database() AS database_name")) {
      return { rows: [{ database_name: target.currentDatabase, user_name: target.currentUser, user_oid: target.currentUserOid, version_num: target.serverVersionNum, application_name: target.applicationName }], rowCount: 1 };
    }
    if (text.startsWith("SELECT pg_advisory_xact_lock")) {
      this.events.push("advisory_lock");
      return { rows: [{}], rowCount: 1 };
    }
    if (text.startsWith("SELECT set_config")) {
      this.settings.set(String(values[0]), String(values[1]));
      return { rows: [{}], rowCount: 1 };
    }
    if (text.startsWith("CREATE TABLE IF NOT EXISTS public.schema_release_runs")) {
      this.events.push("artifact_sql");
      this.sqlExecutions += 1;
      this.transactionPresent = true;
      return { rows: [], rowCount: 0 };
    }
    if (text.includes("FROM public.schema_change_ledger l")) {
      return { rows: [{ artifact_id: "schema-ledger-bootstrap-v1", artifact_sha256: this.settings.get("dgkma.artifact_sha256"), manifest_sha256: this.settings.get("dgkma.manifest_sha256"), target_fingerprint: target.targetFingerprint, sequence_no: 1, release_state: this.releaseState, capability_receipt_sha256: capability.receipt_sha256 }], rowCount: 1 };
    }
    throw new Error(`unexpected_query:${text.slice(0, 80)}`);
  }
}

const target: BootstrapTarget = {
  kind: "disposable-test",
  targetFingerprint: "b".repeat(64),
  parentTargetFingerprint: "a".repeat(64),
  runUid: "88ddb810-4f71-4b08-a026-ffdf7cbc16bf",
  currentDatabase: "dgkma_test_fixture",
  currentUser: "postgres",
  currentUserOid: 10,
  serverVersionNum: 160010,
  applicationName: "dgkma-disposable:88ddb810-4f71-4b08-a026-ffdf7cbc16bf",
};

const capability: CapabilityReceipt = {
  target_kind: "disposable-test",
  parent_target_fingerprint: target.parentTargetFingerprint,
  disposable_run_uid: target.runUid,
  preflight_run_uid: "118ddb81-4f71-4b08-a026-ffdf7cbc16bf",
  probe_token: "1234567890ab",
  server_version_num: target.serverVersionNum,
  gen_random_uuid_available: true,
  btree_gist_installed: false,
  btree_gist_available: true,
  btree_gist_create_privilege: true,
  current_user_name: target.currentUser,
  current_user_oid: target.currentUserOid,
  database_create_privilege: true,
  public_schema_create_privilege: true,
  table_create_privilege: true,
  routine_create_privilege: true,
  table_create_probe_passed: true,
  routine_create_probe_passed: true,
  table_probe_absent: true,
  routine_probe_absent: true,
  observed_catalog_sha256: "c".repeat(64),
  observed_at: "2026-07-31T00:00:00.000Z",
  receipt_sha256: "d".repeat(64),
};

test("sequence one applies atomically and an identical resume is a verified no-op", async () => {
  const bootstrapSql = readFileSync("migrations/manual/0001_schema_ledger_bootstrap.sql", "utf8");
  assert.match(bootstrapSql, /SELECT release_run_id\nFROM inserted_ledger;\n\nUPDATE public\.schema_release_runs/);
  assert.doesNotMatch(bootstrapSql, /WHERE id = \(SELECT release_run_id FROM inserted_ledger\)/);
  const fake = new LedgerPool();
  const first = await applySequenceOne(fake as unknown as Pool, target, capability);
  assert.equal(first.outcome, "applied");
  assert.equal(fake.present, true);
  assert.equal(fake.sqlExecutions, 1);
  assert.deepEqual(fake.events.slice(0, 3), ["begin", "advisory_lock", "artifact_sql"]);
  const second = await applySequenceOne(fake as unknown as Pool, target, capability);
  assert.equal(second.outcome, "verified_noop");
  assert.equal(fake.sqlExecutions, 1);
});

test("interrupted sequence one rolls back both artifact and success ledger", async () => {
  const fake = new LedgerPool();
  await assert.rejects(
    applySequenceOne(fake as unknown as Pool, target, capability, { interruptBeforeCommit: true }),
    /ledger_simulated_interrupt/,
  );
  assert.equal(fake.present, false);
  assert.equal(fake.transactionPresent, false);
});

test("resume refuses a non-verified release state", async () => {
  const fake = new LedgerPool();
  await applySequenceOne(fake as unknown as Pool, target, capability);
  fake.releaseState = "failed";
  await assert.rejects(applySequenceOne(fake as unknown as Pool, target, capability), /ledger_bootstrap_drift:release_state/);
  assert.equal(fake.sqlExecutions, 1);
});

test("target and capability drift refuse before artifact SQL", async () => {
  const targetDrift = new LedgerPool();
  await assert.rejects(
    applySequenceOne(targetDrift as unknown as Pool, { ...target, currentDatabase: "wrong_database" }, capability),
    /ledger_live_target_mismatch/,
  );
  assert.equal(targetDrift.sqlExecutions, 0);

  const capabilityDrift = new LedgerPool();
  await assert.rejects(
    applySequenceOne(capabilityDrift as unknown as Pool, target, { ...capability, table_probe_absent: false }),
    /capability_receipt_target_mismatch/,
  );
  assert.equal(capabilityDrift.queryCalls, 0);
  assert.equal(capabilityDrift.sqlExecutions, 0);
});

test("tampered copied bootstrap fails checksum before any database call", () => {
  const descriptor = readArtifactDescriptors().find((entry) => entry.sequence_no === 1)!;
  assert.throws(
    () => verifyArtifactBytes(descriptor, "server/fixtures/database-architecture/task-2/tampered-schema-ledger-bootstrap.sql"),
    /checksum_mismatch/,
  );
});
