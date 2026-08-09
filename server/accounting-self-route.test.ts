import assert from "node:assert/strict";
import test from "node:test";
import { assertAccountingSelfJsonSafe, projectAccountingSelf } from "./accounting/accounting-self-api";

test("accounting self projection is session-bound and serializes every bigint as a decimal string", () => {
  const response = projectAccountingSelf({ sessionUserId: 7, asOf: "2026-08-10T00:00:00Z", currentDuesYear: 2026, member: { memberUid: "77777777-7777-4777-8777-777777777777", memberKind: "member", status: "active", displayName: "본인", generation: "22" }, dues: { tierCode: "director", monthlyMinimum: 10000n, annualMinimum: 200000n, personalPledgeMonthly: 10000n, paidTotal: 120000n, policyShortfall: 0n, pledgeShortfall: 0n, specialAssessmentRequired: 0n, specialAssessmentPaid: 0n, rightsStatus: "rights_member", reasonCode: "monthly_current" } });
  assert.equal(response.schemaVersion, "accounting-self-v1");
  assert.equal(response.dues?.monthlyMinimum, "10000");
  assert.equal(typeof response.dues?.paidTotal, "string");
  assertAccountingSelfJsonSafe(response);
  assert.throws(() => projectAccountingSelf({ sessionUserId: null, asOf: "2026-08-10T00:00:00Z", currentDuesYear: 2026, member: null, dues: null }), /unauthenticated/);
  assert.throws(() => projectAccountingSelf({ sessionUserId: 7, requestedUserId: 8, asOf: "2026-08-10T00:00:00Z", currentDuesYear: 2026, member: null, dues: null }), /other_identity/);
});

test("unmatched and draft-policy users receive exact null or unavailable projections", () => {
  const unmatched = projectAccountingSelf({ sessionUserId: 7, asOf: "2026-08-10T00:00:00Z", currentDuesYear: 2026, member: null, dues: null });
  assert.deepEqual({ member: unmatched.member, dues: unmatched.dues }, { member: null, dues: null });
  const unavailable = projectAccountingSelf({ sessionUserId: 7, asOf: "2026-08-10T00:00:00Z", currentDuesYear: 2026, member: { memberUid: "77777777-7777-4777-8777-777777777777", memberKind: "member", status: "ended", displayName: "본인", generation: "22" }, dues: { tierCode: null, monthlyMinimum: null, annualMinimum: null, personalPledgeMonthly: null, paidTotal: null, policyShortfall: null, pledgeShortfall: null, specialAssessmentRequired: null, specialAssessmentPaid: null, rightsStatus: "unavailable", reasonCode: null } });
  assert.equal(unavailable.dues?.rightsStatus, "unavailable");
  assert.equal(JSON.stringify(unavailable).includes("actor"), false);
});
