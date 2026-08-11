import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildLegacyPaymentCommand, buildLegacyPaymentReadTransitionCommand, loadLegacyPaymentPlan, validateLegacyPaymentCommand, validateLegacyPaymentReadTransitionCommand } from "./legacy-payment-service";
import { randomUUID } from "node:crypto";
import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

test("legacy v3 mapping, delegated decision, release and plan are immutable and self-bound", () => {
  const mappingBytes = readFileSync("docs/source-contracts/mappings/legacy-payments-v3.json");
  const mapping = JSON.parse(mappingBytes.toString("utf8")) as Record<string, CanonicalValue>;
  const approval = JSON.parse(readFileSync("docs/source-contracts/approvals/legacy-payments-v3.json", "utf8")) as Record<string, CanonicalValue>;
  const approvalPreimage = { ...approval }; delete approvalPreimage.receipt_sha256;
  const { plan, descriptor } = loadLegacyPaymentPlan();
  assert.equal(mapping.constants && (mapping.constants as Record<string, CanonicalValue>).decision_contract, "legacy_decision_only");
  assert.equal((mapping.columns as Array<Record<string, CanonicalValue>>).find((column) => column.target_field === "amount_parse")?.parser_code, "legacy_amount_envelope_v3");
  assert.equal((mapping.columns as Array<Record<string, CanonicalValue>>).find((column) => column.target_field === "source_amount_signed")?.parser_code, "legacy_signed_scalar_v3");
  assert.doesNotMatch(mappingBytes.toString("utf8"), /ACCOUNTING_PII_HMAC_KEY_V1|createHmac/);
  assert.equal(approval.mapping_sha256, sha256(mappingBytes));
  assert.equal(approval.receipt_sha256, sha256(canonicalJson(approvalPreimage as CanonicalValue)));
  assert.equal(descriptor.mapping_approval_receipt_sha256, approval.receipt_sha256);
  assert.equal(plan.plan_sha256, "53ac4b98fd15226d0a8eccf24246186f27ab9e8d9ffd913518fb4b6131f29ead");
});

test("legacy commands are closed, plan-bound and carry the empty comparison", () => {
  const { plan } = loadLegacyPaymentPlan();
  for (const action of ["register_release", "preview", "initialize", "fence", "cutover"] as const) {
    const command = buildLegacyPaymentCommand(action);
    assert.deepEqual(validateLegacyPaymentCommand(command, plan), command);
    assert.match(command.operationUid, /^[0-9a-f-]{36}$/);
    if (["fence", "cutover"].includes(action)) { assert.equal(command.expectedWatermarkPaymentId, 0); assert.match(command.expectedComparisonDigest!, /^[0-9a-f]{64}$/); }
    else { assert.equal(command.expectedWatermarkPaymentId, null); assert.equal(command.expectedComparisonDigest, null); }
  }
  assert.throws(() => validateLegacyPaymentCommand({ ...buildLegacyPaymentCommand("fence"), expectedWatermarkPaymentId: 1 }, plan), /comparison_mismatch/);
  assert.throws(() => validateLegacyPaymentCommand({ ...buildLegacyPaymentCommand("cutover"), operationUid: "11111111-1111-4111-8111-111111111111" }, plan), /operation_mismatch/);
});

test("legacy executor keeps Development exact-bound and exposes only a UUID-bound disposable projection", () => {
  const source = readFileSync("server/accounting/legacy-payment-service.ts", "utf8");
  assert.match(source, /scope: LegacyPaymentExecutionScope = \{ kind: "development" \}/);
  assert.match(source, /scope\.parentTargetFingerprint !== plan\.target_fingerprint/);
  assert.match(source, /actor\.targetFingerprint === scope\.parentTargetFingerprint/);
  assert.match(source, /legacy_payment_disposable_scope_mismatch/);
  assert.match(readFileSync("scripts/verify-legacy-payment-disposable.ts", "utf8"), /legacy_payments_write_fenced/);
  const developmentVerifier=readFileSync("scripts/verify-legacy-payment-development.ts","utf8");
  assert.match(developmentVerifier,/BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(developmentVerifier,/legacy_development_stored_receipt_mismatch/);
  assert.match(developmentVerifier,/identity_sequence_sha256/);
  const transactionStart = source.indexOf('await client.query("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE")');
  const earlyFenceLock = source.indexOf('if (command.action === "fence" || command.action === "cutover")', transactionStart);
  const actorLock = source.indexOf('SELECT id,user_uid::text,is_admin,name FROM public.users', transactionStart);
  assert.ok(transactionStart >= 0 && earlyFenceLock > transactionStart && actorLock > earlyFenceLock);
});

test("read rollback and recutover commands bind exact DB-resident comparison state", () => {
  const digest = "a".repeat(64);
  const rollback = buildLegacyPaymentReadTransitionCommand("read_rollback", randomUUID(), 5, digest);
  assert.deepEqual(validateLegacyPaymentReadTransitionCommand(rollback), rollback);
  assert.equal(rollback.expectedPhase, "new");
  const recutover = buildLegacyPaymentReadTransitionCommand("recutover", randomUUID(), 5, digest);
  assert.equal(recutover.expectedPhase, "read_rollback");
  assert.throws(() => validateLegacyPaymentReadTransitionCommand({ ...rollback, expectedPhase: "legacy" }), /phase_mismatch/);
  assert.throws(() => validateLegacyPaymentReadTransitionCommand({ ...rollback, expectedComparisonDigest: "bad" }), /digest_invalid/);
});
