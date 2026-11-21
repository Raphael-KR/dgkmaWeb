\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '8s';
DO $guard$
BEGIN
  IF current_database() <> 'heliumdb'
     OR pg_typeof((SELECT id FROM public.users LIMIT 0)) <> 'uuid'::regtype THEN
    RAISE EXCEPTION 'Development UUID database required';
  END IF;
END
$guard$;

ALTER TABLE public.users
  ADD COLUMN department text,
  ADD COLUMN generation text,
  ADD COLUMN alumni_name text,
  ADD COLUMN admission_date text,
  ADD COLUMN graduation_date text,
  ADD COLUMN alumni_mobile text,
  ADD COLUMN alumni_group text,
  ADD COLUMN alumni_status text,
  ADD COLUMN alumni_position text,
  ADD COLUMN alumni_memo text;
COMMIT;
