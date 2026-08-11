import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalJson, readArtifactDescriptors, readManifest, schemaLockKey, selectedArtifacts, sha256 } from "../scripts/schema-ledger";

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
  assert.equal(descriptors.length, 16);
  assert.deepEqual([...new Set(descriptors.map((entry) => entry.sequence_no))], [1,10,15,20,30,40,50,60,65,70,80,90,100,110,120]);
  for (const descriptor of descriptors) {
    assert.equal(descriptor.materialization_state, "materialized");
    assert.match(descriptor.artifact_sha256!, /^[0-9a-f]{64}$/);
    assert.equal(existsSync(descriptor.path), true);
  }
  const sequence65 = descriptors.find((entry) => entry.sequence_no === 65)!;
  assert.equal(sequence65.required_for_startup, false);
  assert.equal(sequence65.required_for_production, true);
  const sequence70 = descriptors.find((entry) => entry.sequence_no === 70)!;
  const manifest=readManifest();const parent=readManifest((manifest.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);const grandparent=readManifest((parent.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);const greatGrandparent=readManifest((grandparent.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);const greatGreatGrandparent=readManifest((greatGrandparent.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);const greatGreatGreatGrandparent=readManifest((greatGreatGrandparent.value.manifest_lineage as {parent_manifest_path:string}).parent_manifest_path);assert.equal(sequence70.manifest_sha256,greatGreatGreatGrandparent.sha256);
  assert.equal(sequence70.required_for_startup, true);
  assert.deepEqual(selectedArtifacts(70, 70, "preferred_btree_gist").map((entry) => entry.sequence_no), [70]);
  const sequence70Sql = readFileSync(sequence70.path, "utf8");
  assert.match(sequence70Sql, /DROP CONSTRAINT economic_event_claims__coordinate_id__key/);
  assert.match(sequence70Sql, /WHERE version=1/);
  assert.match(sequence70Sql, /requested_through_sequence_no IN \(1,10,15,20,30,40,50,60,65,70\)/);
  const sequence80=descriptors.find((entry)=>entry.sequence_no===80)!;assert.equal(sequence80.manifest_sha256,greatGreatGrandparent.sha256);assert.equal(sequence80.required_for_startup,true);assert.deepEqual(selectedArtifacts(80,80,"preferred_btree_gist").map((entry)=>entry.sequence_no),[80]);const sequence80Sql=readFileSync(sequence80.path,"utf8");assert.match(sequence80Sql,/DROP CONSTRAINT dues_group_members__group_id_source_row_version_id__key/);assert.match(sequence80Sql,/WHERE version=1/);assert.match(sequence80Sql,/requested_through_sequence_no IN \(1,10,15,20,30,40,50,60,65,70,80\)/);
  const sequence90=descriptors.find((entry)=>entry.sequence_no===90)!;assert.equal(sequence90.manifest_sha256,greatGrandparent.sha256);assert.equal(sequence90.required_for_startup,true);assert.deepEqual(selectedArtifacts(90,90,"preferred_btree_gist").map((entry)=>entry.sequence_no),[90]);const sequence90Sql=readFileSync(sequence90.path,"utf8");assert.match(sequence90Sql,/DROP CONSTRAINT legacy_cutover_states__cutover_code__key/);assert.match(sequence90Sql,/WHERE version=1/);assert.match(sequence90Sql,/requested_through_sequence_no IN \(1,10,15,20,30,40,50,60,65,70,80,90\)/);
  const sequence100=descriptors.find((entry)=>entry.sequence_no===100)!;assert.equal(sequence100.manifest_sha256,grandparent.sha256);assert.equal(sequence100.required_for_startup,true);assert.deepEqual(selectedArtifacts(100,100,"preferred_btree_gist").map((entry)=>entry.sequence_no),[100]);const sequence100Sql=readFileSync(sequence100.path,"utf8");assert.match(sequence100Sql,/CREATE FUNCTION public\.dgkma_guard_legacy_payments_write_v1/);assert.match(sequence100Sql,/BEFORE INSERT OR UPDATE OR DELETE ON public\.payments/);assert.match(sequence100Sql,/requested_through_sequence_no IN \(1,10,15,20,30,40,50,60,65,70,80,90,100\)/);
  const sequence110=descriptors.find((entry)=>entry.sequence_no===110)!;assert.equal(sequence110.manifest_sha256,parent.sha256);assert.equal(sequence110.required_for_startup,true);assert.deepEqual(selectedArtifacts(110,110,"preferred_btree_gist").map((entry)=>entry.sequence_no),[110]);const sequence110Sql=readFileSync(sequence110.path,"utf8");assert.match(sequence110Sql,/dues_receipt_reversals__reason_code__check/);assert.match(sequence110Sql,/requested_through_sequence_no IN \(1,10,15,20,30,40,50,60,65,70,80,90,100,110\)/);
  const sequence120=descriptors.find((entry)=>entry.sequence_no===120)!;assert.equal(sequence120.manifest_sha256,manifest.sha256);assert.equal(sequence120.required_for_startup,true);assert.deepEqual(selectedArtifacts(120,120,"preferred_btree_gist").map((entry)=>entry.sequence_no),[120]);const sequence120Sql=readFileSync(sequence120.path,"utf8");assert.match(sequence120Sql,/CREATE FUNCTION public\.dgkma_validate_business_reason_transition_v1/);assert.match(sequence120Sql,/requested_through_sequence_no IN \(1,10,15,20,30,40,50,60,65,70,80,90,100,110,120\)/);
});

test("standalone manifest validator accepts the committed bytes", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/validate-database-manifest.ts"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout.trim());
  assert.equal(output.result, "approved");
  assert.equal(output.materialized_artifacts, 16);
});

test("metadata-only catalog verifier requires the sequence 100 payments write fence", () => {
  const source = readFileSync("scripts/verify-schema-catalog.ts", "utf8");
  assert.match(source, /\[1, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120\]/);
  assert.match(source, /legacy_payments_write_fence_v1/);
  assert.match(source, /public\.dgkma_guard_legacy_payments_write_v1\(\)/);
  assert.match(source, /catalog_legacy_payments_write_fence_mismatch/);
  assert.match(source, /catalog_business_reason_transition_mismatch/);
  assert.match(source, /--legacy-baseline/);
  assert.match(source, /--legacy-v3/);
  assert.match(source, /BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
});
