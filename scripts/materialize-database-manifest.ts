import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Column = {
  name: string;
  type: string;
  nullable: boolean;
  default_sql: string | null;
  generated_sql: string | null;
};

const PLAN_PATH = "docs/plans/database-architecture-audit.md";
const MANIFEST_PATH = "docs/database-manifest.yaml";
const EXPECTED_PLAN_SHA = "c35973735d8cc5632c2c2e67f154b1ad6c3ce521aa4a9de5350661821edd0252";
const SHA = /^[0-9a-f]{64}$/;

function sha256(bytes: string | Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalJson(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function digestVector(digestName: string, preimage: Record<string, Json>): Json {
  const canonicalPreimageJson = canonicalJson(preimage);
  const invalidEntries = Object.entries({ ...preimage, digest_version: null }).reverse();
  const negativePreimageJson = JSON.stringify(Object.fromEntries(invalidEntries));
  return {
    digest_name: digestName,
    canonical_preimage_json: canonicalPreimageJson,
    canonical_preimage_sha256: sha256(canonicalPreimageJson),
    negative_preimage_json: negativePreimageJson,
    negative_reason_codes: ["noncanonical_key_order", "null_contract_violation"],
  };
}

function utf8Prefix(value: string, byteLimit: number): string {
  let result = "";
  for (const character of value) {
    if (Buffer.byteLength(result + character, "utf8") > byteLimit) break;
    result += character;
  }
  return result;
}

function objectName(table: string, body: string, suffix: string): string {
  const full = `${table}__${body}__${suffix}`;
  return Buffer.byteLength(full, "utf8") <= 63
    ? full
    : `${utf8Prefix(full, 52)}_${sha256(full).slice(0, 10)}`;
}

function canonicalObjectName(full: string): string {
  return Buffer.byteLength(full, "utf8") <= 63
    ? full
    : `${utf8Prefix(full, 52)}_${sha256(full).slice(0, 10)}`;
}

function primaryKeyName(table: string): string {
  return canonicalObjectName(`${table}_pkey`);
}

function foreignKeyName(table: string, column: string): string {
  return canonicalObjectName(`${table}_${column}_fkey`);
}

function uniqueName(table: string, columns: string[]): string {
  return objectName(table, columns.join("_"), "key");
}

const actorColumns = (prefix: string, scopes: string[], correlation: boolean, optional: boolean): Column[] => [
  { name: `${prefix}_user_id`, type: "integer", nullable: true, default_sql: null, generated_sql: null },
  { name: `${prefix}_uid_snapshot`, type: "uuid", nullable: optional, default_sql: null, generated_sql: null },
  { name: `${prefix}_name_snapshot`, type: "text", nullable: optional, default_sql: null, generated_sql: null },
  { name: `${prefix}_scope`, type: "text", nullable: optional, default_sql: null, generated_sql: null },
  { name: `${prefix}_authorization_version`, type: "char(64)", nullable: optional, default_sql: null, generated_sql: null },
  { name: `${prefix}_at`, type: "timestamptz", nullable: optional, default_sql: null, generated_sql: null },
  ...(correlation
    ? [{ name: `${prefix}_correlation_uid`, type: "uuid", nullable: optional, default_sql: null, generated_sql: null }]
    : []),
];

function parseColumn(token: string, nullable: boolean): Column {
  const generated = token.match(/^([a-z][a-z0-9_]*)\s+(.+?)\s+GENERATED ALWAYS AS \((.+)\) STORED$/);
  if (generated) {
    return {
      name: generated[1],
      type: generated[2],
      nullable,
      default_sql: null,
      generated_sql: generated[3],
    };
  }
  const match = token.match(/^([a-z][a-z0-9_]*)\s+(.+)$/);
  if (!match) throw new Error(`manifest_untyped_column:${token}`);
  let typeAndDefault = match[2].replace(/\s+NOT NULL\b/, "");
  let defaultSql: string | null = null;
  const defaultMatch = typeAndDefault.match(/^(.+?)\s+DEFAULT\s+(.+)$/);
  if (defaultMatch) {
    typeAndDefault = defaultMatch[1];
    defaultSql = defaultMatch[2];
  }
  return {
    name: match[1],
    type: typeAndDefault,
    nullable: nullable && !/\bNOT NULL\b/.test(match[2]),
    default_sql: defaultSql,
    generated_sql: null,
  };
}

const defaultActorTables = new Set([
  "association_members",
  "member_match_cases",
  "member_match_candidates",
  "accounting_source_releases",
  "accounting_import_coordinates",
  "accounting_import_row_versions",
  "accounting_periods",
  "bank_accounts",
  "bank_transactions",
  "bank_reconciliation_items",
]);

function expandColumns(table: string, cell: string): { columns: Column[]; transitions: Json[]; scopes: string[] } {
  const columns: Column[] = [];
  const transitions: Json[] = [];
  const scopes: string[] = [];
  const matches = [...cell.matchAll(/`([^`]+)`/g)];
  const hasOptional = matches.some((match) => match[1].startsWith("OPTIONAL_ACTOR("));
  let previousEnd = 0;
  for (const match of matches) {
    const token = match[1];
    const prefixText = cell.slice(previousEnd, match.index);
    const nullable = /nullable\s*$/.test(prefixText);
    previousEnd = (match.index ?? 0) + match[0].length;
    const actor = token.match(/^ACTOR\(([^,]+),(.+)\)$/);
    const auditActor = token.match(/^AUDIT_ACTOR\(([^,]+),(.+)\)$/);
    const optionalActor = token.match(/^OPTIONAL_ACTOR\(([^,]+),([^,]+),(.+)\)$/);
    const chain = token.match(/^VCHAIN\(([^)]+)\)$/);
    if (actor) {
      const actorScopes = actor[2].split("|");
      columns.push(...actorColumns(actor[1], actorScopes, true, hasOptional));
      scopes.push(...actorScopes);
      transitions.push({ action_source: "base", actor_prefix: actor[1], predicate_sql: "root_or_declared_successor", scopes: actorScopes });
    } else if (auditActor) {
      const actorScopes = auditActor[2].split("|");
      columns.push(...actorColumns(auditActor[1], actorScopes, false, false));
      scopes.push(...actorScopes);
      transitions.push({ action_source: "audit_endpoint", actor_prefix: auditActor[1], predicate_sql: "matching_operation_result", scopes: actorScopes });
    } else if (optionalActor) {
      const actorScopes = optionalActor[2].split("|");
      columns.push(...actorColumns(optionalActor[1], actorScopes, true, true));
      scopes.push(...actorScopes);
      transitions.push({ action_source: "transition", actor_prefix: optionalActor[1], predicate_sql: optionalActor[3], scopes: actorScopes });
    } else if (chain) {
      columns.push(
        { name: "version", type: "integer", nullable: false, default_sql: null, generated_sql: null },
        { name: "effective_at", type: "timestamptz", nullable: false, default_sql: null, generated_sql: null },
        { name: "recorded_at", type: "timestamptz", nullable: false, default_sql: "clock_timestamp()", generated_sql: null },
        { name: "supersedes_id", type: "bigint", nullable: true, default_sql: null, generated_sql: null },
      );
      transitions.push({
        action_source: "insert_only_version_chain",
        scope_columns: chain[1].split(","),
        predicate_sql: "(version = 1 AND supersedes_id IS NULL) OR (version = parent.version + 1 AND supersedes_id = parent.id AND effective_at >= parent.effective_at AND recorded_at >= parent.recorded_at)",
      });
    } else {
      columns.push(parseColumn(token, nullable));
    }
  }
  if (defaultActorTables.has(table) && !columns.some((column) => column.name === "recorded_actor_user_id")) {
    columns.push(...actorColumns("recorded_actor", ["admin", "migration_admin"], true, hasOptional));
    scopes.push("admin", "migration_admin");
    transitions.push({ action_source: "base", actor_prefix: "recorded_actor", predicate_sql: "root_or_declared_successor", scopes: ["admin", "migration_admin"] });
  }
  if (table !== "business_operation_entities") {
    columns.unshift({ name: "id", type: "bigint", nullable: false, default_sql: "GENERATED ALWAYS AS IDENTITY", generated_sql: null });
  }
  const unique = new Map<string, Column>();
  for (const column of columns) {
    const prior = unique.get(column.name);
    if (prior && canonicalJson(prior) !== canonicalJson(column)) throw new Error(`manifest_column_conflict:${table}.${column.name}`);
    unique.set(column.name, column);
  }
  return { columns: [...unique.values()].sort((a, b) => a.name.localeCompare(b.name)), transitions, scopes: [...new Set(scopes)].sort() };
}

const lockClasses: Array<[number, string]> = [
  [10,"actor_user"],[15,"kakao_identity"],[20,"business_operation"],[23,"event_parse_rate_limit"],[24,"kakao_identity_termination"],[25,"session"],[26,"community_event"],[27,"post"],[28,"comment"],[29,"obituary"],[30,"schema_exception"],[35,"alumni_database"],[40,"pending_registration"],[50,"legacy_cutover"],[60,"legacy_payment"],[70,"legacy_decision"],[80,"logical_source"],[90,"source_account_mapping"],[100,"source_release"],[110,"import_batch"],[120,"import_coordinate"],[130,"import_row"],[135,"source_decision_set"],[136,"source_decision_item"],[140,"source_classification"],[145,"event_party"],[146,"event_party_alias"],[150,"association_member"],[160,"event_claim"],[170,"identity_link"],[180,"match_case"],[190,"match_candidate"],[200,"position_assignment"],[210,"dues_policy"],[220,"dues_mapping"],[230,"dues_tier"],[240,"pledge"],[250,"assessment"],[260,"rights_snapshot"],[270,"accounting_period"],[280,"bank_account"],[290,"bank_anchor"],[300,"candidate_day"],[310,"economic_event"],[320,"event_provenance"],[330,"authority_decision"],[340,"event_collision"],[350,"event_canonicalization"],[360,"bank_transaction"],[370,"transfer_match"],[380,"reconciliation"],[390,"reconciliation_item"],[400,"reconciliation_carryforward"],[410,"accounting_category"],[420,"cashbook_entry"],[430,"receipt"],[440,"receipt_reversal"],[450,"payment_group"],[460,"group_member"],[470,"original_allocation"],[480,"new_allocation"],[490,"audit_event"],
];

const logicalSources = [
  ["LEDGER_FINAL_2022_2025","73f14b07-62dc-5643-b56e-533d4415f5aa"],
  ["LEDGER_DUES_POLICY_2024_2025","256fcd87-840f-537d-8204-6a5f7ee3947e"],
  ["BANK_TOSS_2026","fabdbcad-1fee-500a-80dd-68405befcaea"],
  ["BANK_IBK_2026","cdcfb582-f1e9-5bf3-91d4-eb1b8271e7c6"],
  ["GROUP_FOREIGN_FACULTY_2025","26a45b1a-fc67-5b1e-aca4-6391dc296bf1"],
  ["MEMBERSHIP_OFFICER_WORKBOOK","2a03ff19-42e1-5ef3-b796-5e1d852cce5f"],
  ["AGM36_PERIOD_BOUNDARY","c620bd76-e7ee-5746-a523-5d1468039817"],
  ["NOTION_22ND_OFFICERS","90cf17e3-15e7-5d84-b328-10cdb643e4df"],
  ["NOTION_DUES_REGULATION_DRAFT","6dc3cdbe-11b4-538e-b703-ae48ddc6c7db"],
  ["LEGACY_PAYMENTS","6b3099c2-5015-5852-b5af-ab1787bda029"],
].map(([source_code, source_uid]) => ({ source_code, source_uid, default_sql: null, uniqueness: "global" }));

function parseActionMap(planLines: string[]): Json[] {
  const line = planLines.find((value) => value.startsWith("- The literal map is exhaustive:"));
  if (!line) throw new Error("manifest_action_map_missing");
  return [...line.matchAll(/`([a-z_]+)→([a-z_]+):([a-z_|]+)`/g)].map((match) => ({
    table: match[1],
    entity_type: match[2],
    actions: match[3].split("|"),
  }));
}

function main(): void {
  const planBytes = readFileSync(PLAN_PATH);
  if (sha256(planBytes) !== EXPECTED_PLAN_SHA) throw new Error("manifest_plan_sha256_mismatch");
  const planLines = planBytes.toString("utf8").split("\n");
  const additiveStart = planLines.indexOf("Additive alterations to existing tables:") + 1;
  const additiveEnd = planLines.findIndex((line) => line.startsWith("Every alteration rule token above")) + 1;
  const newTableStart = planLines.indexOf("New-table manifest:") + 1;
  const newTableEnd = planLines.findIndex((line) => line.startsWith("UUID ownership is closed")) + 1;
  if ([additiveStart, additiveEnd, newTableStart, newTableEnd].some((lineNo) => lineNo <= 0)) {
    throw new Error("manifest_plan_section_boundary_missing");
  }
  const tableRows = planLines
    .map((line, index) => ({ line, lineNo: index + 1 }))
    .map(({ line, lineNo }) => ({ match: line.match(/^\| `([^`]+)` \| (.*?) \| (.*) \|$/), line, lineNo }))
    .filter((row) => row.match && row.lineNo > newTableStart && row.lineNo < newTableEnd)
    .map((row) => {
      const match = row.match!;
      const expanded = expandColumns(match[1], match[2]);
      return {
        table: match[1],
        source_line: row.lineNo,
        contract_sha256: sha256(row.line),
        columns: expanded.columns,
        actor_scopes: expanded.scopes,
        transition_rules: expanded.transitions,
        catalog_contract_fragments: [...match[3].matchAll(/`([^`]+)`/g)]
          .map((fragment) => fragment[1])
          .filter((fragment) => !/\b(?:ACTOR|AUDIT_ACTOR|OPTIONAL_ACTOR|VCHAIN|CANONICAL_PHONE|DEFAULT_ACTOR)\b|<[a-z][a-z0-9_-]*>/.test(fragment)),
      };
    });
  if (tableRows.length !== 55) throw new Error(`manifest_table_count:${tableRows.length}`);

  const existingTableAlterations = planLines
    .map((line, index) => ({ line, lineNo: index + 1 }))
    .map(({ line, lineNo }) => ({ match: line.match(/^\| `([^`]+)` \| (.*) \|$/), line, lineNo }))
    .filter((row) => row.match && row.lineNo > additiveStart && row.lineNo < additiveEnd)
    .map((row) => ({
      table: row.match![1],
      source_line: row.lineNo,
      contract_sha256: sha256(row.line),
      literal_sql_fragments: [...row.match![2].matchAll(/`([^`]+)`/g)]
        .map((fragment) => fragment[1])
        .filter((fragment) => !/\b(?:ACTOR|AUDIT_ACTOR|OPTIONAL_ACTOR|VCHAIN|CANONICAL_PHONE|DEFAULT_ACTOR)\b|<[a-z][a-z0-9_-]*>/.test(fragment)),
    }));
  if (existingTableAlterations.length !== 13) throw new Error(`manifest_existing_table_count:${existingTableAlterations.length}`);

  const actionMap = parseActionMap(planLines);
  const actorClassOverrides: Record<string, string> = {
    association_members: "association_member",
    mutable_entity_action_history: "association_member",
    member_activity_events: "association_member",
    member_position_assignments: "position_assignment",
    dues_position_tier_mappings: "dues_mapping",
    member_dues_tier_history: "dues_tier",
    accounting_import_coordinates: "import_coordinate",
    accounting_import_row_versions: "import_row",
    accounting_import_batch_rows: "import_row",
    source_row_classification_decisions: "source_classification",
    economic_event_parties: "event_party",
    economic_event_party_aliases: "event_party_alias",
    economic_event_provenance: "event_provenance",
    economic_event_authority_decisions: "authority_decision",
    economic_event_canonicalizations: "event_canonicalization",
    accounting_periods: "accounting_period",
    bank_balance_anchors: "bank_anchor",
    bank_transfer_matches: "transfer_match",
    accounting_categories: "accounting_category",
    cashbook_entries: "cashbook_entry",
    dues_payment_groups: "payment_group",
    dues_allocations: "new_allocation",
    legacy_payment_decisions: "legacy_decision",
    schema_data_exceptions: "schema_exception",
    accounting_audit_events: "audit_event",
  };
  const rankByClass = new Map(lockClasses.map(([rank, lockClass]) => [lockClass, rank]));
  const entityByTable = new Map((actionMap as Array<{ table: string; entity_type: string }>).map((entry) => [entry.table, entry.entity_type]));
  const actorUserFks = tableRows.flatMap((table) =>
    table.columns
      .filter((column) => column.name.endsWith("_user_id") && /actor_user_id$/.test(column.name))
      .map((column) => {
        const lockClass = actorClassOverrides[table.table] ?? entityByTable.get(table.table) ?? "business_operation";
        const rank = rankByClass.get(lockClass);
        if (rank === undefined) throw new Error(`manifest_actor_fk_lock_class_missing:${table.table}.${column.name}`);
        return {
        table: table.table,
        column: column.name,
        on_delete: "SET NULL",
        on_update: "RESTRICT",
        class: lockClass,
        rank,
        key_projection: ["id"],
        mechanical_or_explicit: "mechanical",
      }}),
  );
  const existingUserFks = [
    ["posts","author_id","SET NULL","RESTRICT","post",27,"explicit"],
    ["comments","author_id","SET NULL","RESTRICT","comment",28,"explicit"],
    ["obituaries","author_id","SET NULL","RESTRICT","obituary",29,"explicit"],
    ["community_events","author_id","SET NULL","RESTRICT","community_event",26,"explicit"],
    ["payments","user_id","SET NULL","RESTRICT","legacy_payment",60,"explicit"],
    ["alumni_database","matched_user_id","NO ACTION","NO ACTION","alumni_database",35,"explicit"],
    ["event_parse_rate_limits","user_id","CASCADE","RESTRICT","event_parse_rate_limit",23,"explicit"],
    ["association_members","user_id","SET NULL","RESTRICT","association_member",150,"explicit"],
    ["business_operation_receipts","actor_target_user_id","SET NULL","RESTRICT","business_operation",20,"mechanical"],
  ].map(([table,column,on_delete,on_update,lockClass,rank,mode]) => ({ table, column, on_delete, on_update, class: lockClass, rank, key_projection: ["id"], mechanical_or_explicit: mode }));

  const relationshipTargets: Record<string, string> = {
    release_run_id: "schema_release_runs",
    capability_receipt_id: "schema_capability_receipts",
    association_member_id: "association_members",
    accounting_period_id: "accounting_periods",
    mutation_history_id: "mutable_entity_action_history",
    member_id: "association_members",
    alumni_record_id: "alumni_database",
    source_row_version_id: "accounting_import_row_versions",
    boundary_source_row_version_id: "accounting_import_row_versions",
    boundary_evidence_row_version_id: "accounting_import_row_versions",
    row_version_id: "accounting_import_row_versions",
    decision_item_id: "source_decision_items",
    member_match_decision_item_id: "source_decision_items",
    logical_source_id: "accounting_logical_sources",
    source_logical_id: "accounting_logical_sources",
    source_release_id: "accounting_source_releases",
    coordinate_id: "accounting_import_coordinates",
    batch_id: "accounting_import_batches",
    preview_batch_id: "accounting_import_batches",
    roster_batch_id: "accounting_import_batches",
    decision_set_id: "source_decision_sets",
    party_id: "economic_event_parties",
    event_party_id: "economic_event_parties",
    root_case_id: "member_match_cases",
    match_case_id: "member_match_cases",
    member_match_case_id: "member_match_cases",
    match_candidate_id: "member_match_candidates",
    member_match_candidate_id: "member_match_candidates",
    policy_id: "dues_policies",
    mapping_id: "dues_position_tier_mappings",
    basis_assignment_id: "member_position_assignments",
    tier_history_id: "member_dues_tier_history",
    pledge_id: "dues_pledges",
    assessment_id: "member_assessments",
    event_id: "economic_events",
    candidate_event_id: "economic_events",
    created_event_id: "economic_events",
    canonical_event_id: "economic_events",
    duplicate_event_id: "economic_events",
    reverses_event_id: "economic_events",
    refund_event_id: "economic_events",
    funding_event_id: "economic_events",
    lower_event_id: "economic_events",
    higher_event_id: "economic_events",
    selected_provenance_id: "economic_event_provenance",
    legacy_payment_id: "payments",
    legacy_decision_id: "legacy_payment_decisions",
    period_id: "accounting_periods",
    target_period_id: "accounting_periods",
    account_id: "bank_accounts",
    target_account_id: "bank_accounts",
    anchor_id: "bank_balance_anchors",
    ending_transaction_id: "bank_transactions",
    debit_transaction_id: "bank_transactions",
    credit_transaction_id: "bank_transactions",
    bank_transaction_id: "bank_transactions",
    resolved_by_transaction_id: "bank_transactions",
    category_id: "accounting_categories",
    corrects_entry_id: "cashbook_entries",
    receipt_id: "dues_receipts",
    refund_receipt_id: "dues_receipts",
    receipt_reversal_id: "dues_receipt_reversals",
    group_id: "dues_payment_groups",
    group_member_id: "dues_group_members",
    reverses_allocation_id: "dues_allocations",
    supersedes_reconciliation_id: "bank_reconciliations",
    reconciliation_id: "bank_reconciliations",
    to_reconciliation_id: "bank_reconciliations",
    from_item_id: "bank_reconciliation_items",
    canonicalization_id: "economic_event_canonicalizations",
  };
  const foreignKeys: Json[] = [];
  for (const table of tableRows) {
    for (const column of table.columns) {
      let targetTable: string | undefined;
      let onDelete = "RESTRICT";
      if (/actor_user_id$/.test(column.name)) {
        targetTable = "users";
        onDelete = "SET NULL";
      } else if (table.table === "association_members" && column.name === "user_id") {
        targetTable = "users";
        onDelete = "SET NULL";
      } else if (table.table === "business_operation_receipts" && ["actor_user_id","actor_target_user_id"].includes(column.name)) {
        targetTable = "users";
        onDelete = "SET NULL";
      } else if (column.name === "supersedes_id") {
        targetTable = table.table;
      } else if (table.table === "business_operation_entities" && column.name === "operation_uid") {
        targetTable = "business_operation_receipts";
      } else {
        targetTable = relationshipTargets[column.name];
      }
      if (!targetTable || /_snapshot$/.test(column.name)) continue;
      foreignKeys.push({
        name: foreignKeyName(table.table, column.name),
        table: table.table,
        columns: [column.name],
        referenced_table: targetTable,
        referenced_columns: [table.table === "business_operation_entities" && column.name === "operation_uid" ? "operation_uid" : "id"],
        on_delete: onDelete,
        on_update: "RESTRICT",
      });
    }
  }
  for (const entry of existingUserFks) {
    if (foreignKeys.some((foreignKey: any) => foreignKey.table === entry.table && foreignKey.columns[0] === entry.column)) continue;
    foreignKeys.push({
      name: foreignKeyName(entry.table as string, entry.column as string),
      table: entry.table,
      columns: [entry.column],
      referenced_table: "users",
      referenced_columns: ["id"],
      on_delete: entry.on_delete,
      on_update: entry.on_update,
    });
  }
  foreignKeys.push({ name: foreignKeyName("pending_registrations", "pii_redaction_operation_uid"), table: "pending_registrations", columns: ["pii_redaction_operation_uid"], referenced_table: "business_operation_receipts", referenced_columns: ["operation_uid"], on_delete: "RESTRICT", on_update: "RESTRICT" });
  const indexes = new Map<string, Json>();
  for (const fk of foreignKeys as Array<any>) {
    const name = objectName(fk.table, fk.columns.join("_"), "idx");
    indexes.set(`${fk.table}:${fk.columns.join(",")}`, { name, table: fk.table, columns: fk.columns, method: "btree", predicate_sql: null, purpose: "foreign_key_left_prefix" });
  }
  for (const entry of [
    ["posts",["category_id"]],["posts",["author_id"]],["comments",["post_id"]],["comments",["author_id"]],
    ["payments",["user_id"]],["obituaries",["author_id"]],["community_events",["author_id"]],
    ["pending_registrations",["created_at","id"]],["kakao_oauth_states",["expires_at","state_hash"]],
    ["kakao_identity_terminations",["terminated_at","identity_hash"]],["session",["expire","sid"]],
  ] as Array<[string,string[]]>) {
    indexes.set(`${entry[0]}:${entry[1].join(",")}`, { name: objectName(entry[0], entry[1].join("_"), "idx"), table: entry[0], columns: entry[1], method: "btree", predicate_sql: null, purpose: "existing_table_contract" });
  }
  const checks: Json[] = [];
  for (const table of tableRows) {
    for (const transition of table.transition_rules as Array<any>) {
      if (transition.actor_prefix) {
        const prefix = transition.actor_prefix;
        checks.push({ name: objectName(table.table, `${prefix}_scope`, "check"), table: table.table, rule: `${prefix}_scope`, expression_sql: `${prefix}_scope IS NULL OR ${prefix}_scope IN (${transition.scopes.map((scope: string) => `'${scope}'`).join(",")})` });
        checks.push({ name: objectName(table.table, `${prefix}_authorization_version`, "check"), table: table.table, rule: `${prefix}_authorization_version`, expression_sql: `${prefix}_authorization_version IS NULL OR ${prefix}_authorization_version ~ '^[0-9a-f]{64}$'` });
        if (transition.action_source === "transition") {
          checks.push({ name: objectName(table.table, `${prefix}_completeness`, "check"), table: table.table, rule: `${prefix}_completeness`, expression_sql: `(${prefix}_correlation_uid IS NULL AND ${prefix}_uid_snapshot IS NULL AND ${prefix}_name_snapshot IS NULL AND ${prefix}_scope IS NULL AND ${prefix}_authorization_version IS NULL AND ${prefix}_at IS NULL) OR (${prefix}_correlation_uid IS NOT NULL AND ${prefix}_uid_snapshot IS NOT NULL AND ${prefix}_name_snapshot IS NOT NULL AND ${prefix}_scope IS NOT NULL AND ${prefix}_authorization_version IS NOT NULL AND ${prefix}_at IS NOT NULL)` });
        }
      }
      if (transition.action_source === "insert_only_version_chain") {
        checks.push({ name: objectName(table.table, "version", "check"), table: table.table, rule: "version", expression_sql: "version >= 1" });
      }
    }
  }
  for (const alteration of existingTableAlterations) {
    const fragments = alteration.literal_sql_fragments;
    for (let index = 0; index < fragments.length - 1; index += 1) {
      const rule = fragments[index];
      const expression = fragments[index + 1];
      if (!/^[a-z][a-z0-9_]+$/.test(rule) || /(?:_unique|_fk|_fk_support)$/.test(rule) || !expression.startsWith("(")) continue;
      checks.push({
        name: objectName(alteration.table, rule, "check"), table: alteration.table, rule,
        expression_sql: expression.replace(/\s+NOT VALID$/, ""),
        validation_state: /\s+NOT VALID$/.test(expression) ? "not_valid_until_sequence_65" : "validated_at_sequence_20",
      });
    }
  }
  checks.push(
    { name: objectName("business_operation_receipts", "canonical_payload", "check"), table: "business_operation_receipts", rule: "canonical_payload", expression_sql: "jsonb_typeof(canonical_payload) = 'object' AND canonical_payload->>'schema_version' = 'business-operation-payload-v2' AND payload_sha256 ~ '^[0-9a-f]{64}$' AND jsonb_typeof(canonical_payload->'expected_results') = 'array' AND jsonb_typeof(canonical_payload->'reservation_slots') = 'array'" },
    { name: objectName("member_position_assignments", "override_reason", "check"), table: "member_position_assignments", rule: "override_reason", expression_sql: "override_reason IS NULL OR override_reason = 'OWNER_APPROVED_21ST_TERM_TO_AGM36_CLOSE'" },
    { name: objectName("dues_allocations", "correction_reason_code", "check"), table: "dues_allocations", rule: "correction_reason_code", expression_sql: "(correction_reason_code IS NULL AND rights_effect_mode IN ('immediate_positive','next_month_negative')) OR (correction_reason_code IN ('source_error','false_transaction') AND rights_effect_mode = 'retroactive_error')" },
  );
  const ranges: Json[] = [];
  for (const table of tableRows) {
    const columnNames = new Set(table.columns.map((column) => column.name));
    for (const [from, to, type] of [["effective_from","effective_to","timestamptz"],["active_from","active_to","date"],["valid_from","valid_to","date"],["obligation_from","obligation_to","date"],["coverage_from","coverage_through","timestamptz"]]) {
      if (columnNames.has(from) && columnNames.has(to)) ranges.push({ table: table.table, from_column: from, to_column: to, bounds: "[)", type, check_sql: `${to} IS NULL OR ${from} < ${to}` });
    }
  }
  const primaryKeys = tableRows.map((table) => ({ name: primaryKeyName(table.table), table: table.table, columns: table.table === "business_operation_entities" ? ["operation_uid","ordinal"] : ["id"] }));
  const uniqueConstraints = new Map<string, Json>();
  const addUnique = (table: string, columns: string[], predicateSql: string | null, source: string): void => {
    const normalizedColumns = columns.map((column) => column.trim()).filter(Boolean);
    const key = `${table}:${normalizedColumns.join(",")}:${predicateSql ?? ""}`;
    uniqueConstraints.set(key, { name: uniqueName(table, normalizedColumns), table, columns: normalizedColumns, predicate_sql: predicateSql, source });
  };
  for (const table of tableRows) {
    const contract = planLines[table.source_line - 1].match(/^\| `[^`]+` \| .*? \| (.*) \|$/)?.[1] ?? "";
    for (const match of contract.matchAll(/(?:partial\s+)?UNIQUE\s+`([^`]+)`/gi)) {
      const token = match[1];
      const composite = token.match(/^\(([^)]+)\)(?:\s+WHERE\s+(.+))?$/i);
      const scalar = token.match(/^([a-z][a-z0-9_]*)(?:\s+WHERE\s+(.+))?$/i);
      if (composite) addUnique(table.table, composite[1].split(","), composite[2] ?? null, "literal_table_contract");
      else if (scalar) addUnique(table.table, [scalar[1]], scalar[2] ?? null, "literal_table_contract");
    }
    const chain = (table.transition_rules as Array<any>).find((transition) => transition.action_source === "insert_only_version_chain");
    if (chain) {
      addUnique(table.table, [...chain.scope_columns, "version"], null, "vchain_expansion");
      addUnique(table.table, ["supersedes_id"], "supersedes_id IS NOT NULL", "vchain_expansion");
    }
  }
  for (const [table, columns] of Object.entries({
    schema_release_runs: [["release_uid"]],
    business_operation_receipts: [["operation_uid"],["root_correlation_uid"]],
    business_operation_entities: [["action_correlation_uid"]],
    association_members: [["member_uid"]],
    accounting_logical_sources: [["source_uid"],["source_code"]],
    accounting_source_releases: [["release_uid"]],
    accounting_import_batches: [["batch_uid"]],
    source_decision_sets: [["decision_set_uid"]],
    economic_event_parties: [["party_uid"]],
    economic_events: [["event_uid"]],
    accounting_periods: [["period_code"]],
    bank_accounts: [["account_uid"],["account_code"]],
    dues_receipts: [["receipt_uid"]],
    dues_allocations: [["request_uid"]],
    bank_reconciliations: [["reconciliation_uid"]],
    accounting_audit_events: [["event_uid"],["correlation_uid"]],
  } as Record<string, string[][]>)) {
    for (const keyColumns of columns) addUnique(table, keyColumns, null, "literal_prose_identity");
  }
  for (const [table, columns, predicate] of [
    ["mutable_entity_action_history",["accounting_period_id","mutation_no"],"accounting_period_id IS NOT NULL"],
    ["member_activity_events",["mutation_history_id"],"mutation_history_id IS NOT NULL"],
    ["association_members",["user_id"],"user_id IS NOT NULL"],
    ["association_members",["alumni_record_id"],"alumni_record_id IS NOT NULL"],
    ["accounting_import_row_versions",["supersedes_id"],"supersedes_id IS NOT NULL"],
    ["bank_transactions",["event_id"],null],
    ["bank_transactions",["source_row_version_id"],null],
    ["legacy_payment_decisions",["decision_key"],null],
    ["legacy_cutover_states",["cutover_code"],null],
  ] as Array<[string,string[],string | null]>) addUnique(table, columns, predicate, "literal_prose_identity");

  const canonicalPhone = "CASE WHEN raw IS NULL OR btrim(raw)='' THEN NULL WHEN regexp_replace(coalesce(raw,''),'[^0-9]','','g') ~ '^8210[0-9]{8}$' THEN '0'||substring(regexp_replace(coalesce(raw,''),'[^0-9]','','g') from 3) WHEN regexp_replace(coalesce(raw,''),'[^0-9]','','g') ~ '^10[0-9]{8}$' THEN '0'||regexp_replace(coalesce(raw,''),'[^0-9]','','g') WHEN regexp_replace(coalesce(raw,''),'[^0-9]','','g') ~ '^0[0-9]{9,10}$' THEN regexp_replace(coalesce(raw,''),'[^0-9]','','g') ELSE NULL END";
  const contractLines = planLines.slice(61, 575).map((line, index) => ({ line_no: index + 62, sha256: sha256(line) }));
  const manifest: Json = {
    schema_version: "dgkma-database-manifest-v1",
    architecture_plan_sha256: EXPECTED_PLAN_SHA,
    manifest_contract: {
      deterministic_serialization: "RFC8785_JSON_AS_YAML_1_2_PLUS_LF",
      source_contract_line_digests: contractLines,
      source_contract_line_count: contractLines.length,
    },
    object_name_contract: { max_utf8_bytes: 63, long_prefix_utf8_bytes: 52, hash_suffix_hex_bytes: 10, examples: { index: objectName("this_table_name_is_long_enough_for_postgresql_object_name", "first_column_second_column", "idx") } },
    canonical_phone_sql: canonicalPhone,
    primary_keys: primaryKeys,
    unique_constraints: [...uniqueConstraints.values()].sort((a: any, b: any) => `${a.table}.${a.name}.${a.predicate_sql ?? ""}`.localeCompare(`${b.table}.${b.name}.${b.predicate_sql ?? ""}`)),
    foreign_keys: foreignKeys,
    indexes: [...indexes.values()].sort((a: any, b: any) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`)),
    checks: checks.sort((a: any, b: any) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`)),
    digest_test_vectors: [
      digestVector("bank_transactions.row_fingerprint", {
        digest_version: "bank-row-v1", account_code: "TOSS_OFFICER_2026", provider_row_id: "row-0001",
        source_content_digest: "1".repeat(64), posted_date: "2026-01-02", occurred_at: "2026-01-02T01:02:03+09:00",
        direction: "credit", amount: "30000", balance_after: "1030000",
      }),
      digestVector("dues_payment_groups.snapshot_digest", {
        digest_version: "group-snapshot-v1", receipt_uid: "00000000-0000-4000-8000-000000000001",
        roster_batch_uid: "00000000-0000-4000-8000-000000000002",
        children: [{ ordinal: 1, source_content_digest: "2".repeat(64), member_uid_or_null: null, match_case_uid_or_null: "00000000-0000-4000-8000-000000000003", proposed_amount: "30000" }],
      }),
      digestVector("legacy_payment_decisions.decision_key", {
        digest_version: "legacy-decision-v1", payment_id: 101, source_content_digest: "3".repeat(64), decision: "eligible",
        member_uid_or_null: "00000000-0000-4000-8000-000000000004", candidate_event_uid_or_null: null,
        created_event_uid_or_null: "00000000-0000-4000-8000-000000000005", reason_code: "LEGACY_VALID",
        timezone_snapshot: "Asia/Seoul",
      }),
      digestVector("member_dues_tier_history.derivation_digest", {
        digest_version: "tier-derivation-v1", member_uid: "00000000-0000-4000-8000-000000000006", dues_year: 2026,
        effective_at: "2026-01-01T00:00:00+09:00",
        candidates: [{ candidate_kind: "member_baseline", assignment_uid_or_null: null, assignment_version_or_null: null, mapping_id: 11, mapping_version: 1, priority: 10, tier_code: "REGULAR", policy_id: 21, policy_version: 1 }],
        selected: { candidate_kind: "member_baseline", assignment_uid_or_null: null, assignment_version_or_null: null, mapping_id: 11, tier_code: "REGULAR", policy_id: 21, priority: 10 },
      }),
      digestVector("dues_pledges.derivation_digest", {
        digest_version: "pledge-v1", member_uid: "00000000-0000-4000-8000-000000000007", effective_from: "2026-01-01",
        origin_kind: "policy_default", monthly_amount: "30000", policy_id: 21, policy_version: 1, mapping_id: 11,
        mapping_version: 1, tier_history_id: 31, tier_history_version: 1,
      }),
      digestVector("dues_status_snapshots.pledge_derivation_digest", {
        digest_version: "pledge-status-v1",
        months: [{ month: 1, pledge_id: 41, version: 1, amount: "30000" }, { month: 2, pledge_id: 41, version: 1, amount: "30000" }],
      }),
      digestVector("dues_status_snapshots.assessment_derivation_digest", {
        digest_version: "assessment-status-v1", member_uid: "00000000-0000-4000-8000-000000000008", dues_year: 2026,
        evaluation_date: "2026-02-28",
        chains: [{ assessment_uid: "00000000-0000-4000-8000-000000000009", published_version: 1, amount: "100000", due_date: "2026-02-15", rights_effect: "required", allocations: [{ allocation_id: 51, effect_kind: "payment", rights_effect_mode: "immediate_positive", amount: "100000", effective_at: "2026-02-10T09:00:00+09:00" }] }],
      }),
    ],
    ranges: ranges.sort((a: any, b: any) => `${a.table}.${a.from_column}`.localeCompare(`${b.table}.${b.from_column}`)),
    existing_table_alterations: existingTableAlterations,
    tables: tableRows,
    logical_source_uuid_registry: logicalSources,
    actor_action_registry: actionMap,
    lock_class_registry: lockClasses.map(([rank, lock_class]) => ({ rank, lock_class })),
    kakao_identity_lock: {
      rank: 15,
      class: "kakao_identity",
      digest_preimage: "HMAC-SHA256(ACCOUNTING_PII_HMAC_KEY_V1, 'kakao-identity-lock-v1\\n' || NFC(kakao_id))",
      row_selection_sql: "pending_registrations.kakao_id = locked_target_kakao_id",
      routes: ["pending_create","pending_approve","pending_reject","pending_redact","pending_delete","account_delete","termination_insert","termination_check"],
    },
    account_delete_user_fk_registry: [...existingUserFks, ...actorUserFks].sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`)),
    account_delete_non_fk_registry: [
      { table: "kakao_identity_terminations", column_or_identity: "identity_hash", rank: 24, action: "prospective_insert", key_projection: ["identity_hash"] },
      { table: "session", column_or_identity: "sid", rank: 25, action: "explicit_delete", key_projection: ["sid_digest"] },
      { table: "pending_registrations", column_or_identity: "kakao_id", rank: 40, action: "explicit_delete", key_projection: ["pending_id","kakao_id_digest"] },
    ],
    sequence_15_rule_registry: {
      classes: ["pre_anchor_blocking","legacy_not_valid"],
      rules: [
        ["users.email_canonical_nonblank","pre_anchor_blocking","users","email IS NOT NULL AND btrim(email) = ''"],
        ["users.email_canonical_unique","pre_anchor_blocking","users","email_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users duplicate WHERE duplicate.email_canonical = users.email_canonical AND duplicate.id <> users.id)"],
        ["users.phone_canonical_source_valid","pre_anchor_blocking","users","phone_number IS NOT NULL AND btrim(phone_number) <> '' AND phone_canonical IS NULL"],
        ["users.phone_canonical_unique","pre_anchor_blocking","users","phone_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users duplicate WHERE duplicate.phone_canonical = users.phone_canonical AND duplicate.id <> users.id)"],
        ["users.birthday_type_domain","pre_anchor_blocking","users","birthday_type IS NOT NULL AND birthday_type NOT IN ('SOLAR','LUNAR')"],
        ["categories.badge_variant_domain","pre_anchor_blocking","categories","badge_variant NOT IN ('default','secondary','destructive','outline')"],
        ["categories.sort_order_nonnegative","pre_anchor_blocking","categories","sort_order < 0"],
        ["alumni_database.mobile_canonical_source_valid","pre_anchor_blocking","alumni_database","mobile IS NOT NULL AND btrim(mobile) <> '' AND mobile_canonical IS NULL"],
        ["alumni_database.mobile_canonical_unique","pre_anchor_blocking","alumni_database","mobile_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE duplicate.mobile_canonical = alumni_database.mobile_canonical AND duplicate.id <> alumni_database.id)"],
        ["alumni_database.matched_user_id_unique","pre_anchor_blocking","alumni_database","matched_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE duplicate.matched_user_id = alumni_database.matched_user_id AND duplicate.id <> alumni_database.id)"],
        ["community_events.legacy_obituary_fk","pre_anchor_blocking","community_events","legacy_obituary_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM obituaries WHERE obituaries.id = community_events.legacy_obituary_id)"],
        ["community_events.event_type_domain","pre_anchor_blocking","community_events","event_type NOT IN ('obituary','wedding','opening','other')"],
        ["community_events.status_domain","pre_anchor_blocking","community_events","status NOT IN ('draft','published')"],
        ["event_parse_rate_limits.request_count_nonnegative","pre_anchor_blocking","event_parse_rate_limits","request_count < 0"],
        ["event_parse_rate_limits.updated_after_window_start","pre_anchor_blocking","event_parse_rate_limits","updated_at < window_started_at"],
        ["pending_registrations.email_canonical_nonblank","pre_anchor_blocking","pending_registrations","btrim(email) = ''"],
        ["pending_registrations.pending_kakao_id_unique","pre_anchor_blocking","pending_registrations","status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.kakao_id = pending_registrations.kakao_id AND duplicate.id <> pending_registrations.id)"],
        ["pending_registrations.pending_email_canonical_unique","pre_anchor_blocking","pending_registrations","status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.email_canonical = pending_registrations.email_canonical AND duplicate.id <> pending_registrations.id)"],
        ["pending_registrations.status_null","pre_anchor_blocking","pending_registrations","status IS NULL"],
        ["pending_registrations.status_domain","pre_anchor_blocking","pending_registrations","status IS NOT NULL AND status NOT IN ('pending','approved','rejected')"],
        ["kakao_oauth_states.expiry_after_start","pre_anchor_blocking","kakao_oauth_states","expires_at <= started_at"],
        ["payments.amount_positive","legacy_not_valid","payments","amount <= 0"],
        ["payments.year_domain","legacy_not_valid","payments","year NOT BETWEEN 2024 AND 2100"],
        ["payments.type_domain","legacy_not_valid","payments","type NOT IN ('연회비','기타')"],
        ["payments.status_domain","legacy_not_valid","payments","status NOT IN ('pending','completed','failed')"],
      ].map(([rule_code,exception_class,table,predicate_sql]) => ({ rule_code, exception_class, table, predicate_sql })),
      resolution_branches: [
        { parent_status: "open", new_status: "resolved", actor_prefix: "resolved_actor", action: "resolve" },
        { parent_status: "open", new_status: "waived", actor_prefix: "waive_actor", action: "waive" },
      ],
      actorless_root: { version: 1, status: "open", action_count: 0, audit_count: 0 },
    },
    round_38_closure: {
      receipt_payload: { column: "canonical_payload", type: "jsonb", nullable: false, schema_version: "business-operation-payload-v2", hash_column: "payload_sha256", result_column: "result_entity_keys", slot_field: "reservation_slots" },
      receipt_catalog_invariants: {
        canonical_payload_check: "jsonb_typeof(canonical_payload) = 'object' AND canonical_payload->>'schema_version' = 'business-operation-payload-v2' AND payload_sha256 ~ '^[0-9a-f]{64}$' AND jsonb_typeof(canonical_payload->'expected_results') = 'array' AND jsonb_typeof(canonical_payload->'reservation_slots') = 'array'",
        payload_hash_equality: "payload_sha256 = sha256(RFC8785(canonical_payload))",
        result_equality: "RFC8785(canonical_payload.expected_results) = RFC8785(result_entity_keys) = RFC8785(ordered business_operation_entities)",
        reservation_slot_fields: ["phase","result_ordinal","slot_kind","slot_kind_order","qualified_table_name","local_ordinal","reserved_id"],
        reservation_slot_sort: ["phase","result_ordinal","slot_kind_order","qualified_table_name","local_ordinal"],
      },
      nullable_correction_code_columns: [
        { table: "member_position_assignments", column: "override_reason", type: "text", nullable: true, check_sql: "override_reason IS NULL OR override_reason = 'OWNER_APPROVED_21ST_TERM_TO_AGM36_CLOSE'" },
        { table: "dues_allocations", column: "correction_reason_code", type: "text", nullable: true, check_sql: "(correction_reason_code IS NULL AND rights_effect_mode IN ('immediate_positive','next_month_negative')) OR (correction_reason_code IN ('source_error','false_transaction') AND rights_effect_mode = 'retroactive_error')" },
      ],
      receipt_refund_input_pair: { fields: ["correction_reason_code_or_null","correction_evidence_sha256_or_null"], storage_column: "dues_allocations.correction_reason_code", evidence_binding: "operation_payload_and_audit_digest", nullability_sql: "(code IS NULL AND evidence IS NULL) OR (code IN ('source_error','false_transaction') AND evidence ~ '^[0-9a-f]{64}$')" },
      classification_statuses: ["approved","quarantined"],
      collision_open_successor: { parent_status: "open", new_status: "open", action: "supersede", reason_code: "COLLISION_REVIEW_REQUIRED" },
    },
    artifact_sequences: [1,10,15,20,30,40,50,60,65],
  };
  const bytes = `${canonicalJson(manifest)}\n`;
  const unresolved = bytes.match(/\b(?:ACTOR|AUDIT_ACTOR|OPTIONAL_ACTOR|VCHAIN|CANONICAL_PHONE|DEFAULT_ACTOR)\b|<[a-z][a-z0-9_-]*>/);
  if (unresolved) {
    throw new Error(`manifest_unexpanded_token:${unresolved[0]}`);
  }
  if (!SHA.test(EXPECTED_PLAN_SHA)) throw new Error("manifest_invalid_plan_sha");
  writeFileSync(MANIFEST_PATH, bytes);
}

main();
