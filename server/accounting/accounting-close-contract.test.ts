import assert from "node:assert/strict";
import test from "node:test";
import { AccountingCloseContract } from "./accounting-close-contract";

test("canonical totals and source-bound bank balances exclude the rejected childless duplicate", () => {
  const close = new AccountingCloseContract();
  close.setAccountEvidence({ accountCode: "IBK_DUES", anchorBalance: "1000000", observedBalance: "1080000" });
  close.addEvent({ id: "canonical", amount: "100000", direction: "credit", status: "approved", accountCode: "IBK_DUES" });
  close.attachApprovedReceipt({ id: "receipt", eventId: "canonical", gross: "100000", allocations: ["60000", "40000"] });
  close.addEvent({ id: "duplicate", amount: "100000", direction: "credit", status: "proposed", accountCode: "IBK_DUES" });
  close.openCollision("collision");
  close.resolveChildlessCollision({ collisionId: "collision", duplicateEventId: "duplicate", canonicalEventId: "canonical" });
  close.addEvent({ id: "refund", amount: "20000", direction: "debit", status: "approved", accountCode: "IBK_DUES" });
  close.attachApprovedReceipt({ id: "refund-receipt", eventId: "refund", gross: "20000", allocations: ["20000"] });
  close.setReconciliationDifference("ibk-2026", "0");
  assert.equal(close.canonicalNetTotal(), "80000");
  assert.equal(close.sourceBoundBalance("IBK_DUES"), "1080000");
  assert.deepEqual(close.blockers(), []);
  assert.deepEqual(close.close(), { canonicalNetTotal: "80000", accountBalances: { IBK_DUES: "1080000" } });
});

test("close refuses every open state and every nonzero monetary difference", () => {
  const close = new AccountingCloseContract();
  close.setAccountEvidence({ accountCode: "TOSS_DUES", anchorBalance: "0", observedBalance: "1" });
  close.addEvent({ id: "pending", amount: "1", direction: "credit", status: "proposed", accountCode: "TOSS_DUES" });
  close.addProposedReceipt({ id: "unapproved", gross: "1", allocated: "0" });
  close.openCollision("open-collision");
  close.openSchemaException("USERS_EMAIL_CANONICAL_BLANK");
  close.setReconciliationDifference("toss-2026", "1");
  assert.deepEqual(close.blockers(), [
    "account:TOSS_DUES:difference",
    "collision:open-collision:open",
    "event:pending:proposed",
    "receipt:unapproved:proposed",
    "reconciliation:toss-2026:difference",
    "schema_exception:USERS_EMAIL_CANONICAL_BLANK:open",
  ]);
  assert.throws(() => close.close(), /close_blocked/);
});

test("noncanonical money, child-bearing collision and post-close mutation fail closed", () => {
  const invalid = new AccountingCloseContract();
  assert.throws(() => invalid.addEvent({ id: "bad", amount: "01", direction: "credit", status: "approved" }), /close_money_invalid/);
  for (const signed of ["-0", "+1", "01", "-01"]) assert.throws(() => invalid.setReconciliationDifference(`bad-${signed}`, signed), /close_signed_money_invalid/);

  const childBearing = new AccountingCloseContract();
  childBearing.addEvent({ id: "canonical", amount: "1", direction: "credit", status: "approved" });
  childBearing.addEvent({ id: "duplicate", amount: "1", direction: "credit", status: "approved" });
  childBearing.attachApprovedReceipt({ id: "child", eventId: "duplicate", gross: "1", allocations: ["1"] });
  childBearing.openCollision("collision");
  assert.throws(() => childBearing.resolveChildlessCollision({ collisionId: "collision", duplicateEventId: "duplicate", canonicalEventId: "canonical" }), /close_collision_not_childless/);

  const closed = new AccountingCloseContract();
  closed.close();
  assert.throws(() => closed.addEvent({ id: "late", amount: "1", direction: "credit", status: "approved" }), /close_append_only_violation/);
});
