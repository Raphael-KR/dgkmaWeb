import { readFileSync } from "node:fs";

export const PINNED_BASELINE_COMMIT = "0e299abce9509456de0e8bfe224cb7ef392228d8";

export type RelationshipBlockerCode =
  | "ALUMNI_MATCHED_USER_DUPLICATE"
  | "COMMUNITY_EVENT_LEGACY_OBITUARY_ORPHAN"
  | "PENDING_EMAIL_BLANK"
  | "PENDING_EMAIL_CANONICAL_DUPLICATE"
  | "PENDING_KAKAO_DUPLICATE";

export const RELATIONSHIP_PREFLIGHT_RULES = [
  {
    predicate_id: "alumni_database.matched_user_id_unique",
    blocker_code: "ALUMNI_MATCHED_USER_DUPLICATE",
    reason_code: "duplicate_nonnull_matched_user_id",
    table: "alumni_database",
    predicate_sql: "matched_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE duplicate.matched_user_id = alumni_database.matched_user_id AND duplicate.id <> alumni_database.id)",
  },
  {
    predicate_id: "community_events.legacy_obituary_fk",
    blocker_code: "COMMUNITY_EVENT_LEGACY_OBITUARY_ORPHAN",
    reason_code: "legacy_obituary_id_orphan",
    table: "community_events",
    predicate_sql: "legacy_obituary_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM obituaries WHERE obituaries.id = community_events.legacy_obituary_id)",
  },
  {
    predicate_id: "pending_registrations.email_canonical_nonblank",
    blocker_code: "PENDING_EMAIL_BLANK",
    reason_code: "blank_pending_email",
    table: "pending_registrations",
    predicate_sql: "btrim(email) = ''",
  },
  {
    predicate_id: "pending_registrations.pending_email_canonical_unique",
    blocker_code: "PENDING_EMAIL_CANONICAL_DUPLICATE",
    reason_code: "duplicate_pending_email_canonical",
    table: "pending_registrations",
    predicate_sql: "status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.email_canonical = pending_registrations.email_canonical AND duplicate.id <> pending_registrations.id)",
  },
  {
    predicate_id: "pending_registrations.pending_kakao_id_unique",
    blocker_code: "PENDING_KAKAO_DUPLICATE",
    reason_code: "duplicate_pending_kakao_id",
    table: "pending_registrations",
    predicate_sql: "status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.kakao_id = pending_registrations.kakao_id AND duplicate.id <> pending_registrations.id)",
  },
] as const;

export const RELATIONSHIP_CONSTRAINTS = [
  {
    rule_token: "matched_user_id_unique",
    table: "alumni_database",
    kind: "partial_unique",
    columns: ["matched_user_id"],
    predicate_sql: "matched_user_id IS NOT NULL",
    cardinality: "one_user_to_zero_or_one_alumni_row",
    supporting_index: "alumni_database__matched_user_id__idx",
    existing_foreign_key: {
      referenced_table: "users",
      referenced_columns: ["id"],
      on_delete: "NO ACTION",
      on_update: "NO ACTION",
    },
  },
  {
    rule_token: "legacy_obituary_fk",
    table: "community_events",
    kind: "foreign_key",
    columns: ["legacy_obituary_id"],
    nullable: true,
    referenced_table: "obituaries",
    referenced_columns: ["id"],
    on_delete: "SET NULL",
    on_update: "RESTRICT",
    supporting_index: "community_events_legacy_obituary_id_unique",
    support_source: "pinned_baseline_existing_unique",
  },
  {
    rule_token: "pending_kakao_id_unique",
    table: "pending_registrations",
    kind: "partial_unique",
    columns: ["kakao_id"],
    predicate_sql: "status='pending'",
    lifecycle_scope: "current_pending_only",
    supporting_index: "self",
  },
  {
    rule_token: "pending_email_canonical_unique",
    table: "pending_registrations",
    kind: "partial_unique",
    columns: ["email_canonical"],
    canonical_expression_sql: "lower(btrim(email))",
    predicate_sql: "status='pending'",
    lifecycle_scope: "current_pending_only",
    supporting_index: "self",
  },
] as const;

export const SEQUENCE_15_RELATIONSHIP_QUARANTINE = {
  target: "schema_data_exceptions",
  append_only: true,
  initial_status: "open",
  row_key: "sorted_source_primary_key_array",
  row_digest_required: true,
  raw_identity_in_receipt: false,
  source_rewrites: 0,
  automatic_merge: false,
  automatic_delete: false,
} as const;

export const SEQUENCE_20_RELATIONSHIP_RECHECK = {
  lock_tables: ["alumni_database", "community_events", "obituaries", "pending_registrations"],
  lock_mode: "SHARE ROW EXCLUSIVE",
  repeated_predicate_ids: RELATIONSHIP_PREFLIGHT_RULES.map((rule) => rule.predicate_id),
  clear_outcome: "create_constraints",
  conflict_outcome: "block_before_ddl",
  requires_zero_open_blockers: true,
  ddl_materialized_by_todo_7: false,
  ddl_applied_by_todo_7: false,
  source_rewrites: 0,
  automatic_merge: false,
  automatic_delete: false,
} as const;

type ManifestRule = {
  exception_class: string;
  predicate_sql: string;
  rule_code: string;
  table: string;
};

type ManifestAlteration = {
  table: string;
  literal_sql_fragments: string[];
};

function fail(): never {
  throw new Error("relationship_contract_mismatch");
}

function includesAll(haystack: readonly string[], needles: readonly string[]): boolean {
  return needles.every((needle) => haystack.includes(needle));
}

export function validateRelationshipContract(
  manifestPath = "docs/database-manifest.yaml",
  schemaPath = "shared/schema.ts",
  storagePath = "server/storage.ts",
): typeof RELATIONSHIP_CONSTRAINTS {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const rules = manifest.sequence_15_rule_registry?.rules as ManifestRule[] | undefined;
  const alterations = manifest.existing_table_alterations as ManifestAlteration[] | undefined;
  if (!Array.isArray(rules) || !Array.isArray(alterations)) fail();

  for (const expected of RELATIONSHIP_PREFLIGHT_RULES) {
    const actual = rules.find((rule) => rule.rule_code === expected.predicate_id);
    if (
      !actual || actual.table !== expected.table || actual.exception_class !== "pre_anchor_blocking" ||
      actual.predicate_sql !== expected.predicate_sql
    ) fail();
  }

  const expectedFragments: Record<string, string[]> = {
    alumni_database: [
      "matched_user_id_unique", "(matched_user_id)", "matched_user_id IS NOT NULL",
      "matched_user_id→users(id)", "ON DELETE NO ACTION ON UPDATE NO ACTION",
    ],
    community_events: [
      "legacy_obituary_id integer", "legacy_obituary_fk",
      "obituaries(id) ON DELETE SET NULL ON UPDATE RESTRICT",
    ],
    pending_registrations: [
      "email_canonical text GENERATED ALWAYS AS (lower(btrim(email))) STORED",
      "email_canonical_nonblank", "(btrim(email)<>'')",
      "pending_kakao_id_unique", "(kakao_id)", "status='pending'",
      "pending_email_canonical_unique", "(email_canonical)",
    ],
  };
  for (const [table, fragments] of Object.entries(expectedFragments)) {
    const alteration = alterations.find((entry) => entry.table === table);
    if (!alteration || !includesAll(alteration.literal_sql_fragments, fragments)) fail();
  }

  const indexes = manifest.indexes as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(indexes) || !indexes.some((index) =>
    index.table === "alumni_database" && index.name === "alumni_database__matched_user_id__idx" &&
    JSON.stringify(index.columns) === JSON.stringify(["matched_user_id"]) && index.method === "btree"
  )) fail();

  const alumniRegistryFk = (manifest.foreign_keys as Array<Record<string, unknown>> | undefined)?.find((foreignKey) =>
    foreignKey.table === "alumni_database" && JSON.stringify(foreignKey.columns) === JSON.stringify(["matched_user_id"])
  );
  if (!alumniRegistryFk || alumniRegistryFk.on_delete !== "NO ACTION" || alumniRegistryFk.on_update !== "NO ACTION") fail();

  const schema = readFileSync(schemaPath, "utf8");
  if (!/matchedUserId:\s*integer\("matched_user_id"\)\.references\(\(\) => users\.id\)/.test(schema)) fail();
  if (!/legacyObituaryId:\s*integer\("legacy_obituary_id"\)\.unique\(\)/.test(schema)) fail();
  if (!/status:\s*text\("status"\)\.default\("pending"\)/.test(schema)) fail();

  const storage = readFileSync(storagePath, "utf8");
  const start = storage.indexOf("async createOrRefreshPendingRegistration");
  const end = storage.indexOf("async rejectPendingRegistration", start);
  const lifecycle = start >= 0 && end > start ? storage.slice(start, end) : "";
  if (
    !lifecycle.includes("lockRegistrationIdentities") ||
    !lifecycle.includes('pendingRegistrations.status, "pending"') ||
    !lifecycle.includes("lower(${pendingRegistrations.email})")
  ) fail();
  return RELATIONSHIP_CONSTRAINTS;
}

export type RelationshipFixture = {
  users: Array<{ id: number }>;
  alumni_database: Array<{ id: number; matched_user_id: number | null }>;
  obituaries: Array<{ id: number }>;
  community_events: Array<Record<string, unknown> & { id: number; legacy_obituary_id: number | null }>;
  pending_registrations: Array<{
    id: number;
    kakao_id: string;
    email: string;
    status: "pending" | "approved" | "rejected" | null;
  }>;
};

export type RelationshipBlocker = {
  blocker_code: RelationshipBlockerCode;
  predicate_id: string;
  reason_code: string;
  row_ids: number[];
  sequence15_status: "open";
  sequence20_outcome: "block_before_ddl";
};

function duplicateGroups<T>(rows: readonly T[], keyOf: (row: T) => string | null, idOf: (row: T) => number): number[][] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const key = keyOf(row);
    if (key === null) continue;
    groups.set(key, [...(groups.get(key) ?? []), idOf(row)]);
  }
  return [...groups.values()].filter((ids) => ids.length > 1).map((ids) => ids.sort((a, b) => a - b));
}

function blocker(predicateId: string, rowIds: number[]): RelationshipBlocker {
  const rule = RELATIONSHIP_PREFLIGHT_RULES.find((entry) => entry.predicate_id === predicateId);
  if (!rule) fail();
  return {
    blocker_code: rule.blocker_code,
    predicate_id: rule.predicate_id,
    reason_code: rule.reason_code,
    row_ids: [...rowIds].sort((a, b) => a - b),
    sequence15_status: "open",
    sequence20_outcome: "block_before_ddl",
  };
}

export function detectRelationshipBlockers(state: RelationshipFixture): RelationshipBlocker[] {
  const pending = state.pending_registrations.filter((row) => row.status === "pending");
  const obituaryIds = new Set(state.obituaries.map((row) => row.id));
  const blockers: RelationshipBlocker[] = [];
  for (const ids of duplicateGroups(state.alumni_database, (row) => row.matched_user_id === null ? null : String(row.matched_user_id), (row) => row.id)) {
    blockers.push(blocker("alumni_database.matched_user_id_unique", ids));
  }
  for (const event of state.community_events) {
    if (event.legacy_obituary_id !== null && !obituaryIds.has(event.legacy_obituary_id)) {
      blockers.push(blocker("community_events.legacy_obituary_fk", [event.id]));
    }
  }
  for (const row of pending) {
    if (row.email.trim() === "") blockers.push(blocker("pending_registrations.email_canonical_nonblank", [row.id]));
  }
  for (const ids of duplicateGroups(pending, (row) => row.email.trim().toLowerCase(), (row) => row.id)) {
    blockers.push(blocker("pending_registrations.pending_email_canonical_unique", ids));
  }
  for (const ids of duplicateGroups(pending, (row) => row.kakao_id, (row) => row.id)) {
    blockers.push(blocker("pending_registrations.pending_kakao_id_unique", ids));
  }
  return blockers.sort((a, b) =>
    a.blocker_code.localeCompare(b.blocker_code) || a.row_ids[0] - b.row_ids[0]
  );
}

export function decideRelationshipSequence20(blockers: readonly RelationshipBlocker[]) {
  return {
    result: blockers.length === 0 ? "clear_for_todo_16_materialization" : "blocked_by_quarantine",
    locked_recheck_required: true,
    blocker_count: blockers.length,
    constraints_allowed: blockers.length === 0,
    source_rewrites: 0,
    automatic_merge: false,
    automatic_delete: false,
    ddl_materialized_by_todo_7: false,
    ddl_applied_by_todo_7: false,
  } as const;
}

export function applyLegacyObituaryDeleteFixture(state: RelationshipFixture, obituaryId: number): RelationshipFixture {
  return {
    ...state,
    users: state.users.map((row) => ({ ...row })),
    alumni_database: state.alumni_database.map((row) => ({ ...row })),
    obituaries: state.obituaries.filter((row) => row.id !== obituaryId).map((row) => ({ ...row })),
    community_events: state.community_events.map((event) => event.legacy_obituary_id === obituaryId
      ? { ...event, legacy_obituary_id: null }
      : { ...event }),
    pending_registrations: state.pending_registrations.map((row) => ({ ...row })),
  };
}

function relationshipBlockerQuery(): string {
  return [
    "WITH pending_projected AS (",
    "  SELECT pending_registrations.*, lower(btrim(email)) AS email_canonical FROM pending_registrations",
    "), blockers AS (",
    "  SELECT 'ALUMNI_MATCHED_USER_DUPLICATE'::text AS blocker_code, 'duplicate_nonnull_matched_user_id'::text AS reason_code, array_agg(id ORDER BY id)::integer[] AS row_ids",
    "  FROM alumni_database WHERE matched_user_id IS NOT NULL GROUP BY matched_user_id HAVING COUNT(*) > 1",
    "  UNION ALL",
    "  SELECT 'COMMUNITY_EVENT_LEGACY_OBITUARY_ORPHAN', 'legacy_obituary_id_orphan', ARRAY[community_events.id]::integer[]",
    "  FROM community_events WHERE legacy_obituary_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM obituaries WHERE obituaries.id = community_events.legacy_obituary_id)",
    "  UNION ALL",
    "  SELECT 'PENDING_EMAIL_BLANK', 'blank_pending_email', ARRAY[id]::integer[] FROM pending_projected WHERE status = 'pending' AND btrim(email) = ''",
    "  UNION ALL",
    "  SELECT 'PENDING_EMAIL_CANONICAL_DUPLICATE', 'duplicate_pending_email_canonical', array_agg(id ORDER BY id)::integer[]",
    "  FROM pending_projected WHERE status = 'pending' GROUP BY email_canonical HAVING COUNT(*) > 1",
    "  UNION ALL",
    "  SELECT 'PENDING_KAKAO_DUPLICATE', 'duplicate_pending_kakao_id', array_agg(id ORDER BY id)::integer[]",
    "  FROM pending_projected WHERE status = 'pending' GROUP BY kakao_id HAVING COUNT(*) > 1",
    ")",
    "SELECT blocker_code, reason_code, row_ids, cardinality(row_ids)::bigint AS group_size",
    "FROM blockers ORDER BY blocker_code, row_ids;",
  ].join("\n");
}

export function developmentRelationshipPreflightSql(): string {
  return [
    "BEGIN TRANSACTION READ ONLY;",
    "SELECT current_database() AS current_database, current_user AS current_user;",
    relationshipBlockerQuery(),
    "ROLLBACK;",
    "",
  ].join("\n");
}

export function sequence20RelationshipLockedRecheckSql(): string {
  return [
    "LOCK TABLE alumni_database, community_events, obituaries, pending_registrations IN SHARE ROW EXCLUSIVE MODE;",
    relationshipBlockerQuery(),
    "",
  ].join("\n");
}
