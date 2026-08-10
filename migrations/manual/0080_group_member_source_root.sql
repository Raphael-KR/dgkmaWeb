DO $$
DECLARE
  observed_definition text;
BEGIN
  SELECT pg_catalog.pg_get_constraintdef(oid, true)
  INTO observed_definition
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.dues_group_members'::regclass
    AND conname='dues_group_members__group_id_source_row_version_id__key'
    AND contype='u';
  IF observed_definition IS DISTINCT FROM 'UNIQUE (group_id, source_row_version_id)' THEN
    RAISE EXCEPTION 'group_member_source_parent_contract_mismatch';
  END IF;
END $$;

ALTER TABLE public.schema_release_runs
  DROP CONSTRAINT schema_release_runs__requested_through_sequence__check;
ALTER TABLE public.schema_release_runs
  ADD CONSTRAINT schema_release_runs__requested_through_sequence__check
  CHECK (requested_through_sequence_no IN (1,10,15,20,30,40,50,60,65,70,80));

ALTER TABLE public.dues_group_members
  DROP CONSTRAINT dues_group_members__group_id_source_row_version_id__key;
CREATE UNIQUE INDEX dues_group_members__group_id_source_row_version_id__key
  ON public.dues_group_members (group_id, source_row_version_id)
  WHERE version=1;
