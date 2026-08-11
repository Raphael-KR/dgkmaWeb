DO $$
DECLARE
  observed_definition text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(oid, true)
  INTO observed_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.legacy_cutover_states'::regclass
    AND conname='legacy_cutover_states__cutover_code__key'
    AND contype='u';
  IF observed_definition IS DISTINCT FROM 'UNIQUE (cutover_code)' THEN
    RAISE EXCEPTION 'legacy_cutover_code_parent_contract_mismatch';
  END IF;
END $$;

ALTER TABLE public.schema_release_runs
  DROP CONSTRAINT schema_release_runs__requested_through_sequence__check;
ALTER TABLE public.schema_release_runs
  ADD CONSTRAINT schema_release_runs__requested_through_sequence__check
  CHECK (requested_through_sequence_no IN (1,10,15,20,30,40,50,60,65,70,80,90));

ALTER TABLE public.legacy_cutover_states
  DROP CONSTRAINT legacy_cutover_states__cutover_code__key;
CREATE UNIQUE INDEX legacy_cutover_states__cutover_code__key
  ON public.legacy_cutover_states (cutover_code)
  WHERE version=1;
