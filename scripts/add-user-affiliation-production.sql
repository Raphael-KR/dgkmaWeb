\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF current_database() <> 'neondb'
     OR pg_typeof((SELECT id FROM public.users LIMIT 0)) <> 'uuid'::regtype THEN
    RAISE EXCEPTION 'Production UUID database required';
  END IF;
END
$guard$;

ALTER TABLE public.users
  ADD COLUMN affiliation text,
  ADD COLUMN affiliation_title text;

COMMIT;
