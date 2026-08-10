DO $$
DECLARE
  observed_definition text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(oid, true)
  INTO observed_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.economic_event_claims'::regclass
    AND conname='economic_event_claims__coordinate_id__key'
    AND contype='u';
  IF observed_definition IS DISTINCT FROM 'UNIQUE (coordinate_id)' THEN
    RAISE EXCEPTION 'event_claim_coordinate_parent_contract_mismatch';
  END IF;
END $$;

ALTER TABLE public.schema_release_runs
  DROP CONSTRAINT schema_release_runs__requested_through_sequence__check;
ALTER TABLE public.schema_release_runs
  ADD CONSTRAINT schema_release_runs__requested_through_sequence__check
  CHECK (requested_through_sequence_no IN (1,10,15,20,30,40,50,60,65,70));

ALTER TABLE public.economic_event_claims
  DROP CONSTRAINT economic_event_claims__coordinate_id__key;
CREATE UNIQUE INDEX economic_event_claims__coordinate_id__key
  ON public.economic_event_claims (coordinate_id)
  WHERE version=1;
