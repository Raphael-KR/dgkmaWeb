import assert from "node:assert/strict";
import test from "node:test";
import {
  decideLegacyPayment,
  firstLegacyIneligibility,
  legacyCandidateKstDates,
  legacyCandidateLockKeys,
  legacyDecisionKey,
  parseLegacySignedAmount,
  type FrozenLegacyPayment,
  type LegacyDecisionEvidence,
} from "./legacy-payment-contract";

const memberUid = "11111111-1111-4111-8111-111111111111";
const candidateUid = "22222222-2222-4222-8222-222222222222";
const createdUid = "33333333-3333-4333-8333-333333333333";

function row(overrides: Partial<FrozenLegacyPayment> = {}): FrozenLegacyPayment {
  return {
    paymentId: 101,
    sourceContentDigest: "3".repeat(64),
    userId: 315,
    amountParse: parseLegacySignedAmount("50000"),
    year: 2026,
    type: "연회비",
    status: "completed",
    createdAt: "2026-03-16T12:00:00",
    hasOpenDataException: false,
    ...overrides,
  };
}

function evidence(overrides: Partial<LegacyDecisionEvidence> = {}): LegacyDecisionEvidence {
  return {
    timezoneSnapshot: "Asia/Seoul",
    memberUid,
    candidateEventUids: [],
    uniqueCandidateHasExactApprovedDuesTopology: false,
    ...overrides,
  };
}

test("signed legacy amount preserves canonical signed evidence only", () => {
  for (const valid of ["0", "1", "50000", "-1", "-50000"]) {
    assert.deepEqual(parseLegacySignedAmount(valid).sourceAmountSignedOrNull, valid);
  }
  for (const invalid of ["-0", "+0", "+1", "00", "01", "-01", " 1", "1 ", "1.0", ""]) {
    assert.deepEqual(parseLegacySignedAmount(invalid).sourceAmountSignedOrNull, null);
  }
});

test("static eligibility returns the first failing predicate in the approved order", () => {
  const cases: Array<[Partial<FrozenLegacyPayment>, string]> = [
    [{ userId: null }, "LEGACY_USER_NULL"],
    [{ amountParse: parseLegacySignedAmount("+50000") }, "LEGACY_AMOUNT_INVALID"],
    [{ amountParse: parseLegacySignedAmount("0") }, "LEGACY_AMOUNT_NONPOSITIVE"],
    [{ year: 2027 }, "LEGACY_YEAR_OUT_OF_RANGE"],
    [{ type: "기타" }, "LEGACY_TYPE_NOT_ANNUAL_DUES"],
    [{ status: "pending" }, "LEGACY_STATUS_NOT_COMPLETED"],
    [{ createdAt: null }, "LEGACY_CREATED_AT_NULL"],
    [{ hasOpenDataException: true }, "LEGACY_DATA_EXCEPTION_OPEN"],
  ];
  for (const [overrides, reason] of cases) assert.equal(firstLegacyIneligibility(row(overrides)), reason);
  assert.equal(firstLegacyIneligibility(row()), null);
  assert.equal(firstLegacyIneligibility(row({ userId: null, amountParse: parseLegacySignedAmount("0") })), "LEGACY_USER_NULL");
});

test("the five decision states have exact event-reference shapes", () => {
  assert.deepEqual(decideLegacyPayment(row({ userId: null }), evidence()), {
    decision: "ineligible", reasonCode: "LEGACY_USER_NULL", memberUidOrNull: null,
    candidateEventUidOrNull: null, createdEventUidOrNull: null, timezoneSnapshot: "Asia/Seoul",
  });
  assert.equal(decideLegacyPayment(row(), evidence({ timezoneSnapshot: null })).decision, "review");
  assert.equal(decideLegacyPayment(row(), evidence({ memberUid: null })).decision, "quarantine");
  assert.equal(decideLegacyPayment(row(), evidence({ candidateEventUids: [candidateUid], uniqueCandidateHasExactApprovedDuesTopology: false })).decision, "review");
  const crossLink = decideLegacyPayment(row(), evidence({ candidateEventUids: [candidateUid], uniqueCandidateHasExactApprovedDuesTopology: true }));
  assert.deepEqual([crossLink.decision, crossLink.candidateEventUidOrNull, crossLink.createdEventUidOrNull], ["cross_link", candidateUid, null]);
  const created = decideLegacyPayment(row(), evidence(), createdUid);
  assert.deepEqual([created.decision, created.candidateEventUidOrNull, created.createdEventUidOrNull], ["new_compatibility_event", null, createdUid]);
  assert.throws(() => decideLegacyPayment(row(), evidence()), /legacy_created_event_uid_required/);
});

test("multiple distinct candidates quarantine while duplicate discovery is de-duplicated", () => {
  const otherUid = "44444444-4444-4444-8444-444444444444";
  assert.equal(decideLegacyPayment(row(), evidence({ candidateEventUids: [candidateUid, otherUid] })).decision, "quarantine");
  assert.equal(decideLegacyPayment(row(), evidence({ candidateEventUids: [candidateUid, candidateUid], uniqueCandidateHasExactApprovedDuesTopology: true })).decision, "cross_link");
});

test("candidate date locks are exactly previous, same and next KST calendar day", () => {
  assert.deepEqual(legacyCandidateKstDates("2024-02-29"), ["2024-02-28", "2024-02-29", "2024-03-01"]);
  assert.deepEqual(legacyCandidateKstDates("2025-01-01"), ["2024-12-31", "2025-01-01", "2025-01-02"]);
  assert.throws(() => legacyCandidateKstDates("2025-02-29"), /legacy_occurred_kst_date_invalid/);
});

test("candidate-day locks use the exact member candidate preimage and full-digest order", () => {
  const keys = legacyCandidateLockKeys({ memberUid, duesYear: 2026, amount: "50000", occurredKstDate: "2026-03-16" });
  assert.deepEqual(keys.map((entry) => entry.occurredKstDate).sort(), ["2026-03-15", "2026-03-16", "2026-03-17"]);
  assert.deepEqual(keys.map((entry) => entry.advisoryKey), [...keys.map((entry) => entry.advisoryKey)].sort());
  assert.equal(new Set(keys.map((entry) => entry.candidateKey)).size, 3);
  assert.equal(keys.every((entry) => /^[0-9a-f]{64}$/.test(entry.candidateKey) && /^[0-9a-f]{64}$/.test(entry.advisoryKey)), true);
});

test("decision key is deterministic and changes with terminal evidence", () => {
  const created = decideLegacyPayment(row(), evidence(), createdUid);
  assert.equal(legacyDecisionKey(row(), created), legacyDecisionKey(row(), created));
  const changed = decideLegacyPayment(row(), evidence(), "55555555-5555-4555-8555-555555555555");
  assert.notEqual(legacyDecisionKey(row(), created), legacyDecisionKey(row(), changed));
});
