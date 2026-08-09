import assert from "node:assert/strict";
import test from "node:test";
import { FinancialTopologyContract, validateFinancialManifest } from "./financial-topology-contract";

test("financial manifest tables and audited actions are closed", () => {
  const result = validateFinancialManifest();
  assert.equal(result.financialTableCount, 23);
  assert.equal(result.actorActionCount, 59);
});

test("single, group, and mixed receipts balance exactly and reject over-allocation", () => {
  for (const allocations of [
    [{ memberId: 1, amount: 100, kind: "dues" as const, effect: "payment" as const }],
    [{ memberId: 1, amount: 40, kind: "dues" as const, effect: "payment" as const }, { memberId: 2, amount: 60, kind: "dues" as const, effect: "payment" as const }],
    [{ memberId: 1, amount: 70, kind: "dues" as const, effect: "payment" as const }, { memberId: 1, amount: 30, kind: "special_assessment" as const, effect: "payment" as const }],
  ]) { const engine = new FinancialTopologyContract(); engine.proposeEvent("event", 100); engine.approveReceipt("receipt", "event", 100, allocations); assert.equal(engine.receipts.get("receipt")?.status, "approved"); }
  const rejected = new FinancialTopologyContract(); rejected.proposeEvent("event", 100);
  assert.throws(() => rejected.approveReceipt("receipt", "event", 100, [{ memberId: 1, amount: 101, kind: "dues", effect: "payment" }]), /unbalanced/);
  assert.equal(rejected.receipts.size, 0);
});

test("bank refund requires a bound claim, bank transaction, and exact original", () => {
  const engine = new FinancialTopologyContract(); engine.proposeEvent("credit", 100); engine.approveReceipt("receipt", "credit", 100, [{ memberId: 1, amount: 100, kind: "dues", effect: "payment" }]); engine.proposeEvent("refund", 100);
  assert.throws(() => engine.refund("receipt", "refund", 100, { boundClaim: false, bankTransaction: true, reversesOriginalEvent: true }), /claimless_or_off_bank/);
  engine.refund("receipt", "refund", 100, { boundClaim: true, bankTransaction: true, reversesOriginalEvent: true });
  assert.equal(engine.events.get("refund")?.status, "approved");
});

test("childless collision resolves in reject, canonicalize, resolve order", () => {
  const engine = new FinancialTopologyContract(); engine.proposeEvent("canonical", 100); engine.proposeEvent("duplicate", 100); engine.resolveChildlessCollision("duplicate", "canonical");
  assert.equal(engine.events.get("duplicate")?.status, "rejected");
  assert.equal(engine.events.get("canonical")?.status, "proposed");
  assert.deepEqual(engine.audit.map((row) => `${row.entity}:${row.action}`), ["economic_event:reject", "event_canonicalization:create", "event_collision:resolve"]);
  assert.deepEqual(engine.closeBlockers(), ["canonical"]);
});
