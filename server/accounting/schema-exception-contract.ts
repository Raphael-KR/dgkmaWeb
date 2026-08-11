export type SchemaExceptionClass = "pre_anchor_blocking" | "legacy_not_valid";
export type SchemaExceptionStatus = "open" | "resolved" | "waived";
export type SchemaExceptionResolution = "SOURCE_FIXED" | "DUPLICATE_RESOLVED" | "OWNER_WAIVER" | null;

export type SchemaExceptionRule = Readonly<{
  ruleCode: string;
  exceptionClass: SchemaExceptionClass;
  table: string;
  predicateSql: string;
  duplicateClass: boolean;
}>;

const rules = (
  exceptionClass: SchemaExceptionClass,
  entries: ReadonlyArray<readonly [ruleCode: string, table: string, predicateSql: string, duplicateClass?: boolean]>,
): SchemaExceptionRule[] => entries.map(([ruleCode, table, predicateSql, duplicateClass = false]) => ({
  ruleCode, exceptionClass, table, predicateSql, duplicateClass,
}));

export const SCHEMA_EXCEPTION_RULES: readonly SchemaExceptionRule[] = [
  ...rules("pre_anchor_blocking", [
    ["USERS_EMAIL_CANONICAL_BLANK", "users", "email IS NOT NULL AND btrim(email) = ''"],
    ["USERS_EMAIL_CANONICAL_DUPLICATE", "users", "email_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users duplicate WHERE duplicate.email_canonical = users.email_canonical AND duplicate.id <> users.id)", true],
    ["USERS_PHONE_CANONICAL_INVALID", "users", "phone_number IS NOT NULL AND btrim(phone_number) <> '' AND phone_canonical IS NULL"],
    ["USERS_PHONE_CANONICAL_DUPLICATE", "users", "phone_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users duplicate WHERE duplicate.phone_canonical = users.phone_canonical AND duplicate.id <> users.id)", true],
    ["USERS_BIRTHDAY_TYPE_UNKNOWN", "users", "birthday_type IS NOT NULL AND birthday_type NOT IN ('SOLAR','LUNAR')"],
    ["CATEGORIES_BADGE_VARIANT_UNKNOWN", "categories", "badge_variant NOT IN ('default','secondary','destructive','outline')"],
    ["CATEGORIES_SORT_ORDER_NEGATIVE", "categories", "sort_order < 0"],
    ["ALUMNI_MOBILE_CANONICAL_INVALID", "alumni_database", "mobile IS NOT NULL AND btrim(mobile) <> '' AND mobile_canonical IS NULL"],
    ["ALUMNI_MOBILE_CANONICAL_DUPLICATE", "alumni_database", "mobile_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE duplicate.mobile_canonical = alumni_database.mobile_canonical AND duplicate.id <> alumni_database.id)", true],
    ["ALUMNI_MATCHED_USER_DUPLICATE", "alumni_database", "matched_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE duplicate.matched_user_id = alumni_database.matched_user_id AND duplicate.id <> alumni_database.id)", true],
    ["COMMUNITY_EVENT_LEGACY_OBITUARY_ORPHAN", "community_events", "legacy_obituary_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM obituaries WHERE obituaries.id = community_events.legacy_obituary_id)"],
    ["COMMUNITY_EVENT_TYPE_UNKNOWN", "community_events", "event_type NOT IN ('obituary','wedding','opening','other')"],
    ["COMMUNITY_EVENT_STATUS_UNKNOWN", "community_events", "status NOT IN ('draft','published')"],
    ["EVENT_PARSE_REQUEST_COUNT_NEGATIVE", "event_parse_rate_limits", "request_count < 0"],
    ["EVENT_PARSE_UPDATED_BEFORE_WINDOW", "event_parse_rate_limits", "updated_at < window_started_at"],
    ["PENDING_EMAIL_BLANK", "pending_registrations", "btrim(email) = ''"],
    ["PENDING_KAKAO_DUPLICATE", "pending_registrations", "status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.kakao_id = pending_registrations.kakao_id AND duplicate.id <> pending_registrations.id)", true],
    ["PENDING_EMAIL_CANONICAL_DUPLICATE", "pending_registrations", "status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.email_canonical = pending_registrations.email_canonical AND duplicate.id <> pending_registrations.id)", true],
    ["PENDING_STATUS_NULL", "pending_registrations", "status IS NULL"],
    ["PENDING_STATUS_UNKNOWN", "pending_registrations", "status IS NOT NULL AND status NOT IN ('pending','approved','rejected')"],
    ["KAKAO_OAUTH_EXPIRES_NOT_AFTER_START", "kakao_oauth_states", "expires_at <= started_at"],
  ]),
  ...rules("legacy_not_valid", [
    ["PAYMENTS_AMOUNT_NONPOSITIVE", "payments", "amount <= 0"],
    ["PAYMENTS_YEAR_OUT_OF_RANGE", "payments", "year NOT BETWEEN 2024 AND 2100"],
    ["PAYMENTS_TYPE_UNKNOWN", "payments", "type NOT IN ('연회비','기타')"],
    ["PAYMENTS_STATUS_UNKNOWN", "payments", "status NOT IN ('pending','completed','failed')"],
  ]),
];

const RULE_BY_CODE = new Map(SCHEMA_EXCEPTION_RULES.map((rule) => [rule.ruleCode, rule]));
if (RULE_BY_CODE.size !== 25) throw new Error("schema_exception_registry_duplicate");

export function assertSchemaExceptionTuple(input: Readonly<{
  ruleCode: unknown;
  exceptionClass: unknown;
  status: unknown;
  resolutionCode: unknown;
}>): void {
  if (typeof input.ruleCode !== "string") throw new Error("schema_exception_rule_code_invalid");
  const rule = RULE_BY_CODE.get(input.ruleCode);
  if (!rule || input.exceptionClass !== rule.exceptionClass) throw new Error("schema_exception_rule_class_invalid");
  if (input.status === "open") {
    if (input.resolutionCode !== null) throw new Error("schema_exception_resolution_tuple_invalid");
    return;
  }
  if (input.status === "waived") {
    if (input.resolutionCode !== "OWNER_WAIVER") throw new Error("schema_exception_resolution_tuple_invalid");
    return;
  }
  if (input.status === "resolved") {
    if (input.resolutionCode === "SOURCE_FIXED") return;
    if (input.resolutionCode === "DUPLICATE_RESOLVED" && rule.duplicateClass) return;
  }
  throw new Error("schema_exception_resolution_tuple_invalid");
}
