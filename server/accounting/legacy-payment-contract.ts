import { canonicalJson, sha256, type CanonicalValue } from "./source-contracts";

export type LegacyPaymentDecision =
  | "cross_link"
  | "new_compatibility_event"
  | "review"
  | "ineligible"
  | "quarantine";

export type LegacyPaymentReason =
  | "LEGACY_USER_NULL"
  | "LEGACY_AMOUNT_INVALID"
  | "LEGACY_AMOUNT_NONPOSITIVE"
  | "LEGACY_YEAR_OUT_OF_RANGE"
  | "LEGACY_TYPE_NOT_ANNUAL_DUES"
  | "LEGACY_STATUS_NOT_COMPLETED"
  | "LEGACY_CREATED_AT_NULL"
  | "LEGACY_DATA_EXCEPTION_OPEN"
  | "LEGACY_TIMEZONE_UNRESOLVED"
  | "LEGACY_IDENTITY_AMBIGUOUS"
  | "LEGACY_EVIDENCE_AMBIGUOUS"
  | "LEGACY_CROSS_LINK_MATCHED"
  | "LEGACY_COMPATIBILITY_EVENT_CREATED";

export type LegacyAmountEnvelope = {
  status: "valid_signed" | "invalid";
  rawDigest: string;
  sourceAmountSignedOrNull: string | null;
};

export type FrozenLegacyPayment = {
  paymentId: number;
  sourceContentDigest: string;
  userId: number | null;
  amountParse: LegacyAmountEnvelope;
  year: number | null;
  type: string;
  status: string;
  createdAt: string | null;
  hasOpenDataException: boolean;
};

export type LegacyDecisionEvidence = {
  timezoneSnapshot: string | null;
  memberUid: string | null;
  candidateEventUids: string[];
  uniqueCandidateHasExactApprovedDuesTopology: boolean;
};

export type LegacyDecisionProjection = {
  decision: LegacyPaymentDecision;
  reasonCode: LegacyPaymentReason;
  memberUidOrNull: string | null;
  candidateEventUidOrNull: string | null;
  createdEventUidOrNull: string | null;
  timezoneSnapshot: string;
};

const SIGNED_AMOUNT = /^(0|[1-9][0-9]*|-[1-9][0-9]*)$/;
const SHA256 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(code: string): never { throw new Error(code); }

export function parseLegacySignedAmount(raw: string): LegacyAmountEnvelope {
  const rawDigest = sha256(raw);
  if (!SIGNED_AMOUNT.test(raw)) return { status: "invalid", rawDigest, sourceAmountSignedOrNull: null };
  return { status: "valid_signed", rawDigest, sourceAmountSignedOrNull: raw };
}

export function firstLegacyIneligibility(row: FrozenLegacyPayment): LegacyPaymentReason | null {
  if (!Number.isSafeInteger(row.paymentId) || row.paymentId <= 0) fail("legacy_payment_id_invalid");
  if (!SHA256.test(row.sourceContentDigest)) fail("legacy_source_content_digest_invalid");
  if (row.userId === null) return "LEGACY_USER_NULL";
  if (row.amountParse.status !== "valid_signed" || row.amountParse.sourceAmountSignedOrNull === null) return "LEGACY_AMOUNT_INVALID";
  if (!SIGNED_AMOUNT.test(row.amountParse.sourceAmountSignedOrNull)) fail("legacy_amount_envelope_invalid");
  if (BigInt(row.amountParse.sourceAmountSignedOrNull) <= 0n) return "LEGACY_AMOUNT_NONPOSITIVE";
  if (row.year === null || !Number.isSafeInteger(row.year) || row.year < 2024 || row.year > 2026) return "LEGACY_YEAR_OUT_OF_RANGE";
  if (row.type !== "연회비") return "LEGACY_TYPE_NOT_ANNUAL_DUES";
  if (row.status !== "completed") return "LEGACY_STATUS_NOT_COMPLETED";
  if (row.createdAt === null) return "LEGACY_CREATED_AT_NULL";
  if (row.hasOpenDataException) return "LEGACY_DATA_EXCEPTION_OPEN";
  return null;
}

function projection(
  decision: LegacyPaymentDecision,
  reasonCode: LegacyPaymentReason,
  evidence: LegacyDecisionEvidence,
  eventUid: string | null = null,
): LegacyDecisionProjection {
  return {
    decision,
    reasonCode,
    memberUidOrNull: decision === "ineligible" ? null : evidence.memberUid,
    candidateEventUidOrNull: decision === "cross_link" ? eventUid : null,
    createdEventUidOrNull: null,
    timezoneSnapshot: evidence.timezoneSnapshot ?? "unresolved",
  };
}

export function decideLegacyPayment(
  row: FrozenLegacyPayment,
  evidence: LegacyDecisionEvidence,
  createdEventUid: string | null = null,
): LegacyDecisionProjection {
  const staticFailure = firstLegacyIneligibility(row);
  if (staticFailure) return projection("ineligible", staticFailure, evidence);
  if (evidence.timezoneSnapshot !== "Asia/Seoul") return projection("review", "LEGACY_TIMEZONE_UNRESOLVED", evidence);
  if (!evidence.memberUid || !UUID.test(evidence.memberUid)) return projection("quarantine", "LEGACY_IDENTITY_AMBIGUOUS", evidence);
  if (evidence.candidateEventUids.some((uid) => !UUID.test(uid))) fail("legacy_candidate_event_uid_invalid");
  const candidates = [...new Set(evidence.candidateEventUids)].sort();
  if (candidates.length > 1) return projection("quarantine", "LEGACY_EVIDENCE_AMBIGUOUS", evidence);
  if (candidates.length === 1) {
    if (!evidence.uniqueCandidateHasExactApprovedDuesTopology) return projection("review", "LEGACY_EVIDENCE_AMBIGUOUS", evidence);
    return projection("cross_link", "LEGACY_CROSS_LINK_MATCHED", evidence, candidates[0]);
  }
  if (!createdEventUid || !UUID.test(createdEventUid)) fail("legacy_created_event_uid_required");
  return {
    ...projection("new_compatibility_event", "LEGACY_COMPATIBILITY_EVENT_CREATED", evidence),
    createdEventUidOrNull: createdEventUid,
  };
}

export function legacyCandidateKstDates(occurredKstDate: string): [string, string, string] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurredKstDate)) fail("legacy_occurred_kst_date_invalid");
  const date = new Date(`${occurredKstDate}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== occurredKstDate) fail("legacy_occurred_kst_date_invalid");
  return [-1, 0, 1].map((offset) => {
    const candidate = new Date(date.valueOf() + offset * 86_400_000);
    return candidate.toISOString().slice(0, 10);
  }) as [string, string, string];
}

export function legacyDecisionKey(row: FrozenLegacyPayment, decision: LegacyDecisionProjection): string {
  return sha256(canonicalJson({
    digest_version: "legacy-decision-v1",
    payment_id: row.paymentId,
    source_content_digest: row.sourceContentDigest,
    decision: decision.decision,
    member_uid_or_null: decision.memberUidOrNull,
    candidate_event_uid_or_null: decision.candidateEventUidOrNull,
    created_event_uid_or_null: decision.createdEventUidOrNull,
    reason_code: decision.reasonCode,
    timezone_snapshot: decision.timezoneSnapshot,
  } as CanonicalValue));
}
