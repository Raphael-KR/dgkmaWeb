-- Candidate migration for the Replit development workspace. Run only after approval.
\set ON_ERROR_STOP on
\set VERBOSITY terse
\set workspace ''
\set deployment ''
\set development_host ''
\set development_db ''
\set development_user ''
\getenv workspace REPL_ID
\getenv deployment REPLIT_DEPLOYMENT
\getenv development_host PGHOST
\getenv development_db PGDATABASE
\getenv development_user PGUSER

BEGIN;
SET LOCAL lock_timeout = '8s';
SET LOCAL search_path = pg_temp, pg_catalog;
SELECT current_database() = 'heliumdb'
   AND current_database() = :'development_db' AND current_user = :'development_user'
   AND :'workspace' = 'dc5e5541-525b-4ad6-b914-2d2db70cb4a9'
   AND :'deployment' <> '1' AND :'development_host' <> '' AND :'HOST' = :'development_host'
   AND pg_typeof((SELECT id FROM public.users LIMIT 0)) = 'uuid'::regtype AS development_target
\gset
\if :development_target
\else
DO $$ BEGIN RAISE EXCEPTION 'Replit development database required'; END $$;
\endif

\ir lib/dues-ledger-contract.sql
COMMIT;
