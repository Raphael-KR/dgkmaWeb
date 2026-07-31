import { readFileSync } from "node:fs";

export type ExceptionClass = "pre_anchor_blocking" | "legacy_not_valid";
export type Sequence20Outcome = "block_before_ddl" | "add_not_valid_only";

export interface DomainExceptionRule {
  predicate_id: string;
  exception_code: string;
  exception_class: ExceptionClass;
  table: string;
  predicate_sql: string;
  sequence15_status: "open";
  sequence20_outcome: Sequence20Outcome;
}

type ManifestRule = {
  rule_code: string;
  exception_class: string;
  table: string;
  predicate_sql: string;
};

const pre = (
  predicate_id: string,
  exception_code: string,
  table: string,
  predicate_sql: string,
): DomainExceptionRule => ({
  predicate_id,
  exception_code,
  exception_class: "pre_anchor_blocking",
  table,
  predicate_sql,
  sequence15_status: "open",
  sequence20_outcome: "block_before_ddl",
});

const legacy = (
  predicate_id: string,
  exception_code: string,
  predicate_sql: string,
): DomainExceptionRule => ({
  predicate_id,
  exception_code,
  exception_class: "legacy_not_valid",
  table: "payments",
  predicate_sql,
  sequence15_status: "open",
  sequence20_outcome: "add_not_valid_only",
});

export const DOMAIN_EXCEPTION_RULES: readonly DomainExceptionRule[] = [
  pre("users.email_canonical_nonblank", "USERS_EMAIL_CANONICAL_BLANK", "users", "email IS NOT NULL AND btrim(email) = ''"),
  pre("users.email_canonical_unique", "USERS_EMAIL_CANONICAL_DUPLICATE", "users", "email_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users duplicate WHERE duplicate.email_canonical = users.email_canonical AND duplicate.id <> users.id)"),
  pre("users.phone_canonical_source_valid", "USERS_PHONE_CANONICAL_INVALID", "users", "phone_number IS NOT NULL AND btrim(phone_number) <> '' AND phone_canonical IS NULL"),
  pre("users.phone_canonical_unique", "USERS_PHONE_CANONICAL_DUPLICATE", "users", "phone_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users duplicate WHERE duplicate.phone_canonical = users.phone_canonical AND duplicate.id <> users.id)"),
  pre("users.birthday_type_domain", "USERS_BIRTHDAY_TYPE_UNKNOWN", "users", "birthday_type IS NOT NULL AND birthday_type NOT IN ('SOLAR','LUNAR')"),
  pre("categories.badge_variant_domain", "CATEGORIES_BADGE_VARIANT_UNKNOWN", "categories", "badge_variant NOT IN ('default','secondary','destructive','outline')"),
  pre("categories.sort_order_nonnegative", "CATEGORIES_SORT_ORDER_NEGATIVE", "categories", "sort_order < 0"),
  pre("alumni_database.mobile_canonical_source_valid", "ALUMNI_MOBILE_CANONICAL_INVALID", "alumni_database", "mobile IS NOT NULL AND btrim(mobile) <> '' AND mobile_canonical IS NULL"),
  pre("alumni_database.mobile_canonical_unique", "ALUMNI_MOBILE_CANONICAL_DUPLICATE", "alumni_database", "mobile_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE duplicate.mobile_canonical = alumni_database.mobile_canonical AND duplicate.id <> alumni_database.id)"),
  pre("alumni_database.matched_user_id_unique", "ALUMNI_MATCHED_USER_DUPLICATE", "alumni_database", "matched_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE duplicate.matched_user_id = alumni_database.matched_user_id AND duplicate.id <> alumni_database.id)"),
  pre("community_events.legacy_obituary_fk", "COMMUNITY_EVENT_LEGACY_OBITUARY_ORPHAN", "community_events", "legacy_obituary_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM obituaries WHERE obituaries.id = community_events.legacy_obituary_id)"),
  pre("community_events.event_type_domain", "COMMUNITY_EVENT_TYPE_UNKNOWN", "community_events", "event_type NOT IN ('obituary','wedding','opening','other')"),
  pre("community_events.status_domain", "COMMUNITY_EVENT_STATUS_UNKNOWN", "community_events", "status NOT IN ('draft','published')"),
  pre("event_parse_rate_limits.request_count_nonnegative", "EVENT_PARSE_REQUEST_COUNT_NEGATIVE", "event_parse_rate_limits", "request_count < 0"),
  pre("event_parse_rate_limits.updated_after_window_start", "EVENT_PARSE_UPDATED_BEFORE_WINDOW", "event_parse_rate_limits", "updated_at < window_started_at"),
  pre("pending_registrations.email_canonical_nonblank", "PENDING_EMAIL_BLANK", "pending_registrations", "btrim(email) = ''"),
  pre("pending_registrations.pending_kakao_id_unique", "PENDING_KAKAO_DUPLICATE", "pending_registrations", "status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.kakao_id = pending_registrations.kakao_id AND duplicate.id <> pending_registrations.id)"),
  pre("pending_registrations.pending_email_canonical_unique", "PENDING_EMAIL_CANONICAL_DUPLICATE", "pending_registrations", "status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.email_canonical = pending_registrations.email_canonical AND duplicate.id <> pending_registrations.id)"),
  pre("pending_registrations.status_null", "PENDING_STATUS_NULL", "pending_registrations", "status IS NULL"),
  pre("pending_registrations.status_domain", "PENDING_STATUS_UNKNOWN", "pending_registrations", "status IS NOT NULL AND status NOT IN ('pending','approved','rejected')"),
  pre("kakao_oauth_states.expiry_after_start", "KAKAO_OAUTH_EXPIRES_NOT_AFTER_START", "kakao_oauth_states", "expires_at <= started_at"),
  legacy("payments.amount_positive", "PAYMENTS_AMOUNT_NONPOSITIVE", "amount <= 0"),
  legacy("payments.year_domain", "PAYMENTS_YEAR_OUT_OF_RANGE", "year NOT BETWEEN 2024 AND 2100"),
  legacy("payments.type_domain", "PAYMENTS_TYPE_UNKNOWN", "type NOT IN ('연회비','기타')"),
  legacy("payments.status_domain", "PAYMENTS_STATUS_UNKNOWN", "status NOT IN ('pending','completed','failed')"),
] as const;

export const EXACT_EXCEPTION_CODES = DOMAIN_EXCEPTION_RULES.map((rule) => rule.exception_code);

export const CANONICAL_PHONE_VECTORS = [
  { vector_id: "raw_10", raw: "1012345678", expected: "01012345678" },
  { vector_id: "raw_8210", raw: "82 10-1234-5678", expected: "01012345678" },
  { vector_id: "raw_0", raw: "010-1234-5678", expected: "01012345678" },
  { vector_id: "blank", raw: "   ", expected: null },
  { vector_id: "null", raw: null, expected: null },
  { vector_id: "invalid", raw: "12345", expected: null },
] as const;

function fail(): never {
  throw new Error("unregistered_schema_exception_rule");
}

function duplicate(values: string[]): boolean {
  return new Set(values).size !== values.length;
}

export function canonicalPhone(raw: string | null): string | null {
  if (raw === null || raw.trim() === "") return null;
  const digits = raw.replace(/[^0-9]/g, "");
  if (/^8210[0-9]{8}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^10[0-9]{8}$/.test(digits)) return `0${digits}`;
  if (/^0[0-9]{9,10}$/.test(digits)) return digits;
  return null;
}

export function canonicalPhoneSql(rawExpression: string, manifestPath = "docs/database-manifest.yaml"): string {
  if (!/^[a-z_][a-z0-9_.]*$/i.test(rawExpression)) throw new Error("canonical_phone_raw_expression_invalid");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const expression = manifest.canonical_phone_sql;
  if (typeof expression !== "string" || !expression.includes("~ '^10[0-9]{8}$' THEN '0'||")) {
    throw new Error("canonical_phone_manifest_expression_mismatch");
  }
  return expression.replace(/\braw\b/g, rawExpression);
}

export function canonicalPhoneVectorSql(): string {
  const rows = ["users.phone_number", "alumni_database.mobile"].flatMap((surface) =>
    CANONICAL_PHONE_VECTORS.map((vector) => {
      const raw = vector.raw === null ? "NULL" : `'${vector.raw.replaceAll("'", "''")}'`;
      const expected = vector.expected === null ? "NULL" : `'${vector.expected}'`;
      return `('${surface}','${vector.vector_id}',${raw}::text,${expected}::text)`;
    }),
  );
  const projection = canonicalPhoneSql("phone_vectors.raw_value");
  return [
    "WITH phone_vectors(surface, vector_id, raw_value, expected) AS (VALUES",
    `  ${rows.join(",\n  ")}`,
    ")",
    "SELECT surface, vector_id, expected,",
    `       ${projection} AS actual,`,
    `       (${projection}) IS NOT DISTINCT FROM expected AS projection_equal`,
    "FROM phone_vectors ORDER BY surface, vector_id;",
  ].join("\n");
}

export function validateClosedRuleContract(
  manifestPath = "docs/database-manifest.yaml",
  contract: readonly DomainExceptionRule[] = DOMAIN_EXCEPTION_RULES,
): readonly DomainExceptionRule[] {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const manifestRules = manifest.sequence_15_rule_registry?.rules as ManifestRule[] | undefined;
  if (!Array.isArray(manifestRules) || manifestRules.length !== 25 || contract.length !== 25) fail();
  if (duplicate(contract.map((rule) => rule.predicate_id)) || duplicate(contract.map((rule) => rule.exception_code))) fail();
  if (contract.filter((rule) => rule.exception_class === "pre_anchor_blocking").length !== 21) fail();
  if (contract.filter((rule) => rule.exception_class === "legacy_not_valid").length !== 4) fail();
  const byPredicate = new Map(contract.map((rule) => [rule.predicate_id, rule]));
  for (const physical of manifestRules) {
    const projected = byPredicate.get(physical.rule_code);
    if (!projected) fail();
    if (
      projected.exception_class !== physical.exception_class || projected.table !== physical.table ||
      projected.predicate_sql !== physical.predicate_sql || projected.sequence15_status !== "open" ||
      projected.sequence20_outcome !== (physical.exception_class === "pre_anchor_blocking" ? "block_before_ddl" : "add_not_valid_only")
    ) fail();
  }
  if (manifestRules.some((rule) => !byPredicate.has(rule.rule_code))) fail();
  const blank = byPredicate.get("users.email_canonical_nonblank");
  if (!blank || blank.exception_code !== "USERS_EMAIL_CANONICAL_BLANK" || blank.predicate_sql !== "email IS NOT NULL AND btrim(email) = ''") fail();
  return contract;
}

export type CapturedException = Pick<DomainExceptionRule,
  "predicate_id" | "exception_code" | "exception_class" | "table" | "sequence15_status" | "sequence20_outcome"
>;

export function captureObservedPredicates(
  predicateIds: readonly string[],
  contract: readonly DomainExceptionRule[] = DOMAIN_EXCEPTION_RULES,
): CapturedException[] {
  const byPredicate = new Map(contract.map((rule) => [rule.predicate_id, rule]));
  return predicateIds.map((predicateId) => {
    const rule = byPredicate.get(predicateId);
    if (!rule) fail();
    return {
      predicate_id: rule.predicate_id,
      exception_code: rule.exception_code,
      exception_class: rule.exception_class,
      table: rule.table,
      sequence15_status: rule.sequence15_status,
      sequence20_outcome: rule.sequence20_outcome,
    };
  });
}

export function decideSequence20(exceptions: readonly CapturedException[]) {
  const preAnchorCount = exceptions.filter((entry) => entry.exception_class === "pre_anchor_blocking").length;
  const legacyCount = exceptions.filter((entry) => entry.exception_class === "legacy_not_valid").length;
  return {
    result: preAnchorCount > 0 ? "blocked_pre_anchor" : "not_valid_only",
    pre_anchor_blocking_count: preAnchorCount,
    legacy_not_valid_count: legacyCount,
    ddl_allowed: preAnchorCount === 0,
    validate_legacy_constraints: false,
    source_rewrites: 0,
  } as const;
}

export function sequence15SqlRegistry(contract: readonly DomainExceptionRule[] = DOMAIN_EXCEPTION_RULES): string {
  const values = contract.map((rule) =>
    `('${rule.predicate_id.replaceAll("'", "''")}','${rule.exception_code}','${rule.exception_class}','${rule.table}','open','${rule.sequence20_outcome}')`,
  ).join(",\n  ");
  return `SELECT predicate_id, exception_code, exception_class, table_name, sequence15_status, sequence20_outcome\nFROM (VALUES\n  ${values}\n) AS closed_rule(predicate_id, exception_code, exception_class, table_name, sequence15_status, sequence20_outcome)\nORDER BY predicate_id;`;
}

export function parseSequence15SqlRegistry(sql: string): Array<Omit<DomainExceptionRule, "predicate_sql">> {
  const matches = [...sql.matchAll(/\('([^']+)','([^']+)','([^']+)','([^']+)','([^']+)','([^']+)'\)/g)];
  if (matches.length !== 25) fail();
  return matches.map((match) => ({
    predicate_id: match[1],
    exception_code: match[2],
    exception_class: match[3] as ExceptionClass,
    table: match[4],
    sequence15_status: match[5] as "open",
    sequence20_outcome: match[6] as Sequence20Outcome,
  }));
}

export function developmentInventorySql(contract: readonly DomainExceptionRule[] = DOMAIN_EXCEPTION_RULES): string {
  validateClosedRuleContract("docs/database-manifest.yaml", contract);
  const projectedTable: Record<string, string> = {
    users: "users_projected AS users",
    alumni_database: "alumni_database_projected AS alumni_database",
    pending_registrations: "pending_registrations_projected AS pending_registrations",
  };
  const projectedPredicate: Record<string, string> = {
    "users.email_canonical_unique": "email_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users_projected duplicate WHERE duplicate.email_canonical = users.email_canonical AND duplicate.id <> users.id)",
    "users.phone_canonical_source_valid": "phone_number IS NOT NULL AND btrim(phone_number) <> '' AND phone_canonical IS NULL",
    "users.phone_canonical_unique": "phone_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users_projected duplicate WHERE duplicate.phone_canonical = users.phone_canonical AND duplicate.id <> users.id)",
    "alumni_database.mobile_canonical_source_valid": "mobile IS NOT NULL AND btrim(mobile) <> '' AND mobile_canonical IS NULL",
    "alumni_database.mobile_canonical_unique": "mobile_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database_projected duplicate WHERE duplicate.mobile_canonical = alumni_database.mobile_canonical AND duplicate.id <> alumni_database.id)",
    "pending_registrations.pending_email_canonical_unique": "status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations_projected duplicate WHERE duplicate.status = 'pending' AND duplicate.email_canonical = pending_registrations.email_canonical AND duplicate.id <> pending_registrations.id)",
  };
  const selects = contract.map((rule) =>
    `SELECT '${rule.predicate_id.replaceAll("'", "''")}'::text AS predicate_id, ` +
    `'${rule.exception_code}'::text AS exception_code, '${rule.exception_class}'::text AS exception_class, ` +
    `COUNT(*)::bigint AS violation_count FROM ${projectedTable[rule.table] ?? rule.table} ` +
    `WHERE ${projectedPredicate[rule.predicate_id] ?? rule.predicate_sql}`,
  );
  return [
    "BEGIN TRANSACTION READ ONLY;",
    "SELECT current_database() AS current_database, current_user AS current_user;",
    "WITH users_projected AS (",
    `  SELECT users.*, lower(btrim(email)) AS email_canonical, ${canonicalPhoneSql("phone_number")} AS phone_canonical FROM users`,
    "), alumni_database_projected AS (",
    `  SELECT alumni_database.*, ${canonicalPhoneSql("mobile")} AS mobile_canonical FROM alumni_database`,
    "), pending_registrations_projected AS (",
    "  SELECT pending_registrations.*, lower(btrim(email)) AS email_canonical FROM pending_registrations",
    "), rule_counts AS (",
    ...selects.flatMap((select, index) => [`  ${select}${index === selects.length - 1 ? "" : " UNION ALL"}`]),
    ")",
    "SELECT predicate_id, exception_code, exception_class, violation_count,",
    "       SUM(violation_count) OVER (PARTITION BY exception_class)::bigint AS class_violation_count",
    "FROM rule_counts ORDER BY predicate_id;",
    canonicalPhoneVectorSql(),
    "ROLLBACK;",
    "",
  ].join("\n");
}
