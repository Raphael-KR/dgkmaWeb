-- Production release candidate. Apply only under docs/database-operations.md.
-- Run before Republish; legacy tables remain until the new app is live.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Expected Production neondb, actual %', current_database();
  END IF;
END $$;
ALTER TABLE public.posts ADD COLUMN event_data jsonb;
ALTER TABLE public.posts ADD COLUMN source_text text;
ALTER TABLE public.posts ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE public.posts ADD COLUMN published_at timestamp;
ALTER TABLE public.posts ADD CONSTRAINT posts_notice_type_check CHECK (
  event_data IS NULL OR (event_data->>'schemaVersion' = '1' AND event_data->>'eventType' IN ('obituary', 'wedding', 'opening')) IS TRUE
);
ALTER TABLE public.posts ADD CONSTRAINT posts_revision_check CHECK (revision >= 0);
CREATE UNIQUE INDEX posts_notice_draft_unique ON public.posts (author_id, (event_data->>'eventType'))
  WHERE is_published = false AND event_data IS NOT NULL;
CREATE TABLE public.source_collection_rules (
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
-- Category data; no existing post, user, alumni or rule rows are rewritten.
INSERT INTO public.categories (name, display_name, color, badge_variant, is_active, sort_order)
VALUES ('obituary', '부고', '#64748b', 'secondary', true, 5),
       ('celebration', '경사', '#db2777', 'secondary', true, 6)
ON CONFLICT (name) DO UPDATE SET display_name = excluded.display_name, is_active = true;
COMMIT;
