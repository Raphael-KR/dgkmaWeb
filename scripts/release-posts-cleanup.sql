-- Requires explicit approval for these two table drops and verified Republish.
-- Snapshot and recheck counts/dependencies per docs/database-operations.md first.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$ BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Expected Production neondb, actual %', current_database();
  END IF;
END $$;
LOCK TABLE public.community_events, public.obituaries IN ACCESS EXCLUSIVE MODE;
DO $$ DECLARE events_count bigint; obituaries_count bigint;
BEGIN
  SELECT count(*) INTO events_count FROM public.community_events;
  SELECT count(*) INTO obituaries_count FROM public.obituaries;
  IF events_count <> 0 OR obituaries_count <> 0 THEN
    RAISE EXCEPTION 'Expected empty legacy tables, actual community_events=%, obituaries=%', events_count, obituaries_count;
  END IF;
END $$;
DROP TABLE public.community_events;
DROP TABLE public.obituaries;
COMMIT;
