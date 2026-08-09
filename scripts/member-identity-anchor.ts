import { readFileSync } from "node:fs";
import {
  canonicalPhone,
  canonicalPhoneSql,
  canonicalPhoneVectorSql,
  DOMAIN_EXCEPTION_RULES,
} from "./database-domain-constraints";

export const CANONICAL_MANIFEST_SHA256 = "24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a";

export const IDENTITY_ANCHOR_DEFINITIONS = [
  {
    table: "users",
    columns: [
      "user_uid uuid NOT NULL DEFAULT gen_random_uuid()",
      "email_canonical text GENERATED ALWAYS AS (lower(btrim(email))) STORED",
      "phone_canonical text GENERATED ALWAYS AS (CANONICAL_PHONE(phone_number)) STORED",
    ],
    constraints: ["user_uid_unique", "email_canonical_nonblank", "email_canonical_unique", "phone_canonical_source_valid", "phone_canonical_format", "phone_canonical_unique"],
  },
  {
    table: "alumni_database",
    columns: ["mobile_canonical text GENERATED ALWAYS AS (CANONICAL_PHONE(mobile)) STORED"],
    constraints: ["mobile_canonical_source_valid", "mobile_canonical_format", "mobile_canonical_unique", "matched_user_id_unique"],
  },
  {
    table: "pending_registrations",
    columns: [
      "status text NOT NULL DEFAULT 'pending'",
      "email_canonical text GENERATED ALWAYS AS (lower(btrim(email))) STORED",
    ],
    constraints: ["status_domain", "email_canonical_nonblank", "pending_kakao_id_unique", "pending_email_canonical_unique"],
  },
] as const;

export const IDENTITY_BLOCKER_CODES = {
  "users.email_canonical_nonblank": "USERS_EMAIL_CANONICAL_BLANK",
  "users.email_canonical_unique": "USERS_EMAIL_CANONICAL_DUPLICATE",
  "users.phone_canonical_source_valid": "USERS_PHONE_CANONICAL_INVALID",
  "users.phone_canonical_unique": "USERS_PHONE_CANONICAL_DUPLICATE",
  "alumni_database.mobile_canonical_source_valid": "ALUMNI_MOBILE_CANONICAL_INVALID",
  "alumni_database.mobile_canonical_unique": "ALUMNI_MOBILE_CANONICAL_DUPLICATE",
  "alumni_database.matched_user_id_unique": "ALUMNI_MATCHED_USER_DUPLICATE",
  "pending_registrations.email_canonical_nonblank": "PENDING_EMAIL_BLANK",
  "pending_registrations.pending_kakao_id_unique": "PENDING_KAKAO_DUPLICATE",
  "pending_registrations.pending_email_canonical_unique": "PENDING_EMAIL_CANONICAL_DUPLICATE",
  "pending_registrations.status_null": "PENDING_STATUS_NULL",
  "pending_registrations.status_domain": "PENDING_STATUS_UNKNOWN",
} as const;

export type IdentityPredicateId = keyof typeof IDENTITY_BLOCKER_CODES;

export type IdentityFixture = {
  users: Array<{ id: number; email: string | null; phone_number: string | null; name: string }>;
  alumni_database: Array<{ id: number; mobile: string | null; matched_user_id: number | null; name: string }>;
  pending_registrations: Array<{ id: number; kakao_id: string; email: string; status: string | null }>;
};

export type IdentityBlocker = {
  predicate_id: IdentityPredicateId;
  blocker_code: typeof IDENTITY_BLOCKER_CODES[IdentityPredicateId];
  exception_class: "pre_anchor_blocking";
  row_ids: number[];
  terminal: true;
  sequence20_outcome: "block_before_ddl";
};

export type ExactLink = {
  alumni_record_id: number;
  user_id: number;
  source: "alumni_database.matched_user_id";
  fk_backed: true;
};

export const CANONICAL_EMAIL_VECTORS = [
  { vector_id: "ordinary_spaces", raw: "  Member@Example.COM  ", expected: "member@example.com" },
  { vector_id: "tab_edges", raw: "\tMember@Example.COM\t", expected: "\tmember@example.com\t" },
  { vector_id: "newline_edges", raw: "\nMember@Example.COM\n", expected: "\nmember@example.com\n" },
  { vector_id: "nbsp_edges", raw: "\u00a0Member@Example.COM\u00a0", expected: "\u00a0member@example.com\u00a0" },
  { vector_id: "space_outside_tabs", raw: " \tMember@Example.COM\t ", expected: "\tmember@example.com\t" },
  { vector_id: "blank_spaces", raw: "   ", expected: "" },
  { vector_id: "null", raw: null, expected: null },
] as const;

function fail(message = "member_identity_anchor_contract_mismatch"): never {
  throw new Error(message);
}

function includesAll(haystack: readonly string[], needles: readonly string[]): boolean {
  return needles.every((needle) => haystack.includes(needle));
}

export function canonicalEmail(raw: string | null): string | null {
  return raw === null ? null : raw.replace(/^ +| +$/g, "").toLowerCase();
}

export function validateCanonicalEmailNormalizer(
  normalizer: (raw: string | null) => string | null,
  vectors: readonly { vector_id: string; raw: string | null; expected: string | null }[] = CANONICAL_EMAIL_VECTORS,
): void {
  for (const vector of vectors) {
    if (normalizer(vector.raw) !== vector.expected) fail(`canonical_email_normalizer_parity_mismatch:${vector.vector_id}`);
  }
}

function emailSqlLiteral(value: string | null): string {
  if (value === null) return "NULL::text";
  const escaped = value
    .replaceAll("\\", "\\\\")
    .replaceAll("'", "''")
    .replaceAll("\t", "\\t")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r");
  return `E'${escaped}'::text`;
}

export function canonicalEmailVectorSql(): string {
  const rows = ["users.email", "pending_registrations.email"].flatMap((surface) =>
    CANONICAL_EMAIL_VECTORS.map((vector) =>
      `('${surface}','${vector.vector_id}',${emailSqlLiteral(vector.raw)},${emailSqlLiteral(vector.expected)})`
    ),
  );
  return [
    "WITH email_vectors(surface, vector_id, raw_value, expected) AS (VALUES",
    `  ${rows.join(",\n  ")}`,
    ")",
    "SELECT 'email'::text AS normalization_kind, surface, vector_id,",
    "       lower(btrim(raw_value)) IS NOT DISTINCT FROM expected AS projection_equal",
    "FROM email_vectors ORDER BY surface, vector_id;",
  ].join("\n");
}

export function validateIdentityAnchorContract(manifestPath = "docs/database-manifest.yaml"): typeof IDENTITY_ANCHOR_DEFINITIONS {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const alterations = manifest.existing_table_alterations as Array<{ table: string; literal_sql_fragments: string[] }>;
  const manifestRules = manifest.sequence_15_rule_registry?.rules as Array<{
    exception_class: string; predicate_sql: string; rule_code: string; table: string;
  }>;
  if (!Array.isArray(alterations) || !Array.isArray(manifestRules)) fail();

  const expectedFragments: Record<string, string[]> = {
    users: [
      "user_uid uuid NOT NULL DEFAULT gen_random_uuid()", "user_uid_unique",
      "email_canonical text GENERATED ALWAYS AS (lower(btrim(email))) STORED",
      "email_canonical_nonblank", "email_canonical_unique", "phone_canonical_source_valid",
      "phone_canonical_format", "phone_canonical_unique",
    ],
    alumni_database: [
      "mobile_canonical_source_valid", "mobile_canonical_format", "mobile_canonical_unique",
      "matched_user_id_unique", "matched_user_id→users(id)", "ON DELETE NO ACTION ON UPDATE NO ACTION",
    ],
    pending_registrations: [
      "status", "text NOT NULL DEFAULT 'pending'", "status_domain",
      "email_canonical text GENERATED ALWAYS AS (lower(btrim(email))) STORED",
      "email_canonical_nonblank", "pending_kakao_id_unique", "pending_email_canonical_unique", "status='pending'",
    ],
  };
  for (const [table, fragments] of Object.entries(expectedFragments)) {
    const alteration = alterations.find((entry) => entry.table === table);
    if (!alteration || !includesAll(alteration.literal_sql_fragments, fragments)) fail();
  }

  for (const [predicateId, blockerCode] of Object.entries(IDENTITY_BLOCKER_CODES)) {
    const domainRule = DOMAIN_EXCEPTION_RULES.find((rule) => rule.predicate_id === predicateId);
    const manifestRule = manifestRules.find((rule) => rule.rule_code === predicateId);
    if (
      !domainRule || domainRule.exception_code !== blockerCode || domainRule.exception_class !== "pre_anchor_blocking" ||
      !manifestRule || manifestRule.exception_class !== "pre_anchor_blocking" || manifestRule.table !== domainRule.table ||
      manifestRule.predicate_sql !== domainRule.predicate_sql
    ) fail();
  }

  if (manifest.canonical_phone_sql !== canonicalPhoneSql("raw", manifestPath)) fail();
  return IDENTITY_ANCHOR_DEFINITIONS;
}

function blocker(predicateId: IdentityPredicateId, rowIds: number[]): IdentityBlocker {
  return {
    predicate_id: predicateId,
    blocker_code: IDENTITY_BLOCKER_CODES[predicateId],
    exception_class: "pre_anchor_blocking",
    row_ids: [...rowIds].sort((a, b) => a - b),
    terminal: true,
    sequence20_outcome: "block_before_ddl",
  };
}

function duplicateGroups<T>(rows: T[], value: (row: T) => string | number | null, id: (row: T) => number): number[][] {
  const grouped = new Map<string | number, number[]>();
  for (const row of rows) {
    const key = value(row);
    if (key === null) continue;
    const ids = grouped.get(key) ?? [];
    ids.push(id(row));
    grouped.set(key, ids);
  }
  return [...grouped.values()].filter((ids) => ids.length > 1).map((ids) => ids.sort((a, b) => a - b));
}

export function detectIdentityAnchorBlockers(state: IdentityFixture): IdentityBlocker[] {
  const blockers: IdentityBlocker[] = [];
  for (const row of state.users) {
    if (row.email !== null && canonicalEmail(row.email) === "") blockers.push(blocker("users.email_canonical_nonblank", [row.id]));
    if (row.phone_number !== null && row.phone_number.trim() !== "" && canonicalPhone(row.phone_number) === null) {
      blockers.push(blocker("users.phone_canonical_source_valid", [row.id]));
    }
  }
  for (const ids of duplicateGroups(state.users, (row) => canonicalEmail(row.email), (row) => row.id)) {
    blockers.push(blocker("users.email_canonical_unique", ids));
  }
  for (const ids of duplicateGroups(state.users, (row) => canonicalPhone(row.phone_number), (row) => row.id)) {
    blockers.push(blocker("users.phone_canonical_unique", ids));
  }
  for (const row of state.alumni_database) {
    if (row.mobile !== null && row.mobile.trim() !== "" && canonicalPhone(row.mobile) === null) {
      blockers.push(blocker("alumni_database.mobile_canonical_source_valid", [row.id]));
    }
  }
  for (const ids of duplicateGroups(state.alumni_database, (row) => canonicalPhone(row.mobile), (row) => row.id)) {
    blockers.push(blocker("alumni_database.mobile_canonical_unique", ids));
  }
  for (const ids of duplicateGroups(state.alumni_database, (row) => row.matched_user_id, (row) => row.id)) {
    blockers.push(blocker("alumni_database.matched_user_id_unique", ids));
  }
  for (const row of state.pending_registrations) {
    if (canonicalEmail(row.email) === "") blockers.push(blocker("pending_registrations.email_canonical_nonblank", [row.id]));
    if (row.status === null) blockers.push(blocker("pending_registrations.status_null", [row.id]));
    else if (!["pending", "approved", "rejected"].includes(row.status)) blockers.push(blocker("pending_registrations.status_domain", [row.id]));
  }
  const current = state.pending_registrations.filter((row) => row.status === "pending");
  for (const ids of duplicateGroups(current, (row) => row.kakao_id, (row) => row.id)) {
    blockers.push(blocker("pending_registrations.pending_kakao_id_unique", ids));
  }
  for (const ids of duplicateGroups(current, (row) => canonicalEmail(row.email), (row) => row.id)) {
    blockers.push(blocker("pending_registrations.pending_email_canonical_unique", ids));
  }
  return blockers.sort((a, b) => a.predicate_id.localeCompare(b.predicate_id) || a.row_ids[0] - b.row_ids[0]);
}

export function previewCurrentExactLinks(state: IdentityFixture) {
  const blockers = detectIdentityAnchorBlockers(state);
  if (blockers.length > 0) return { result: "blocked_pre_anchor", blockers, links: [] as ExactLink[], source_mutations: 0, rows_backfilled: 0 } as const;
  const userIds = new Set(state.users.map((user) => user.id));
  const links = state.alumni_database
    .filter((row) => row.matched_user_id !== null && userIds.has(row.matched_user_id))
    .map((row) => ({ alumni_record_id: row.id, user_id: row.matched_user_id!, source: "alumni_database.matched_user_id", fk_backed: true } as const))
    .sort((a, b) => a.alumni_record_id - b.alumni_record_id);
  return { result: "ready_for_todo_12_input", blockers, links, source_mutations: 0, rows_backfilled: 0 } as const;
}

export function assertReadOnlyGeneratedSql(sql: string): void {
  if (!/^BEGIN TRANSACTION READ ONLY;/.test(sql) || !/ROLLBACK;\n$/.test(sql)) fail("identity_preflight_transaction_boundary_mismatch");
  if (/^\s*(?:ALTER|CREATE|DROP|TRUNCATE|INSERT|UPDATE|DELETE|MERGE|GRANT|REVOKE)\b/im.test(sql)) {
    fail("identity_preflight_write_keyword_rejected");
  }
}

export function resolveTaskNineCommitSha(explicitCommitSha: string | undefined, readHead: () => string): string {
  if (explicitCommitSha !== undefined) {
    if (!/^[0-9a-f]{40}$/.test(explicitCommitSha)) fail("task_9_commit_sha_invalid");
    return explicitCommitSha;
  }
  const localHead = readHead();
  if (!/^[0-9a-f]{40}$/.test(localHead)) fail("task_9_commit_sha_invalid");
  return localHead;
}

export function requireExpectedIdentityBlockers(
  state: IdentityFixture,
  expectedCodes: readonly string[],
): IdentityBlocker[] {
  const blockers = detectIdentityAnchorBlockers(state);
  const observedCodes = [...new Set(blockers.map((entry) => entry.blocker_code))].sort();
  if (JSON.stringify(observedCodes) !== JSON.stringify([...expectedCodes])) fail("task_9_fixture_blocker_mismatch");
  return blockers;
}

export function developmentIdentityAnchorPreflightSql(): string {
  const phone = canonicalPhoneSql("phone_number");
  const mobile = canonicalPhoneSql("mobile");
  const blockerCte = [
    "WITH users_projected AS (",
    `  SELECT id, email, phone_number, lower(btrim(email)) AS email_canonical, ${phone} AS phone_canonical FROM users`,
    "), alumni_projected AS (",
    `  SELECT id, matched_user_id, mobile, ${mobile} AS mobile_canonical FROM alumni_database`,
    "), pending_projected AS (",
    "  SELECT id, kakao_id, email, status, lower(btrim(email)) AS email_canonical FROM pending_registrations",
    "), blockers AS (",
    "  SELECT 'users.email_canonical_nonblank'::text AS predicate_id, array_agg(id ORDER BY id)::integer[] AS row_ids FROM users_projected WHERE email IS NOT NULL AND btrim(email) = '' HAVING COUNT(*) > 0",
    "  UNION ALL SELECT 'users.email_canonical_unique', array_agg(id ORDER BY id)::integer[] FROM users_projected WHERE email_canonical IS NOT NULL GROUP BY email_canonical HAVING COUNT(*) > 1",
    "  UNION ALL SELECT 'users.phone_canonical_source_valid', array_agg(id ORDER BY id)::integer[] FROM users_projected WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '' AND phone_canonical IS NULL HAVING COUNT(*) > 0",
    "  UNION ALL SELECT 'users.phone_canonical_unique', array_agg(id ORDER BY id)::integer[] FROM users_projected WHERE phone_canonical IS NOT NULL GROUP BY phone_canonical HAVING COUNT(*) > 1",
    "  UNION ALL SELECT 'alumni_database.mobile_canonical_source_valid', array_agg(id ORDER BY id)::integer[] FROM alumni_projected WHERE mobile IS NOT NULL AND btrim(mobile) <> '' AND mobile_canonical IS NULL HAVING COUNT(*) > 0",
    "  UNION ALL SELECT 'alumni_database.mobile_canonical_unique', array_agg(id ORDER BY id)::integer[] FROM alumni_projected WHERE mobile_canonical IS NOT NULL GROUP BY mobile_canonical HAVING COUNT(*) > 1",
    "  UNION ALL SELECT 'alumni_database.matched_user_id_unique', array_agg(id ORDER BY id)::integer[] FROM alumni_projected WHERE matched_user_id IS NOT NULL GROUP BY matched_user_id HAVING COUNT(*) > 1",
    "  UNION ALL SELECT 'pending_registrations.email_canonical_nonblank', array_agg(id ORDER BY id)::integer[] FROM pending_projected WHERE btrim(email) = '' HAVING COUNT(*) > 0",
    "  UNION ALL SELECT 'pending_registrations.pending_kakao_id_unique', array_agg(id ORDER BY id)::integer[] FROM pending_projected WHERE status = 'pending' GROUP BY kakao_id HAVING COUNT(*) > 1",
    "  UNION ALL SELECT 'pending_registrations.pending_email_canonical_unique', array_agg(id ORDER BY id)::integer[] FROM pending_projected WHERE status = 'pending' GROUP BY email_canonical HAVING COUNT(*) > 1",
    "  UNION ALL SELECT 'pending_registrations.status_null', array_agg(id ORDER BY id)::integer[] FROM pending_projected WHERE status IS NULL HAVING COUNT(*) > 0",
    "  UNION ALL SELECT 'pending_registrations.status_domain', array_agg(id ORDER BY id)::integer[] FROM pending_projected WHERE status IS NOT NULL AND status NOT IN ('pending','approved','rejected') HAVING COUNT(*) > 0",
    ")",
  ];
  const sql = [
    "BEGIN TRANSACTION READ ONLY;",
    "SELECT current_database() AS current_database, current_user AS current_user, current_setting('transaction_read_only') AS transaction_read_only;",
    ...blockerCte,
    "SELECT predicate_id, 'pre_anchor_blocking'::text AS exception_class, row_ids, cardinality(row_ids)::integer AS conflict_count FROM blockers ORDER BY predicate_id, row_ids;",
    ...blockerCte,
    "SELECT alumni_database.id AS alumni_record_id, alumni_database.matched_user_id AS user_id,",
    "       'alumni_database.matched_user_id'::text AS link_source, true AS fk_backed",
    "FROM alumni_database JOIN users ON users.id = alumni_database.matched_user_id",
    "WHERE NOT EXISTS (SELECT 1 FROM blockers) ORDER BY alumni_database.id;",
    canonicalEmailVectorSql(),
    canonicalPhoneVectorSql(),
    "ROLLBACK;",
    "",
  ].join("\n");
  assertReadOnlyGeneratedSql(sql);
  return sql;
}
