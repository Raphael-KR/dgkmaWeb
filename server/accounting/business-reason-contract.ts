export type BusinessReasonTuple = Readonly<{
  table: string;
  actionOrStatus: string;
  reasonCode: string;
}>;

const tuples = (
  table: string,
  entries: ReadonlyArray<readonly [actionOrStatus: string, reasonCode: string]>,
): BusinessReasonTuple[] => entries.map(([actionOrStatus, reasonCode]) => ({ table, actionOrStatus, reasonCode }));

export const BUSINESS_REASON_TUPLES: readonly BusinessReasonTuple[] = [
  ...tuples("mutable_entity_action_history", [
    ["end", "MEMBER_ENDED"],
    ["reactivate", "MEMBER_REACTIVATED"],
    ["correct:admin", "MEMBER_IDENTITY_CORRECTED"],
    ["correct:member_self", "ACCOUNT_DELETE_UNLINK"],
    ["reconcile", "PERIOD_RECONCILE_REQUESTED"],
    ["close", "PERIOD_CLOSE_APPROVED"],
    ["reopen", "PERIOD_REOPEN_APPROVED"],
  ]),
  ...tuples("member_match_cases", [
    ["create:unmatched", "SOURCE_MATCH_REQUIRED"],
    ["create:unmatched", "MANUAL_MATCH_REQUIRED"],
    ["create:unmatched", "NAME_ONLY_UNAPPROVABLE"],
    ["create:unmatched", "NO_CANDIDATE"],
    ["create:candidate", "SOURCE_MATCH_REQUIRED"],
    ["create:candidate", "MANUAL_MATCH_REQUIRED"],
    ["create:candidate", "MULTIPLE_CANDIDATES"],
    ["approve", "MATCH_APPROVED"],
    ["reject", "MATCH_REJECTED"],
    ["supersede", "MATCH_SUPERSEDED"],
  ]),
  ...tuples("member_identity_link_history", [
    ["link", "IDENTITY_LINKED"],
    ["correct", "IDENTITY_CORRECTED"],
    ["unlink_user:admin", "IDENTITY_USER_UNLINKED"],
    ["unlink_user:member_self", "ACCOUNT_DELETE_UNLINK"],
    ["unlink_all", "IDENTITY_ALL_UNLINKED"],
  ]),
  ...tuples("economic_event_authority_decisions", [
    ["select", "HIGHEST_AUTHORITY_SELECTED"],
    ["supersede", "HIGHER_AUTHORITY_SUPERSEDED"],
    ["quarantine:tie", "AUTHORITY_TIE_QUARANTINED"],
    ["quarantine:invalid", "AUTHORITY_INVALID_QUARANTINED"],
  ]),
  ...tuples("economic_event_canonicalizations", [
    ["create", "CHILDLESS_DUPLICATE_CANONICALIZED"],
  ]),
  ...tuples("economic_event_collisions", [
    ["create:open", "POTENTIAL_DUPLICATE_OPEN"],
    ["create:open", "COLLISION_REVIEW_REQUIRED"],
    ["supersede:open", "COLLISION_REVIEW_REQUIRED"],
    ["resolve", "CHILDLESS_DUPLICATE_RESOLVED"],
  ]),
  ...tuples("legacy_payment_decisions", [
    ["ineligible", "LEGACY_USER_NULL"],
    ["ineligible", "LEGACY_AMOUNT_INVALID"],
    ["ineligible", "LEGACY_AMOUNT_NONPOSITIVE"],
    ["ineligible", "LEGACY_YEAR_OUT_OF_RANGE"],
    ["ineligible", "LEGACY_TYPE_NOT_ANNUAL_DUES"],
    ["ineligible", "LEGACY_STATUS_NOT_COMPLETED"],
    ["ineligible", "LEGACY_CREATED_AT_NULL"],
    ["ineligible", "LEGACY_DATA_EXCEPTION_OPEN"],
    ["review", "LEGACY_TIMEZONE_UNRESOLVED"],
    ["review", "LEGACY_EVIDENCE_AMBIGUOUS"],
    ["quarantine", "LEGACY_IDENTITY_AMBIGUOUS"],
    ["quarantine", "LEGACY_EVIDENCE_AMBIGUOUS"],
    ["cross_link", "LEGACY_CROSS_LINK_MATCHED"],
    ["new_compatibility_event", "LEGACY_COMPATIBILITY_EVENT_CREATED"],
  ]),
  ...tuples("dues_receipt_reversals", [
    ["proposed", "BANK_DUES_REFUND"],
    ["approved", "BANK_DUES_REFUND"],
    ["rejected", "BANK_DUES_REFUND"],
  ]),
];

const BUSINESS_REASON_KEYS = new Set(BUSINESS_REASON_TUPLES.map(({ table, actionOrStatus, reasonCode }) => `${table}\u0000${actionOrStatus}\u0000${reasonCode}`));

if (BUSINESS_REASON_KEYS.size !== BUSINESS_REASON_TUPLES.length) throw new Error("business_reason_registry_duplicate");

export function assertBusinessReasonTuple(table: string, actionOrStatus: string, reasonCode: unknown): asserts reasonCode is string {
  if (typeof reasonCode !== "string" || !BUSINESS_REASON_KEYS.has(`${table}\u0000${actionOrStatus}\u0000${reasonCode}`)) throw new Error("business_reason_tuple_invalid");
}
