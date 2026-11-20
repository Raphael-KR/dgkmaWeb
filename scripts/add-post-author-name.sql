\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF current_database() <> 'heliumdb' THEN RAISE EXCEPTION 'Expected development heliumdb'; END IF;
END $$;
ALTER TABLE posts ADD COLUMN author_name text;
COMMIT;
