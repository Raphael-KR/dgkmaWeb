\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $guard$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION 'development database required';
  END IF;
END $guard$;
LOCK TABLE users, alumni_database IN SHARE MODE;
LOCK TABLE alumni_name_aliases IN ACCESS EXCLUSIVE MODE;

-- The original row and all of its attributes stay in place. The old FK supplies
-- the owner, including for names shared by several different people.
CREATE FUNCTION pg_temp.roster_owner(old_id integer) RETURNS uuid
LANGUAGE sql STABLE STRICT AS $fn$
  SELECT u.id FROM alumni_database a JOIN users u ON u.id = a.matched_user_id
  WHERE a.id = old_id AND u.alumni_name IS NOT NULL
$fn$;
ALTER TABLE alumni_name_aliases
  DROP CONSTRAINT alumni_name_aliases_alumni_id_alumni_database_id_fk,
  ALTER COLUMN alumni_id TYPE uuid USING pg_temp.roster_owner(alumni_id);
ALTER TABLE alumni_name_aliases RENAME COLUMN alumni_id TO user_id;
ALTER TABLE alumni_name_aliases ADD CONSTRAINT alumni_name_aliases_user_id_users_id_fk
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
COMMIT;
