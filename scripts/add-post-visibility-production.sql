\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Production database required';
  END IF;
END $$;
ALTER TABLE public.posts ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
COMMIT;
