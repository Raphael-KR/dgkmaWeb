DO $$
BEGIN
  IF pg_catalog.to_regprocedure('public.dgkma_guard_legacy_payments_write_v1()') IS NOT NULL THEN
    RAISE EXCEPTION 'legacy_payments_write_fence_function_already_exists';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid='public.payments'::regclass
      AND tgname='legacy_payments_write_fence_v1'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'legacy_payments_write_fence_trigger_already_exists';
  END IF;
END $$;

ALTER TABLE public.schema_release_runs
  DROP CONSTRAINT schema_release_runs__requested_through_sequence__check;
ALTER TABLE public.schema_release_runs
  ADD CONSTRAINT schema_release_runs__requested_through_sequence__check
  CHECK (requested_through_sequence_no IN (1,10,15,20,30,40,50,60,65,70,80,90,100));

CREATE FUNCTION public.dgkma_guard_legacy_payments_write_v1()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_phase text;
BEGIN
  SELECT state.phase
  INTO current_phase
  FROM public.legacy_cutover_states AS state
  WHERE state.cutover_code='payments-v1'
  ORDER BY state.version DESC, state.id DESC
  LIMIT 1;

  IF current_phase IS NULL OR current_phase='legacy' THEN
    IF TG_OP='DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'legacy_payments_write_fenced'
    USING ERRCODE='55000';
END;
$$;

CREATE TRIGGER legacy_payments_write_fence_v1
BEFORE INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.dgkma_guard_legacy_payments_write_v1();
