import assert from "node:assert/strict";
import test from "node:test";
import { assertBusinessReasonTuple, BUSINESS_REASON_TUPLES } from "./business-reason-contract";

test("the physical business-reason contract enumerates every approved tuple once", () => {
  assert.equal(BUSINESS_REASON_TUPLES.length, 48);
  assert.equal(new Set(BUSINESS_REASON_TUPLES.map((tuple) => `${tuple.table}\u0000${tuple.actionOrStatus}\u0000${tuple.reasonCode}`)).size, 48);
  for (const tuple of BUSINESS_REASON_TUPLES) assert.doesNotThrow(() => assertBusinessReasonTuple(tuple.table, tuple.actionOrStatus, tuple.reasonCode));
});

test("unknown, altered-case, free-text and null deterministic reasons fail closed", () => {
  const first = BUSINESS_REASON_TUPLES[0];
  assert.throws(() => assertBusinessReasonTuple(first.table, first.actionOrStatus, "UNKNOWN"), /business_reason_tuple_invalid/);
  assert.throws(() => assertBusinessReasonTuple(first.table, first.actionOrStatus, first.reasonCode.toLowerCase()), /business_reason_tuple_invalid/);
  assert.throws(() => assertBusinessReasonTuple(first.table, first.actionOrStatus, "member ended because owner asked"), /business_reason_tuple_invalid/);
  assert.throws(() => assertBusinessReasonTuple(first.table, first.actionOrStatus, null), /business_reason_tuple_invalid/);
  assert.throws(() => assertBusinessReasonTuple(first.table, "close", first.reasonCode), /business_reason_tuple_invalid/);
});
