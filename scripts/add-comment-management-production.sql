\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Production database required';
  END IF;
END $$;
ALTER TABLE public.comments
  ADD COLUMN is_hidden boolean NOT NULL DEFAULT false,
  ADD COLUMN edited_at timestamp without time zone,
  ADD COLUMN revision integer NOT NULL DEFAULT 0,
  ADD COLUMN attachment jsonb,
  ADD CONSTRAINT comments_revision_check CHECK (revision >= 0),
  ADD CONSTRAINT comments_attachment_check CHECK (attachment IS NULL OR (
    jsonb_typeof(attachment) = 'object'
    AND jsonb_typeof(attachment->'objectPath') = 'string'
    AND jsonb_typeof(attachment->'name') = 'string'
    AND jsonb_typeof(attachment->'size') = 'number'
    AND jsonb_typeof(attachment->'contentType') = 'string'
  ) IS TRUE);
COMMIT;
