import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { readGlobalLockRegistry, REFUND_WORKFLOW_LOCK_TRACE, SOURCE_WORKFLOW_LOCK_TRACE, validateGlobalLockTrace } from "./global-lock-contract";

test("manifest closes the exact 10 through 490 global lock registry", () => {
  const registry = readGlobalLockRegistry();
  assert.equal(registry.length, 62);
  assert.deepEqual(registry.slice(0, 3), [
    { lock_class: "actor_user", rank: 10 },
    { lock_class: "kakao_identity", rank: 15 },
    { lock_class: "business_operation", rank: 20 },
  ]);
  assert.deepEqual(registry.at(-1), { lock_class: "audit_event", rank: 490 });
});

test("removing rank 15 or admitting an uncovered class fails manifest lock lint", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "dgkma-lock-registry-"));
  try {
    const manifest = JSON.parse(readFileSync("docs/database-manifest.yaml", "utf8"));
    manifest.lock_class_registry = manifest.lock_class_registry.filter((entry: { rank: number }) => entry.rank !== 15);
    const missing = path.join(directory, "missing.json"); writeFileSync(missing, JSON.stringify(manifest));
    assert.throws(() => readGlobalLockRegistry(missing), /lock_registry_closure_invalid/);
    manifest.lock_class_registry.splice(1, 0, { rank: 14, lock_class: "uncovered_domain" });
    const extra = path.join(directory, "extra.json"); writeFileSync(extra, JSON.stringify(manifest));
    assert.throws(() => readGlobalLockRegistry(extra), /lock_registry_closure_invalid/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("non-Kakao and Kakao commands reserve only between rank 20 and rank 23", () => {
  const nonKakao = validateGlobalLockTrace({ commandKind: "non_kakao", steps: [
    { kind: "lock", lockClass: "actor_user" }, { kind: "lock", lockClass: "business_operation" },
    { kind: "reserve", label: "identity_sequences" }, { kind: "lock", lockClass: "event_parse_rate_limit" },
  ], requiredAdjacentPairs: [["actor_user", "business_operation"], ["business_operation", "event_parse_rate_limit"]] });
  assert.equal(nonKakao.reservationOrdinal, 3);
  const kakao = validateGlobalLockTrace({ commandKind: "kakao_identity", steps: [
    { kind: "lock", lockClass: "actor_user" }, { kind: "lock", lockClass: "kakao_identity" },
    { kind: "lock", lockClass: "business_operation" }, { kind: "reserve", label: "identity_sequences" },
    { kind: "lock", lockClass: "event_parse_rate_limit" },
  ], requiredAdjacentPairs: [["actor_user", "kakao_identity"], ["kakao_identity", "business_operation"]] });
  assert.equal(kakao.reservationOrdinal, 4);
});

test("source and refund workflows reproduce their complete increasing lock traces", () => {
  const source = validateGlobalLockTrace({ commandKind: "non_kakao", steps: SOURCE_WORKFLOW_LOCK_TRACE, requiredAdjacentPairs: [
    ["actor_user", "business_operation"], ["source_classification", "association_member"],
  ] });
  const refund = validateGlobalLockTrace({ commandKind: "non_kakao", steps: REFUND_WORKFLOW_LOCK_TRACE, requiredAdjacentPairs: [
    ["actor_user", "business_operation"], ["bank_account", "bank_anchor"], ["original_allocation", "new_allocation"],
  ] });
  assert.equal(source.lockCount, 24);
  assert.equal(refund.lockCount, 14);
});

test("missing rank 15, rank regression and reservation drift fail closed", () => {
  assert.throws(() => validateGlobalLockTrace({ commandKind: "kakao_identity", steps: [
    { kind: "lock", lockClass: "actor_user" }, { kind: "lock", lockClass: "business_operation" }, { kind: "reserve", label: "identity_sequences" },
  ] }), /lock_trace_prefix_invalid/);
  assert.throws(() => validateGlobalLockTrace({ commandKind: "non_kakao", steps: [
    { kind: "lock", lockClass: "actor_user" }, { kind: "lock", lockClass: "business_operation" }, { kind: "reserve", label: "identity_sequences" },
    { kind: "lock", lockClass: "association_member" }, { kind: "lock", lockClass: "source_classification" },
  ] }), /lock_trace_rank_regression/);
  assert.throws(() => validateGlobalLockTrace({ commandKind: "non_kakao", steps: [
    { kind: "lock", lockClass: "actor_user" }, { kind: "reserve", label: "identity_sequences" }, { kind: "lock", lockClass: "business_operation" },
  ] }), /lock_trace_reservation_before_operation|lock_trace_reservation_boundary_invalid/);
  assert.throws(() => validateGlobalLockTrace({ commandKind: "non_kakao", steps: [
    { kind: "lock", lockClass: "actor_user" }, { kind: "lock", lockClass: "business_operation" }, { kind: "lock", lockClass: "event_parse_rate_limit" },
    { kind: "reserve", label: "identity_sequences" },
  ] }), /lock_trace_reservation_after_business_lock/);
});
