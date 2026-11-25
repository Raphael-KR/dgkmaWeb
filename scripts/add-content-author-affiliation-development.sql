\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '8s';

DO $guard$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION 'Expected the development database';
  END IF;
END
$guard$;

ALTER TABLE public.posts ADD COLUMN author_affiliation text;
ALTER TABLE public.comments ADD COLUMN author_affiliation text;

COMMIT;
