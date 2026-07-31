-- PostgreSQL 16 public-schema catalog inspection.
-- Usage: psql -X --csv -v ON_ERROR_STOP=1 -v expected_database=<name> -f scripts/database-schema-catalog.sql

\set ON_ERROR_STOP on
\pset pager off
\pset footer off
\pset format csv
\pset null '[null]'

\if :{?expected_database}
\else
\echo '__ERROR__ expected_database is required'
\quit 40
\endif

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '5s';

SELECT (current_database() = :'expected_database' AND current_setting('transaction_read_only') = 'on')::int AS safety_ok \gset
\if :safety_ok
\echo '__SAFETY_GATE__ ok'
\else
\echo '__ERROR__ database target or read-only state mismatch'
SELECT 1 / 0 AS catalog_safety_abort;
\quit 41
\endif

-- section: database_security
\echo '__SECTION__ database_security'
SELECT
  d.datname AS database_name,
  pg_catalog.pg_get_userbyid(d.datdba) AS owner_name,
  d.datallowconn AS allows_connections,
  d.datconnlimit AS connection_limit,
  d.datacl IS NULL AS acl_is_null,
  acl.sorted_acl
FROM pg_catalog.pg_database AS d
LEFT JOIN LATERAL (
  SELECT pg_catalog.string_agg(entry::text, ',' ORDER BY entry::text) AS sorted_acl
  FROM pg_catalog.unnest(d.datacl) AS entry
) AS acl ON true
WHERE d.datname = current_database()
ORDER BY d.datname;

-- section: schemas
\echo '__SECTION__ schemas'
SELECT
  n.nspname AS schema_name,
  pg_catalog.pg_get_userbyid(n.nspowner) AS owner_name,
  n.nspacl IS NULL AS acl_is_null,
  acl.sorted_acl
FROM pg_catalog.pg_namespace AS n
LEFT JOIN LATERAL (
  SELECT pg_catalog.string_agg(entry::text, ',' ORDER BY entry::text) AS sorted_acl
  FROM pg_catalog.unnest(n.nspacl) AS entry
) AS acl ON true
WHERE n.nspname = 'public'
ORDER BY n.nspname;

-- section: identity
\echo '__SECTION__ identity'
SELECT
  current_database() AS database_name,
  'public'::text AS schema_name,
  current_setting('server_version') AS server_version,
  current_setting('transaction_read_only') AS transaction_read_only
ORDER BY 1, 2, 3, 4;

-- section: tables
\echo '__SECTION__ tables'
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  CASE c.relkind
    WHEN 'r' THEN 'ordinary'
    WHEN 'p' THEN 'partitioned'
  END AS table_kind,
  c.relpersistence AS persistence,
  c.relispartition AS is_partition
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY n.nspname, c.relname;

-- section: relation_security
\echo '__SECTION__ relation_security'
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  c.relkind AS relation_kind,
  pg_catalog.pg_get_userbyid(c.relowner) AS owner_name,
  c.relacl IS NULL AS acl_is_null,
  acl.sorted_acl
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN LATERAL (
  SELECT pg_catalog.string_agg(entry::text, ',' ORDER BY entry::text) AS sorted_acl
  FROM pg_catalog.unnest(c.relacl) AS entry
) AS acl ON true
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
ORDER BY n.nspname, c.relname, c.relkind;

-- section: views
\echo '__SECTION__ views'
SELECT
  n.nspname AS schema_name,
  c.relname AS view_name,
  CASE c.relkind
    WHEN 'v' THEN 'view'
    WHEN 'm' THEN 'materialized_view'
  END AS view_kind,
  pg_catalog.pg_get_viewdef(c.oid, true) AS definition
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('v', 'm')
ORDER BY n.nspname, c.relname;

-- section: columns
\echo '__SECTION__ columns'
SELECT
  n.nspname AS schema_name,
  c.relname AS relation_name,
  a.attnum AS physical_position,
  a.attname AS column_name,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS formatted_type,
  NOT a.attnotnull AS is_nullable,
  pg_catalog.pg_get_expr(ad.adbin, ad.adrelid, true) AS column_default,
  NULLIF(a.attidentity, '') AS identity_kind,
  NULLIF(a.attgenerated, '') AS generated_kind,
  coll.collname AS collation_name
FROM pg_catalog.pg_attribute AS a
JOIN pg_catalog.pg_class AS c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_attrdef AS ad
  ON ad.adrelid = a.attrelid
 AND ad.adnum = a.attnum
LEFT JOIN pg_catalog.pg_collation AS coll ON coll.oid = a.attcollation
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p', 'v', 'm')
  AND a.attnum > 0
  AND NOT a.attisdropped
ORDER BY n.nspname, c.relname, a.attnum;

-- section: constraints
\echo '__SECTION__ constraints'
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  con.conname AS constraint_name,
  CASE con.contype
    WHEN 'p' THEN 'PRIMARY KEY'
    WHEN 'f' THEN 'FOREIGN KEY'
    WHEN 'u' THEN 'UNIQUE'
    WHEN 'c' THEN 'CHECK'
    WHEN 'x' THEN 'EXCLUDE'
  END AS constraint_type,
  rn.nspname AS referenced_schema,
  rc.relname AS referenced_table,
  CASE con.confupdtype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS fk_update_action,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
  END AS fk_delete_action,
  con.condeferrable AS is_deferrable,
  con.condeferred AS initially_deferred,
  con.convalidated AS is_validated,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_class AS c ON c.oid = con.conrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_class AS rc ON rc.oid = con.confrelid
LEFT JOIN pg_catalog.pg_namespace AS rn ON rn.oid = rc.relnamespace
WHERE n.nspname = 'public'
  AND con.contype IN ('p', 'f', 'u', 'c', 'x')
ORDER BY n.nspname, c.relname, constraint_type, con.conname;

-- section: indexes
\echo '__SECTION__ indexes'
SELECT
  n.nspname AS schema_name,
  tbl.relname AS table_name,
  idx.relname AS index_name,
  i.indisprimary AS is_primary,
  i.indisunique AS is_unique,
  i.indisvalid AS is_valid,
  i.indisready AS is_ready,
  i.indisclustered AS is_clustered,
  i.indisreplident AS is_replica_identity,
  i.indnkeyatts AS key_attribute_count,
  i.indnatts AS total_attribute_count,
  pg_catalog.pg_get_expr(i.indexprs, i.indrelid, true) AS expressions,
  pg_catalog.pg_get_expr(i.indpred, i.indrelid, true) AS predicate,
  pg_catalog.pg_get_indexdef(i.indexrelid, 0, true) AS definition
FROM pg_catalog.pg_index AS i
JOIN pg_catalog.pg_class AS tbl ON tbl.oid = i.indrelid
JOIN pg_catalog.pg_class AS idx ON idx.oid = i.indexrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = tbl.relnamespace
WHERE n.nspname = 'public'
ORDER BY n.nspname, tbl.relname, idx.relname;

-- section: sequences
\echo '__SECTION__ sequences'
SELECT
  n.nspname AS schema_name,
  c.relname AS sequence_name,
  pg_catalog.format_type(s.seqtypid, NULL) AS data_type,
  s.seqstart AS start_value,
  s.seqincrement AS increment_by,
  s.seqmin AS minimum_value,
  s.seqmax AS maximum_value,
  s.seqcache AS cache_size,
  s.seqcycle AS cycles
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_sequence AS s ON s.seqrelid = c.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'S'
ORDER BY n.nspname, c.relname;

-- section: triggers
\echo '__SECTION__ triggers'
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  t.tgname AS trigger_name,
  t.tgenabled AS enabled_mode,
  t.tgdeferrable AS is_deferrable,
  t.tginitdeferred AS initially_deferred,
  con.conname AS constraint_name,
  pg_catalog.pg_get_triggerdef(t.oid, true) AS definition
FROM pg_catalog.pg_trigger AS t
JOIN pg_catalog.pg_class AS c ON c.oid = t.tgrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN pg_catalog.pg_constraint AS con ON con.oid = t.tgconstraint
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
ORDER BY n.nspname, c.relname, t.tgname;

-- section: row_security
\echo '__SECTION__ row_security'
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY n.nspname, c.relname;

-- section: policies
\echo '__SECTION__ policies'
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  p.polname AS policy_name,
  p.polpermissive AS is_permissive,
  p.polcmd AS command_kind,
  roles.sorted_roles,
  pg_catalog.pg_get_expr(p.polqual, p.polrelid, true) AS using_expression,
  pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid, true) AS check_expression
FROM pg_catalog.pg_policy AS p
JOIN pg_catalog.pg_class AS c ON c.oid = p.polrelid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
LEFT JOIN LATERAL (
  SELECT pg_catalog.string_agg(
    CASE
      WHEN role_oid = 0 THEN 'PUBLIC'
      ELSE pg_catalog.pg_get_userbyid(role_oid)
    END,
    ','
    ORDER BY
      CASE
        WHEN role_oid = 0 THEN 'PUBLIC'
        ELSE pg_catalog.pg_get_userbyid(role_oid)
      END
  ) AS sorted_roles
  FROM pg_catalog.unnest(p.polroles) AS role_oid
) AS roles ON true
WHERE n.nspname = 'public'
ORDER BY n.nspname, c.relname, p.polname;

-- section: routines
\echo '__SECTION__ routines'
SELECT
  n.nspname AS schema_name,
  p.proname AS routine_name,
  p.prokind AS routine_kind,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  pg_catalog.pg_get_function_result(p.oid) AS result_type,
  lang.lanname AS language_name,
  p.provolatile AS volatility,
  p.proparallel AS parallel_safety,
  p.proleakproof AS is_leakproof,
  p.prosecdef AS security_definer,
  pg_catalog.pg_get_userbyid(p.proowner) AS owner_name,
  p.proacl IS NULL AS acl_is_null,
  acl.sorted_acl,
  config.sorted_config,
  (
    SELECT setting
    FROM pg_catalog.unnest(COALESCE(p.proconfig, ARRAY[]::text[])) AS setting
    WHERE setting LIKE 'search_path=%'
    ORDER BY setting
    LIMIT 1
  ) AS configured_search_path,
  CASE
    WHEN p.prokind IN ('f', 'p') THEN pg_catalog.pg_get_functiondef(p.oid)
    ELSE NULL
  END AS definition
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language AS lang ON lang.oid = p.prolang
LEFT JOIN LATERAL (
  SELECT pg_catalog.string_agg(entry::text, ',' ORDER BY entry::text) AS sorted_acl
  FROM pg_catalog.unnest(p.proacl) AS entry
) AS acl ON true
LEFT JOIN LATERAL (
  SELECT pg_catalog.string_agg(setting, ',' ORDER BY setting) AS sorted_config
  FROM pg_catalog.unnest(p.proconfig) AS setting
) AS config ON true
WHERE n.nspname = 'public'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_depend AS dep
    WHERE dep.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      AND dep.objid = p.oid
      AND dep.deptype = 'e'
  )
ORDER BY n.nspname, p.proname, identity_arguments;

-- section: default_privileges
\echo '__SECTION__ default_privileges'
SELECT
  pg_catalog.pg_get_userbyid(d.defaclrole) AS owner_name,
  n.nspname AS schema_name,
  d.defaclobjtype AS object_kind,
  acl.sorted_acl
FROM pg_catalog.pg_default_acl AS d
LEFT JOIN pg_catalog.pg_namespace AS n ON n.oid = d.defaclnamespace
LEFT JOIN LATERAL (
  SELECT pg_catalog.string_agg(entry::text, ',' ORDER BY entry::text) AS sorted_acl
  FROM pg_catalog.unnest(d.defaclacl) AS entry
) AS acl ON true
WHERE d.defaclnamespace = 0
   OR n.nspname = 'public'
ORDER BY owner_name, schema_name NULLS FIRST, object_kind, acl.sorted_acl;

-- section: enum_types
\echo '__SECTION__ enum_types'
SELECT
  n.nspname AS schema_name,
  t.typname AS enum_name,
  e.enumsortorder AS sort_order,
  e.enumlabel AS enum_label
FROM pg_catalog.pg_type AS t
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
JOIN pg_catalog.pg_enum AS e ON e.enumtypid = t.oid
WHERE n.nspname = 'public'
ORDER BY n.nspname, t.typname, e.enumsortorder;

-- section: domains
\echo '__SECTION__ domains'
SELECT
  n.nspname AS schema_name,
  t.typname AS domain_name,
  pg_catalog.format_type(t.typbasetype, t.typtypmod) AS base_type,
  t.typnotnull AS is_not_null,
  pg_catalog.pg_get_expr(t.typdefaultbin, 0, true) AS domain_default,
  coll.collname AS collation_name
FROM pg_catalog.pg_type AS t
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
LEFT JOIN pg_catalog.pg_collation AS coll ON coll.oid = t.typcollation
WHERE n.nspname = 'public'
  AND t.typtype = 'd'
ORDER BY n.nspname, t.typname;

-- section: domain_constraints
\echo '__SECTION__ domain_constraints'
SELECT
  n.nspname AS schema_name,
  t.typname AS domain_name,
  con.conname AS constraint_name,
  con.convalidated AS is_validated,
  pg_catalog.pg_get_constraintdef(con.oid, true) AS definition
FROM pg_catalog.pg_constraint AS con
JOIN pg_catalog.pg_type AS t ON t.oid = con.contypid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
  AND t.typtype = 'd'
ORDER BY n.nspname, t.typname, con.conname;

-- section: extensions
\echo '__SECTION__ extensions'
SELECT
  e.extname AS extension_name,
  e.extversion AS extension_version,
  n.nspname AS installed_schema,
  e.extrelocatable AS is_relocatable
FROM pg_catalog.pg_extension AS e
JOIN pg_catalog.pg_namespace AS n ON n.oid = e.extnamespace
ORDER BY e.extname;

-- section: extension_capabilities
\echo '__SECTION__ extension_capabilities'
SELECT
  a.name AS extension_name,
  a.default_version,
  a.installed_version,
  (a.installed_version IS NOT NULL) AS is_installed,
  pg_catalog.has_database_privilege(current_database(), 'CREATE') AS current_principal_can_create,
  (pg_catalog.to_regprocedure('gen_random_uuid()') IS NOT NULL) AS gen_random_uuid_available
FROM pg_catalog.pg_available_extensions AS a
WHERE a.name IN ('btree_gist', 'pgcrypto')
ORDER BY a.name;

-- section: extension_relation_dependencies
\echo '__SECTION__ extension_relation_dependencies'
SELECT
  e.extname AS extension_name,
  n.nspname AS schema_name,
  c.relname AS object_name,
  c.relkind AS object_kind
FROM pg_catalog.pg_depend AS dep
JOIN pg_catalog.pg_extension AS e ON e.oid = dep.refobjid
JOIN pg_catalog.pg_class AS c ON c.oid = dep.objid
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE dep.classid = 'pg_catalog.pg_class'::pg_catalog.regclass
  AND dep.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
  AND dep.deptype = 'e'
  AND n.nspname = 'public'
ORDER BY e.extname, n.nspname, c.relname, c.relkind;

-- section: extension_routine_dependencies
\echo '__SECTION__ extension_routine_dependencies'
SELECT
  e.extname AS extension_name,
  n.nspname AS schema_name,
  p.proname AS object_name,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments
FROM pg_catalog.pg_depend AS dep
JOIN pg_catalog.pg_extension AS e ON e.oid = dep.refobjid
JOIN pg_catalog.pg_proc AS p ON p.oid = dep.objid
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE dep.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
  AND dep.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
  AND dep.deptype = 'e'
  AND n.nspname = 'public'
ORDER BY e.extname, n.nspname, p.proname, identity_arguments;

-- section: extension_type_dependencies
\echo '__SECTION__ extension_type_dependencies'
SELECT
  e.extname AS extension_name,
  n.nspname AS schema_name,
  t.typname AS object_name,
  t.typtype AS object_kind
FROM pg_catalog.pg_depend AS dep
JOIN pg_catalog.pg_extension AS e ON e.oid = dep.refobjid
JOIN pg_catalog.pg_type AS t ON t.oid = dep.objid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
WHERE dep.classid = 'pg_catalog.pg_type'::pg_catalog.regclass
  AND dep.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
  AND dep.deptype = 'e'
  AND n.nspname = 'public'
ORDER BY e.extname, n.nspname, t.typname, t.typtype;

-- section: schema_release_runs
\echo '__SECTION__ schema_release_runs'
SELECT (pg_catalog.to_regclass('public.schema_release_runs') IS NOT NULL)::int AS has_schema_release_runs \gset
\if :has_schema_release_runs
SELECT pg_catalog.to_jsonb(r) AS row_json
FROM public.schema_release_runs AS r
ORDER BY pg_catalog.to_jsonb(r)::text;
\else
SELECT NULL::jsonb AS row_json WHERE false;
\endif

-- section: schema_change_ledger
\echo '__SECTION__ schema_change_ledger'
SELECT (pg_catalog.to_regclass('public.schema_change_ledger') IS NOT NULL)::int AS has_schema_change_ledger \gset
\if :has_schema_change_ledger
SELECT pg_catalog.to_jsonb(r) AS row_json
FROM public.schema_change_ledger AS r
ORDER BY pg_catalog.to_jsonb(r)::text;
\else
SELECT NULL::jsonb AS row_json WHERE false;
\endif

-- section: schema_capability_receipts
\echo '__SECTION__ schema_capability_receipts'
SELECT (pg_catalog.to_regclass('public.schema_capability_receipts') IS NOT NULL)::int AS has_schema_capability_receipts \gset
\if :has_schema_capability_receipts
SELECT pg_catalog.to_jsonb(r) AS row_json
FROM public.schema_capability_receipts AS r
ORDER BY pg_catalog.to_jsonb(r)::text;
\else
SELECT NULL::jsonb AS row_json WHERE false;
\endif

ROLLBACK;
\echo '__CATALOG_INSPECTION_COMPLETE__'
