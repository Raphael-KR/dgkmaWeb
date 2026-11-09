-- Development-only transition. Existing notice rows and legacy URLs are discarded.
-- Runbook: docs/database-operations.md (2026-11-09). No CASCADE and no migration.
\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION 'This transition is restricted to the Development Database';
  END IF;
END $$;
ALTER TABLE posts ADD COLUMN event_data jsonb;
ALTER TABLE posts ADD COLUMN source_text text;
ALTER TABLE posts ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE posts ADD COLUMN published_at timestamp;
ALTER TABLE posts ADD CONSTRAINT posts_notice_type_check CHECK (
  event_data IS NULL OR (event_data->>'schemaVersion' = '1' AND event_data->>'eventType' IN ('obituary', 'wedding', 'opening')) IS TRUE
);
ALTER TABLE posts ADD CONSTRAINT posts_revision_check CHECK (revision >= 0);
CREATE UNIQUE INDEX posts_notice_draft_unique ON posts (author_id, (event_data->>'eventType'))
  WHERE is_published = false AND event_data IS NOT NULL;
INSERT INTO categories (name, display_name, color, badge_variant, is_active, sort_order)
VALUES ('obituary', '부고', '#64748b', 'secondary', true, 5),
       ('celebration', '경사', '#db2777', 'secondary', true, 6)
ON CONFLICT (name) DO UPDATE SET display_name = excluded.display_name, is_active = true;
DROP TABLE community_events;
DROP TABLE obituaries;
COMMIT;
