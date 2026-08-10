import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, readManifest } from "./schema-ledger";
import { canonicalPhoneSql } from "./database-domain-constraints";

type Column = { name: string; type: string; nullable: boolean; default_sql: string | null; generated_sql: string | null };
type Table = { table: string; columns: Column[] };
type Constraint = { table: string; name: string; columns?: string[]; expression_sql?: string; predicate_sql?: string | null; referenced_table?: string; referenced_columns?: string[]; on_delete?: string; on_update?: string; method?: string };

const q = (value: string) => `"${value.replaceAll('"', '""')}"`;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;
const hash = (value: Buffer | string) => createHash("sha256").update(value).digest("hex");
const root = process.cwd();
const manifest = readManifest();
const value = manifest.value as any;
const tables = value.tables as Table[];
const tableNames = new Set(tables.map((table) => table.table));
const exceptionTable = "schema_data_exceptions";
const ledgerTables = new Set(["schema_change_ledger", "schema_release_runs", "schema_capability_receipts"]);
const ordinaryTables = tables.filter((table) => !ledgerTables.has(table.table) && table.table !== exceptionTable);
const seedActorWhere = `id=current_setting('dgkma.actor_user_id')::integer
    AND user_uid=current_setting('dgkma.actor_user_uid')::uuid AND is_admin=true`;
const seedActorSubquery = `(SELECT id,user_uid,name FROM public.users WHERE ${seedActorWhere}) actor`;
const seedAuthorization = `current_setting('dgkma.actor_authorization_version')`;

function columnSql(column: Column): string {
  let sql = `${q(column.name)} ${column.type}`;
  if (column.generated_sql) sql += ` GENERATED ALWAYS AS (${column.generated_sql}) STORED`;
  else if (column.default_sql?.startsWith("GENERATED ")) sql += ` ${column.default_sql}`;
  else if (column.default_sql) sql += ` DEFAULT ${column.default_sql}`;
  if (!column.nullable) sql += " NOT NULL";
  return sql;
}

function createTable(table: Table): string {
  return `CREATE TABLE public.${q(table.table)} (\n${table.columns.map((column) => `  ${columnSql(column)}`).join(",\n")}\n);`;
}

function constraintsFor(selected: Set<string>): string[] {
  const sql: string[] = [];
  for (const item of value.primary_keys as Constraint[]) {
    if (selected.has(item.table)) sql.push(`ALTER TABLE public.${q(item.table)} ADD CONSTRAINT ${q(item.name)} PRIMARY KEY (${item.columns!.map(q).join(", ")});`);
  }
  for (const item of value.unique_constraints as Constraint[]) {
    if (!selected.has(item.table)) continue;
    if (item.predicate_sql) sql.push(`CREATE UNIQUE INDEX ${q(item.name)} ON public.${q(item.table)} (${item.columns!.map(q).join(", ")}) WHERE ${item.predicate_sql};`);
    else sql.push(`ALTER TABLE public.${q(item.table)} ADD CONSTRAINT ${q(item.name)} UNIQUE (${item.columns!.map(q).join(", ")});`);
  }
  for (const item of value.checks as Constraint[]) {
    if (selected.has(item.table) && isBooleanCheck(item.expression_sql!)) sql.push(`ALTER TABLE public.${q(item.table)} ADD CONSTRAINT ${q(item.name)} CHECK (${item.expression_sql});`);
  }
  for (const item of value.foreign_keys as Constraint[]) {
    if (!selected.has(item.table)) continue;
    sql.push(`ALTER TABLE public.${q(item.table)} ADD CONSTRAINT ${q(item.name)} FOREIGN KEY (${item.columns!.map(q).join(", ")}) REFERENCES public.${q(item.referenced_table!)} (${item.referenced_columns!.map(q).join(", ")}) ON DELETE ${item.on_delete} ON UPDATE ${item.on_update};`);
  }
  for (const item of value.indexes as Constraint[]) {
    if (!selected.has(item.table)) continue;
    sql.push(`CREATE INDEX ${q(item.name)} ON public.${q(item.table)} USING ${item.method ?? "btree"} (${item.columns!.map(q).join(", ")})${item.predicate_sql ? ` WHERE ${item.predicate_sql}` : ""};`);
  }
  return sql;
}

function isBooleanCheck(expression: string): boolean {
  return /(?:=|<>|>=|<=|>|<|\bIS\b|\bIN\b|~|\bAND\b|\bOR\b|\bNOT\b|\bBETWEEN\b|\bEXISTS\b)/i.test(expression);
}

const baselineDrizzle = readFileSync("migrations/0000_cheerful_nick_fury.sql", "utf8")
  .replaceAll("--> statement-breakpoint", "")
  .replaceAll('CREATE TABLE "', 'CREATE TABLE IF NOT EXISTS "')
  .replace(
    /^ALTER TABLE "([^"]+)" ADD CONSTRAINT "([^"]+)" (.+);$/gm,
    (_statement, table, constraint, definition) =>
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=${literal(constraint)}) THEN ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(constraint)} ${definition}; END IF; END $$;`,
  );
const baseline = `${baselineDrizzle}\n
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday_type text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_leap_month boolean;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS activity_region text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[];

CREATE TABLE IF NOT EXISTS public.comments (
  id serial PRIMARY KEY, post_id integer NOT NULL CONSTRAINT comments_post_id_posts_id_fk REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id integer CONSTRAINT comments_author_id_users_id_fk REFERENCES public.users(id), content text NOT NULL, created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.obituaries (
  id serial PRIMARY KEY, title text NOT NULL, deceased_name text NOT NULL, deceased_relation text NOT NULL,
  date_of_death text NOT NULL, funeral_home text DEFAULT '', jangji text DEFAULT '', bank_account text DEFAULT '',
  chief_mourner text DEFAULT '', contact_number text DEFAULT '', author_id integer CONSTRAINT obituaries_author_id_users_id_fk REFERENCES public.users(id), created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.community_events (
  id serial PRIMARY KEY, legacy_obituary_id integer CONSTRAINT community_events_legacy_obituary_id_unique UNIQUE, event_type text NOT NULL, status text NOT NULL DEFAULT 'draft',
  title text, event_date text, location text, related_member_name text, contact_number text, account_info text,
  source_text text, source_urls text[] DEFAULT '{}', details jsonb NOT NULL DEFAULT '{}', author_id integer CONSTRAINT community_events_author_id_users_id_fk REFERENCES public.users(id),
  published_at timestamp, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.event_parse_rate_limits (
  user_id integer PRIMARY KEY CONSTRAINT event_parse_rate_limits_user_id_users_id_fk REFERENCES public.users(id) ON DELETE CASCADE, window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.kakao_oauth_states (
  state_hash text PRIMARY KEY, session_binding_hash text NOT NULL CONSTRAINT kakao_oauth_states_session_binding_hash_unique UNIQUE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.kakao_identity_terminations (
  identity_hash text PRIMARY KEY, terminated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.session (
  sid varchar NOT NULL PRIMARY KEY, sess json NOT NULL, expire timestamp(6) NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expire_idx ON public.session(expire);
`;

const canonicalPrelude = `ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_uid uuid DEFAULT gen_random_uuid();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_canonical text GENERATED ALWAYS AS (lower(btrim(email))) STORED;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_canonical text GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(phone_number,''), '[^0-9]', '', 'g'), '')) STORED;
ALTER TABLE public.alumni_database ADD COLUMN IF NOT EXISTS mobile_canonical text GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(mobile,''), '[^0-9]', '', 'g'), '')) STORED;
ALTER TABLE public.pending_registrations ADD COLUMN IF NOT EXISTS email_canonical text GENERATED ALWAYS AS (lower(btrim(email))) STORED;`;

const exceptionDefinition = createTable(tables.find((table) => table.table === exceptionTable)!);
const exceptionConstraints = constraintsFor(new Set([exceptionTable])).join("\n");
const exceptionCapture = (value.sequence_15_rule_registry.rules as any[]).map((rule) => `INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, ${literal(rule.table)}, encode(sha256(convert_to(row_to_json(${q(rule.table)})::text, 'UTF8')), 'hex'), ${literal(rule.rule_code)}, ${literal(rule.exception_class)},
       encode(sha256(convert_to(row_to_json(${q(rule.table)})::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public.${q(rule.table)} AS ${q(rule.table)} WHERE ${rule.predicate_sql};`).join("\n");

const sequence15 = `${canonicalPrelude}\n${exceptionDefinition}\n${exceptionConstraints}\n${exceptionCapture}\n`;

const existingAlterations = (value.existing_table_alterations as any[]).flatMap((entry) => entry.literal_sql_fragments as string[]);
const paymentChecks = (value.checks as any[]).filter((item) => item.table === "payments" && ["amount_positive","year_domain","type_domain","status_domain"].includes(item.rule));
const preAnchorCount = `(SELECT count(*) FROM public.schema_data_exceptions WHERE version=1 AND status='open' AND exception_class='pre_anchor_blocking')`;
function lockedPreAnchorPredicate(rule: any): string {
  if (rule.rule_code === "users.phone_canonical_source_valid") {
    return `phone_number IS NOT NULL AND btrim(phone_number) <> '' AND (${canonicalPhoneSql("phone_number")}) IS NULL`;
  }
  if (rule.rule_code === "users.phone_canonical_unique") {
    const outer = canonicalPhoneSql("users.phone_number");
    const duplicate = canonicalPhoneSql("duplicate.phone_number");
    return `(${outer}) IS NOT NULL AND EXISTS (SELECT 1 FROM users duplicate WHERE (${duplicate}) = (${outer}) AND duplicate.id <> users.id)`;
  }
  if (rule.rule_code === "alumni_database.mobile_canonical_source_valid") {
    return `mobile IS NOT NULL AND btrim(mobile) <> '' AND (${canonicalPhoneSql("mobile")}) IS NULL`;
  }
  if (rule.rule_code === "alumni_database.mobile_canonical_unique") {
    const outer = canonicalPhoneSql("alumni_database.mobile");
    const duplicate = canonicalPhoneSql("duplicate.mobile");
    return `(${outer}) IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE (${duplicate}) = (${outer}) AND duplicate.id <> alumni_database.id)`;
  }
  return rule.predicate_sql;
}
const preAnchorGuards = (value.sequence_15_rule_registry.rules as any[])
  .filter((rule) => rule.exception_class === "pre_anchor_blocking")
  .map((rule) => `DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.${q(rule.table)} AS ${q(rule.table)} WHERE ${lockedPreAnchorPredicate(rule)}) THEN RAISE EXCEPTION ${literal(`pre_anchor_blocking:${rule.rule_code}`)}; END IF; END $$;`)
  .join("\n");
const canonicalRepair = `ALTER TABLE public.users DROP COLUMN phone_canonical;
ALTER TABLE public.users ADD COLUMN phone_canonical text GENERATED ALWAYS AS (${canonicalPhoneSql("phone_number")}) STORED;
ALTER TABLE public.alumni_database DROP COLUMN mobile_canonical;
ALTER TABLE public.alumni_database ADD COLUMN mobile_canonical text GENERATED ALWAYS AS (${canonicalPhoneSql("mobile")}) STORED;`;
const sequence20 = `DO $$ BEGIN IF ${preAnchorCount} > 0 THEN RAISE EXCEPTION 'pre_anchor_blocking'; END IF; END $$;
${preAnchorGuards}
${canonicalRepair}
${(value.existing_table_alterations as any[]).flatMap((entry) => {
  const table = entry.table;
  return (value.checks as any[]).filter((item) => item.table === table && isBooleanCheck(item.expression_sql) && !paymentChecks.some((check: any) => check.name === item.name)).map((item) =>
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=${literal(item.name)}) THEN ALTER TABLE public.${q(table)} ADD CONSTRAINT ${q(item.name)} CHECK (${item.expression_sql}); END IF; END $$;`
  );
}).join("\n")}
${paymentChecks.map((item: any) => `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname=${literal(item.name)}) THEN ALTER TABLE public.payments ADD CONSTRAINT ${q(item.name)} CHECK (${item.expression_sql}) NOT VALID; END IF; END $$;\nDO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM public.schema_data_exceptions WHERE version=1 AND status='open' AND rule_code=${literal(`payments.${item.rule}`)}) THEN ALTER TABLE public.payments VALIDATE CONSTRAINT ${q(item.name)}; END IF; END $$;`).join("\n")}
`;

const selectedOrdinary = new Set(ordinaryTables.map((table) => table.table));
const sequence30 = `${ordinaryTables.map(createTable).join("\n\n")}\n\n${constraintsFor(selectedOrdinary).join("\n")}\n`;

function temporalVariant(preferred: boolean): string {
  if (preferred) return `CREATE EXTENSION IF NOT EXISTS btree_gist;\n${(value.ranges as any[]).map((range) => `ALTER TABLE public.${q(range.table)} ADD CONSTRAINT ${q(`${range.table}__range_valid__check`)} CHECK (${range.check_sql});`).join("\n")}\n`;
  return `${(value.ranges as any[]).map((range) => `ALTER TABLE public.${q(range.table)} ADD CONSTRAINT ${q(`${range.table}__range_valid__check`)} CHECK (${range.check_sql});`).join("\n")}\n`;
}

type LogicalSourceSeed = {
  source_code: string; source_uid: string; source_kind: string; source_locator: string; display_name: string;
  authority_role: string; event_authority_rank: number; source_timezone: string; valid_from: string | null; valid_to: string | null;
};
const logicalSourceDetails: LogicalSourceSeed[] = [
  { source_code:"LEDGER_FINAL_2022_2025", source_uid:"73f14b07-62dc-5643-b56e-533d4415f5aa", source_kind:"google_sheet", source_locator:"spreadsheet:1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k", display_name:"2022–2025 결산장부", authority_role:"economic_event", event_authority_rank:400, source_timezone:"Asia/Seoul", valid_from:"2022-01-01", valid_to:"2026-01-01" },
  { source_code:"LEDGER_DUES_POLICY_2024_2025", source_uid:"256fcd87-840f-537d-8204-6a5f7ee3947e", source_kind:"google_sheet", source_locator:"spreadsheet:1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k;ranges:회비수입!O2:O7,회비수입!O9:O14", display_name:"2024–2025 회비규정", authority_role:"policy", event_authority_rank:0, source_timezone:"Asia/Seoul", valid_from:"2024-01-01", valid_to:"2026-01-01" },
  { source_code:"BANK_TOSS_2026", source_uid:"fabdbcad-1fee-500a-80dd-68405befcaea", source_kind:"bank_sheet", source_locator:"spreadsheet:1d9C3cMd_0MomQtF5cfAk-9doVKRxsy8OKiO1MqvYqA0;sheet:토스뱅크(1/1~3/16)", display_name:"2026 토스 거래", authority_role:"bank", event_authority_rank:300, source_timezone:"Asia/Seoul", valid_from:"2026-01-01", valid_to:"2026-03-17" },
  { source_code:"BANK_IBK_2026", source_uid:"cdcfb582-f1e9-5bf3-91d4-eb1b8271e7c6", source_kind:"bank_sheet", source_locator:"spreadsheet:1d9C3cMd_0MomQtF5cfAk-9doVKRxsy8OKiO1MqvYqA0;sheet:기업은행(3/16~)", display_name:"2026 기업 거래", authority_role:"bank", event_authority_rank:300, source_timezone:"Asia/Seoul", valid_from:"2026-03-16", valid_to:null },
  { source_code:"GROUP_FOREIGN_FACULTY_2025", source_uid:"26a45b1a-fc67-5b1e-aca4-6391dc296bf1", source_kind:"google_sheet", source_locator:"spreadsheet:1s8x9Oli94iD0Dwx1OYedmKbwSBRPkvcg3tjCML6iHPY", display_name:"외래교수회 단체배분", authority_role:"allocation_evidence", event_authority_rank:0, source_timezone:"Asia/Seoul", valid_from:"2025-01-01", valid_to:"2026-03-01" },
  { source_code:"MEMBERSHIP_INTEGRATED_ADDRESS_BOOK", source_uid:"5a47bd83-4d99-59bf-8525-7d0f4667ec75", source_kind:"google_sheet", source_locator:"spreadsheet:1YBu0MtJ3lt2AB1-DB3-u7NP-TSgehKmGK3Ox4PJCzLw;sheet:876761083", display_name:"통합주소록 회원 편집 원본", authority_role:"member_identity", event_authority_rank:0, source_timezone:"Asia/Seoul", valid_from:null, valid_to:null },
  { source_code:"AGM36_PERIOD_BOUNDARY", source_uid:"c620bd76-e7ee-5746-a523-5d1468039817", source_kind:"notion", source_locator:"payload:docs/source-authority/22nd-officers.json#AGM36_CLOSE", display_name:"제36차 총회 폐회 경계", authority_role:"period_boundary", event_authority_rank:0, source_timezone:"Asia/Seoul", valid_from:"2026-01-01", valid_to:null },
  { source_code:"NOTION_ORGANIZATION_ROLE_HISTORY", source_uid:"75dd7485-9c2b-51a9-845f-e7baa6ba8dc1", source_kind:"notion", source_locator:"data-source:dae9352c-122b-4902-bdb8-31328c35940f", display_name:"조직·직책 이력 편집 원본", authority_role:"role_history", event_authority_rank:0, source_timezone:"Asia/Seoul", valid_from:null, valid_to:null },
  { source_code:"NOTION_DUES_REGULATION_DRAFT", source_uid:"6dc3cdbe-11b4-538e-b703-ae48ddc6c7db", source_kind:"notion", source_locator:"page:3aa2225d9c4d8188b661ce08b2cfed2f", display_name:"회비규정 미의결안", authority_role:"policy", event_authority_rank:0, source_timezone:"Asia/Seoul", valid_from:null, valid_to:null },
  { source_code:"LEGACY_PAYMENTS", source_uid:"6b3099c2-5015-5852-b5af-ab1787bda029", source_kind:"legacy_table", source_locator:"public.payments", display_name:"기존 결제 호환 증거", authority_role:"compatibility", event_authority_rank:200, source_timezone:"batch-captured", valid_from:"2024-01-01", valid_to:null },
];
const uuidRegistry = new Map((value.logical_source_uuid_registry as any[]).map((source) => [source.source_code, source.source_uid]));
if (logicalSourceDetails.length !== 10 || logicalSourceDetails.some((source) => uuidRegistry.get(source.source_code) !== source.source_uid)) {
  throw new Error("logical_source_seed_registry_mismatch");
}
const sourceSeeds = logicalSourceDetails.map((source) => {
  const contractFingerprint = hash(canonicalJson({ digest_version:"logical-source-v1", source_uid:source.source_uid,
    source_code:source.source_code, source_kind:source.source_kind, source_locator:source.source_locator,
    display_name:source.display_name, authority_role:source.authority_role, event_authority_rank:source.event_authority_rank,
    source_timezone:source.source_timezone, valid_from:source.valid_from, valid_to:source.valid_to, status:"active" }));
  return `INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT ${literal(source.source_uid)}::uuid,${literal(source.source_code)},${literal(source.display_name)},${literal(source.source_kind)},
         ${literal(source.source_locator)},${literal(source.source_timezone)},${literal(source.authority_role)},${source.event_authority_rank},${literal(contractFingerprint)},'active',${source.valid_from ? `DATE ${literal(source.valid_from)}` : "NULL"},${source.valid_to ? `DATE ${literal(source.valid_to)}` : "NULL"},
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),${seedAuthorization}
  FROM public.users WHERE ${seedActorWhere} ON CONFLICT DO NOTHING;`;
}).join("\n");

const releaseSeeds = (value.source_release_contract_registry as any[]).map((release) => `INSERT INTO public.accounting_source_releases
  (release_uid,logical_source_id,adapter_code,adapter_version,normalized_schema_sha256,normalization_implementation_sha256,
   mapping_table_sha256,mapping_approval_receipt_sha256,released_at,status,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT gen_random_uuid(),source.id,${literal(release.adapter_code)},${literal(release.adapter_version)},${literal(release.normalized_schema_sha256)},
        ${literal(release.normalization_implementation_sha256)},${literal(release.mapping_table_sha256)},
        ${literal(release.mapping_approval_receipt_sha256)},TIMESTAMPTZ ${literal(release.released_at)},'active',actor.id,
        actor.user_uid,actor.name,'migration_admin',clock_timestamp(),gen_random_uuid(),${seedAuthorization}
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      ${seedActorSubquery}
 WHERE source.source_code=${literal(release.source_code)} ON CONFLICT DO NOTHING;`).join("\n");

const bankAccounts = [
  ["TOSS_OFFICER_2026","TOSS","reported_officer","2026-01-01","2026-03-17"],
  ["IBK_ASSOCIATION_2026","IBK","association","2026-03-16",null],
].map(([code,institution,owner,from,to]) => `INSERT INTO public.bank_accounts
  (account_code,institution_code,masked_identifier,owner_kind,active_from,active_to,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT ${literal(code!)},${literal(institution!)},'미수집',${literal(owner!)},DATE ${literal(from!)},${to ? `DATE ${literal(to)}` : "NULL"},
        id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),${seedAuthorization}
 FROM public.users WHERE ${seedActorWhere} ON CONFLICT DO NOTHING;`).join("\n");

const bankMappings = [
  ["BANK_TOSS_2026","TOSS_OFFICER_2026"], ["BANK_IBK_2026","IBK_ASSOCIATION_2026"],
].map(([sourceCode,accountCode]) => `INSERT INTO public.bank_source_account_mappings
  (logical_source_id,account_id,source_code_snapshot,account_code_snapshot,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT source.id,account.id,source.source_code,account.account_code,actor.id,actor.user_uid,actor.name,'migration_admin',
        clock_timestamp(),gen_random_uuid(),${seedAuthorization}
 FROM public.accounting_logical_sources source JOIN public.bank_accounts account ON account.account_code=${literal(accountCode)}
 CROSS JOIN LATERAL ${seedActorSubquery}
 WHERE source.source_code=${literal(sourceCode)} ON CONFLICT DO NOTHING;`).join("\n");

const basePolicies = [
  ["president",500,100000,1200000], ["senior_vice_president",400,50000,600000],
  ["vice_president_auditor_chair",300,30000,400000], ["director",200,10000,200000],
] as const;
const policyRows = [2024,2025,2026].flatMap((year) => [
  ...basePolicies.map(([tier,priority,monthly,annual]) => ({year,tier,priority,monthly,annual})),
  {year,tier:"member",priority:100,monthly:year === 2024 ? 1000 : 2000,annual:year === 2024 ? 20000 : 50000},
  ...(year === 2026 ? [{year,tier:"honorary",priority:0,monthly:0,annual:0}] : []),
]);
const policySeeds = policyRows.map((policy) => {
  const sourceCode = policy.year < 2026 ? "LEDGER_DUES_POLICY_2024_2025" : "NOTION_DUES_REGULATION_DRAFT";
  return `INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT ${policy.year},${literal(policy.tier)},${policy.priority},${policy.monthly},${policy.annual},10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ ${literal(`${policy.year}-01-01T00:00:00+09:00`)},1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),${seedAuthorization}
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      ${seedActorSubquery}
 WHERE source.source_code=${literal(sourceCode)} ON CONFLICT DO NOTHING;`;
}).join("\n");

const obligationMappings = [
  ["president","president",500], ["senior_vice_president","senior_vice_president",400],
  ["vice_president","vice_president_auditor_chair",300], ["auditor","vice_president_auditor_chair",300],
  ["general_affairs_director","director",200], ["planning_director","director",200], ["legal_director","director",200],
  ["external_cooperation_director","director",200], ["public_relations_director","director",200], ["director","director",200],
  ["member","member",100],
] as const;
const secondaryMappings = ["busan_branch_president","busan_branch_vice_president","busan_branch_general_affairs","busan_branch_finance",
  "class_1_captain","class_3_captain","class_7_captain","class_41_captain","class_41_vice_captain","class_42_captain","class_42_vice_captain"];
const mappingRows = [2024,2025,2026].flatMap((year) => [
  ...obligationMappings.map(([position,tier,priority]) => ({year,position,tier,priority,adds:true})),
  ...(year === 2026 ? [{year,position:"general_assembly_chair",tier:"vice_president_auditor_chair",priority:300,adds:true},
    {year,position:"member_kind:honorary",tier:"honorary",priority:0,adds:true},
    ...secondaryMappings.map((position) => ({year,position,tier:null,priority:0,adds:false}))] : []),
]);
const mappingSeeds = mappingRows.map((mapping) => {
  const sourceCode = mapping.year < 2026 ? "LEDGER_DUES_POLICY_2024_2025" : "NOTION_DUES_REGULATION_DRAFT";
  return `INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT ${mapping.year},${literal(mapping.position)},${mapping.tier ? literal(mapping.tier) : "NULL"},policy.id,${mapping.priority},${mapping.adds},'draft',source.id,NULL,
        TIMESTAMPTZ ${literal(`${mapping.year}-01-01T00:00:00+09:00`)},1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),${seedAuthorization}
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      ${seedActorSubquery}
 LEFT JOIN public.dues_policies policy ON ${mapping.tier ? `policy.dues_year=${mapping.year} AND policy.tier_code=${literal(mapping.tier)} AND policy.version=1` : "false"}
 WHERE source.source_code=${literal(sourceCode)} ON CONFLICT DO NOTHING;`;
}).join("\n");
const categorySeeds = [
  ["DUES_INCOME","회비수입","income","dues_credit"], ["OTHER_INCOME","기타수입","income","none"],
  ["DUES_REFUND","회비환급","expense","dues_refund"], ["GENERAL_EXPENSE","기타지출","expense","none"],
  ["INTERNAL_TRANSFER_IN","내부이체입금","transfer","none"], ["INTERNAL_TRANSFER_OUT","내부이체출금","transfer","none"],
].map(([code,name,section,effect]) => `INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT ${literal(code)},1,${literal(name)},${literal(section)},${literal(effect)},DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),${seedAuthorization}
 FROM public.users WHERE ${seedActorWhere} ON CONFLICT DO NOTHING;`).join("\n");
if ((value.source_release_contract_registry as any[]).length !== 2 || policyRows.length !== 16 || mappingRows.length !== 46) {
  throw new Error("sequence_50_seed_count_mismatch");
}
const sequence50 = `${sourceSeeds}\n${releaseSeeds}\n${bankAccounts}\n${bankMappings}\n${policySeeds}\n${mappingSeeds}\n${categorySeeds}\n`;

const sequence60 = `REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
`;
const restore60 = `REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
`;
const sequence65 = `${paymentChecks.map((item: any) => `DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.schema_data_exceptions WHERE version=1 AND status='open' AND rule_code=${literal(`payments.${item.rule}`)}) THEN RAISE EXCEPTION 'legacy_payment_validation_blocked:${item.rule}'; END IF; ALTER TABLE public.payments VALIDATE CONSTRAINT ${q(item.name)}; END $$;`).join("\n")}\n`;

const artifacts = new Map<string,string>([
  ["migrations/0001_current_schema_baseline.sql", baseline],
  ["migrations/0015_existing_data_exception_capture.sql", sequence15],
  ["migrations/0020_existing_integrity.sql", sequence20],
  ["migrations/0003_accounting_ordinary.sql", sequence30],
  ["migrations/manual/0040_accounting_temporal_preferred.sql", temporalVariant(true)],
  ["migrations/manual/0040_accounting_temporal_fallback.sql", temporalVariant(false)],
  ["migrations/data/0050_accounting_reference_seed.sql", sequence50],
  ["migrations/manual/0060_database_security.sql", sequence60],
  ["migrations/manual/0060_restore_security_reconcile.sql", restore60],
  ["migrations/0065_validate_legacy_payment_checks.sql", sequence65],
]);

for (const [relative, body] of artifacts) {
  const target = path.join(root, relative);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, body.endsWith("\n") ? body : `${body}\n`);
}

for (const file of [
  "0001_schema_ledger_bootstrap.json","0010_current_schema_baseline.json","0015_existing_data_exception_capture.json",
  "0020_existing_integrity.json","0030_accounting_ordinary.json","0040_accounting_temporal_fallback.json",
  "0040_accounting_temporal_preferred.json","0050_accounting_reference_seed.json","0060_database_security.json",
  "0065_validate_legacy_payment_checks.json",
]) {
  const descriptorPath = path.join(root, "migrations/artifacts", file);
  const descriptor = JSON.parse(readFileSync(descriptorPath, "utf8"));
  if (descriptor.sequence_no !== 1) {
    descriptor.materialization_state = "materialized";
    descriptor.artifact_sha256 = hash(readFileSync(path.join(root, descriptor.path)));
  }
  writeFileSync(descriptorPath, `${canonicalJson(descriptor)}\n`);
}

const restoreSidecar = {
  schema_version: "dgkma-restore-security-sidecar-v1",
  sequence_no: 60,
  artifact_id: "database-security-v1",
  artifact_path: "migrations/manual/0060_database_security.sql",
  artifact_sha256: hash(readFileSync(path.join(root, "migrations/manual/0060_database_security.sql"))),
  restore_reconcile_path: "migrations/manual/0060_restore_security_reconcile.sql",
  restore_reconcile_sha256: hash(readFileSync(path.join(root, "migrations/manual/0060_restore_security_reconcile.sql"))),
};
writeFileSync(path.join(root, "migrations/artifacts/0060_database_security.restore.json"), `${canonicalJson(restoreSidecar)}\n`);

console.log(JSON.stringify({ schema_version: "dgkma-schema-artifact-materialization-v1", manifest_sha256: manifest.sha256, artifact_count: artifacts.size, unused_existing_fragments: existingAlterations.length, result: "approved" }));
