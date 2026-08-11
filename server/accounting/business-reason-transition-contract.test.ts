import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { assertBusinessReasonRow, businessReasonAction } from "./business-reason-contract";

test("business reason row derives exact action and scope", () => {
  assert.equal(businessReasonAction("mutable_entity_action_history", { action: "correct", mutation_actor_scope: "member_self" }), "correct:member_self");
  assert.equal(businessReasonAction("member_match_cases", { supersedes_id: 4, status: "approved", decision_actor_correlation_uid: "x" }), "approve");
  assert.equal(businessReasonAction("economic_event_collisions", { supersedes_id: 4, status: "resolved" }), "resolve");
  assert.doesNotThrow(() => assertBusinessReasonRow("legacy_payment_decisions", { decision: "review", reason_code: "LEGACY_TIMEZONE_UNRESOLVED" }));
});

test("business reason row rejects a legal code paired to the wrong action", () => {
  assert.throws(() => assertBusinessReasonRow("mutable_entity_action_history", { action: "end", mutation_actor_scope: "admin", reason_code: "MEMBER_REACTIVATED" }), /business_reason_tuple_invalid/);
  assert.throws(() => assertBusinessReasonRow("member_identity_link_history", { operation: "unlink_user", decision_actor_scope: "member_self", reason_code: "IDENTITY_USER_UNLINKED" }), /business_reason_tuple_invalid/);
  assert.throws(() => assertBusinessReasonRow("dues_receipt_reversals", { status: "unknown", reason_code: "BANK_DUES_REFUND" }), /business_reason_tuple_invalid/);
});

test("sequence 120 installs one fail-closed trigger on every governed table", () => {
  const sql=readFileSync("migrations/manual/0120_business_reason_transition_enforcement.sql","utf8");
  const triggers={mutable_entity_action_history:"mutable_entity_action_history__business_reason_transition_v1",member_match_cases:"member_match_cases__business_reason_transition_v1",member_identity_link_history:"member_identity_link_history__business_reason_transition_v1",economic_event_authority_decisions:"economic_event_authority_decisions__business_reason__87a9478ac7",economic_event_canonicalizations:"economic_event_canonicalizations__business_reason_transition_v1",economic_event_collisions:"economic_event_collisions__business_reason_transition_v1",legacy_payment_decisions:"legacy_payment_decisions__business_reason_transition_v1",dues_receipt_reversals:"dues_receipt_reversals__business_reason_transition_v1"} as const;
  for(const [table,trigger] of Object.entries(triggers)) assert.match(sql,new RegExp(`CREATE TRIGGER ${trigger} BEFORE INSERT OR UPDATE ON public\\.${table}`));
  assert.match(sql,/ERRCODE='23514'/);
  assert.match(sql,/existing_rows_invalid/);
});
