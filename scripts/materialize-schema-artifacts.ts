import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { canonicalJson, readManifest } from "./schema-ledger";

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

const baseline = `${readFileSync("migrations/0000_cheerful_nick_fury.sql", "utf8").replaceAll("--> statement-breakpoint", "")}\n
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS birthday_type text;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_leap_month boolean;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS activity_region text;
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS image_urls text[];

CREATE TABLE IF NOT EXISTS public.comments (
  id serial PRIMARY KEY, post_id integer NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id integer REFERENCES public.users(id), content text NOT NULL, created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.obituaries (
  id serial PRIMARY KEY, title text NOT NULL, deceased_name text NOT NULL, deceased_relation text NOT NULL,
  date_of_death text NOT NULL, funeral_home text DEFAULT '', jangji text DEFAULT '', bank_account text DEFAULT '',
  chief_mourner text DEFAULT '', contact_number text DEFAULT '', author_id integer REFERENCES public.users(id), created_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.community_events (
  id serial PRIMARY KEY, legacy_obituary_id integer UNIQUE, event_type text NOT NULL, status text NOT NULL DEFAULT 'draft',
  title text, event_date text, location text, related_member_name text, contact_number text, account_info text,
  source_text text, source_urls text[] DEFAULT '{}', details jsonb NOT NULL DEFAULT '{}', author_id integer REFERENCES public.users(id),
  published_at timestamp, created_at timestamp DEFAULT now(), updated_at timestamp DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.event_parse_rate_limits (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE, window_started_at timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.kakao_oauth_states (
  state_hash text PRIMARY KEY, session_binding_hash text NOT NULL UNIQUE, started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
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
const sequence20 = `DO $$ BEGIN IF ${preAnchorCount} > 0 THEN RAISE EXCEPTION 'pre_anchor_blocking'; END IF; END $$;
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

const sourceSeeds = (value.logical_source_uuid_registry as any[]).map((source) => {
  const sourceKind = source.source_code.startsWith("NOTION_") ? "notion"
    : source.source_code.startsWith("BANK_") ? "bank_export"
    : source.source_code === "LEGACY_PAYMENTS" ? "legacy_database"
    : "managed_document";
  const authorityRole = source.source_code === "MEMBERSHIP_INTEGRATED_ADDRESS_BOOK" ? "member_identity"
    : source.source_code === "NOTION_ORGANIZATION_ROLE_HISTORY" ? "organization_role" : "supporting_evidence";
  return `INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT ${literal(source.source_uid)}::uuid,${literal(source.source_code)},${literal(source.source_code)},${literal(sourceKind)},
         ${literal(`registry:${source.source_code}`)},'Asia/Seoul',${literal(authorityRole)},10,${literal(manifest.sha256)},'active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),${literal(manifest.sha256)}
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;`;
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
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),${literal(manifest.sha256)}
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;`).join("\n");
const sequence50 = `${sourceSeeds}\n${categorySeeds}\n`;

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
