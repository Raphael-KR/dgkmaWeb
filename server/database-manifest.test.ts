import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalJson, readArtifactDescriptors, readManifest, schemaLockKey, sha256 } from "../scripts/schema-ledger";

test("expanded manifest is canonical, closed, and bound to the approved plan", () => {
  const manifest = readManifest();
  const value = manifest.value as Record<string, any>;
  assert.equal(value.architecture_plan_sha256, sha256(readFileSync("docs/plans/database-architecture-audit.md")));
  assert.equal(value.tables.length, 55);
  assert.equal(value.existing_table_alterations.length, 13);
  assert.equal(new Set([...value.tables, ...value.existing_table_alterations].map((entry) => entry.table)).size, 68);
  assert.equal(value.logical_source_uuid_registry.length, 10);
  assert.equal(value.actor_action_registry.length, 59);
  assert.equal(value.lock_class_registry.length, 62);
  assert.equal(value.digest_test_vectors.length, 7);
  assert.ok(value.unique_constraints.length >= 100);
  assert.equal(value.sequence_15_rule_registry.rules.length, 25);
  assert.deepEqual(value.account_delete_non_fk_registry.map((entry: any) => entry.table).sort(), [
    "kakao_identity_terminations",
    "pending_registrations",
    "session",
  ]);
  assert.deepEqual(
    value.foreign_keys.filter((entry: any) => entry.referenced_table === "users").map((entry: any) => `${entry.table}.${entry.columns[0]}.${entry.on_delete}.${entry.on_update}`).sort(),
    value.account_delete_user_fk_registry.map((entry: any) => `${entry.table}.${entry.column}.${entry.on_delete}.${entry.on_update}`).sort(),
  );
  assert.equal(value.kakao_identity_lock.rank, 15);
  assert.equal(value.round_38_closure.receipt_payload.nullable, false);
  assert.equal(value.round_38_closure.receipt_payload.schema_version, "business-operation-payload-v2");
  assert.deepEqual(value.round_38_closure.nullable_correction_code_columns.map((entry: any) => `${entry.table}.${entry.column}`), [
    "member_position_assignments.override_reason",
    "dues_allocations.correction_reason_code",
  ]);
  assert.ok(value.foreign_keys.length >= 170);
  assert.ok(value.indexes.length >= value.foreign_keys.length);
  assert.doesNotMatch(manifest.bytes.toString("utf8"), /\b(?:ACTOR|AUDIT_ACTOR|OPTIONAL_ACTOR|VCHAIN|CANONICAL_PHONE|DEFAULT_ACTOR)\b|<[a-z][a-z0-9_-]*>/);
  assert.equal(
    value.object_name_contract.examples.index,
    "this_table_name_is_long_enough_for_postgresql_object_071db7e428",
  );
  assert.equal(typeof schemaLockKey("a".repeat(64)), "bigint");
});

test("descriptor set rejects altered canonical manifest bytes with the same schema ID", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dgkma-manifest-drift-"));
  try {
    const descriptorDirectory = path.join(directory, "artifacts");
    cpSync("migrations/artifacts", descriptorDirectory, { recursive: true });
    const manifest = readManifest().value as Record<string, any>;
    manifest.manifest_contract = { ...manifest.manifest_contract, drift_fixture: true };
    const manifestPath = path.join(directory, "database-manifest.yaml");
    writeFileSync(manifestPath, `${canonicalJson(manifest)}\n`);
    assert.throws(() => readArtifactDescriptors(descriptorDirectory, manifestPath), /artifact_manifest_checksum_mismatch/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("artifact descriptors close the fully materialized sequence registry", () => {
  const descriptors = readArtifactDescriptors();
  assert.equal(descriptors.length, 10);
  assert.deepEqual([...new Set(descriptors.map((entry) => entry.sequence_no))], [1,10,15,20,30,40,50,60,65]);
  for (const descriptor of descriptors) {
    assert.equal(descriptor.materialization_state, "materialized");
    assert.match(descriptor.artifact_sha256!, /^[0-9a-f]{64}$/);
    assert.equal(existsSync(descriptor.path), true);
  }
  const sequence65 = descriptors.find((entry) => entry.sequence_no === 65)!;
  assert.equal(sequence65.required_for_startup, false);
  assert.equal(sequence65.required_for_production, true);
});

test("standalone manifest validator accepts the committed bytes", () => {
  const result = spawnSync("npx", ["tsx", "scripts/validate-database-manifest.ts"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.result, "approved");
  assert.equal(output.materialized_artifacts, 10);
});
