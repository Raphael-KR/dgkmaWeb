\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION 'Development database required';
  END IF;
END $$;
ALTER TABLE public.posts ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;
COMMIT;
