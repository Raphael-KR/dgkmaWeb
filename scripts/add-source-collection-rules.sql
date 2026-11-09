\set ON_ERROR_STOP on
SELECT current_database() = 'heliumdb' AS is_development \gset
\if :is_development
BEGIN;
CREATE TABLE source_collection_rules (
  id serial PRIMARY KEY,
  domain text NOT NULL,
  page_pattern text NOT NULL,
  rule jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz NOT NULL,
  CONSTRAINT source_collection_rules_domain_pattern_unique UNIQUE(domain,page_pattern),
  CONSTRAINT source_collection_rules_version_check CHECK(version>0),
  CONSTRAINT source_collection_rules_json_check CHECK((jsonb_typeof(rule)='object' AND rule->>'schemaVersion'='1') IS TRUE)
);
COMMIT;
\else
\echo 'Refusing source rules schema change outside Development heliumdb'
\quit 1
\endif
