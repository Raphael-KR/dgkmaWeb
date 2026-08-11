DO $$
DECLARE
  object_count integer;
  invalid_count bigint;
BEGIN
  SELECT count(*)::integer INTO object_count
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
  WHERE namespace.nspname='public' AND procedure.proname='dgkma_validate_business_reason_transition_v1';
  IF object_count <> 0 THEN
    RAISE EXCEPTION 'business_reason_transition_function_already_exists';
  END IF;

  SELECT count(*)::integer INTO object_count
  FROM pg_catalog.pg_trigger
  WHERE tgname=ANY(ARRAY[
    'dues_receipt_reversals__business_reason_transition_v1',
    'economic_event_authority_decisions__business_reason__87a9478ac7',
    'economic_event_canonicalizations__business_reason_transition_v1',
    'economic_event_collisions__business_reason_transition_v1',
    'legacy_payment_decisions__business_reason_transition_v1',
    'member_identity_link_history__business_reason_transition_v1',
    'member_match_cases__business_reason_transition_v1',
    'mutable_entity_action_history__business_reason_transition_v1'
  ]) AND NOT tgisinternal;
  IF object_count <> 0 THEN
    RAISE EXCEPTION 'business_reason_transition_trigger_already_exists';
  END IF;

  SELECT count(*) INTO invalid_count FROM (
    SELECT 1 FROM public.mutable_entity_action_history
    WHERE NOT CASE
      WHEN action='end' THEN reason_code='MEMBER_ENDED'
      WHEN action='reactivate' THEN reason_code='MEMBER_REACTIVATED'
      WHEN action='correct' AND mutation_actor_scope='admin' THEN reason_code='MEMBER_IDENTITY_CORRECTED'
      WHEN action='correct' AND mutation_actor_scope='member_self' THEN reason_code='ACCOUNT_DELETE_UNLINK'
      WHEN action='reconcile' THEN reason_code='PERIOD_RECONCILE_REQUESTED'
      WHEN action='close' THEN reason_code='PERIOD_CLOSE_APPROVED'
      WHEN action='reopen' THEN reason_code='PERIOD_REOPEN_APPROVED'
      ELSE false END
    UNION ALL
    SELECT 1 FROM public.member_match_cases
    WHERE NOT CASE
      WHEN supersedes_id IS NULL AND status='unmatched' THEN reason_code IN ('SOURCE_MATCH_REQUIRED','MANUAL_MATCH_REQUIRED','NAME_ONLY_UNAPPROVABLE','NO_CANDIDATE')
      WHEN supersedes_id IS NULL AND status='candidate' THEN reason_code IN ('SOURCE_MATCH_REQUIRED','MANUAL_MATCH_REQUIRED','MULTIPLE_CANDIDATES')
      WHEN supersedes_id IS NOT NULL AND decision_actor_correlation_uid IS NOT NULL AND status='approved' THEN reason_code='MATCH_APPROVED'
      WHEN supersedes_id IS NOT NULL AND decision_actor_correlation_uid IS NOT NULL AND status='rejected' THEN reason_code='MATCH_REJECTED'
      WHEN supersedes_id IS NOT NULL AND supersede_actor_correlation_uid IS NOT NULL THEN reason_code='MATCH_SUPERSEDED'
      ELSE false END
    UNION ALL
    SELECT 1 FROM public.member_identity_link_history
    WHERE NOT CASE
      WHEN operation='link' THEN reason_code='IDENTITY_LINKED'
      WHEN operation='correct' THEN reason_code='IDENTITY_CORRECTED'
      WHEN operation='unlink_user' AND decision_actor_scope='admin' THEN reason_code='IDENTITY_USER_UNLINKED'
      WHEN operation='unlink_user' AND decision_actor_scope='member_self' THEN reason_code='ACCOUNT_DELETE_UNLINK'
      WHEN operation='unlink_all' THEN reason_code='IDENTITY_ALL_UNLINKED'
      ELSE false END
    UNION ALL
    SELECT 1 FROM public.economic_event_authority_decisions
    WHERE NOT CASE
      WHEN decision_kind='select' THEN reason_code='HIGHEST_AUTHORITY_SELECTED'
      WHEN decision_kind='supersede' THEN reason_code='HIGHER_AUTHORITY_SUPERSEDED'
      WHEN decision_kind='quarantine' THEN reason_code IN ('AUTHORITY_TIE_QUARANTINED','AUTHORITY_INVALID_QUARANTINED')
      ELSE false END
    UNION ALL
    SELECT 1 FROM public.economic_event_canonicalizations WHERE reason_code<>'CHILDLESS_DUPLICATE_CANONICALIZED'
    UNION ALL
    SELECT 1 FROM public.economic_event_collisions
    WHERE NOT CASE
      WHEN supersedes_id IS NULL AND status='open' THEN reason_code IN ('POTENTIAL_DUPLICATE_OPEN','COLLISION_REVIEW_REQUIRED')
      WHEN supersedes_id IS NOT NULL AND status='open' THEN reason_code='COLLISION_REVIEW_REQUIRED'
      WHEN supersedes_id IS NOT NULL AND status='resolved' THEN reason_code='CHILDLESS_DUPLICATE_RESOLVED'
      ELSE false END
    UNION ALL
    SELECT 1 FROM public.legacy_payment_decisions
    WHERE NOT CASE
      WHEN decision='ineligible' THEN reason_code IN ('LEGACY_USER_NULL','LEGACY_AMOUNT_INVALID','LEGACY_AMOUNT_NONPOSITIVE','LEGACY_YEAR_OUT_OF_RANGE','LEGACY_TYPE_NOT_ANNUAL_DUES','LEGACY_STATUS_NOT_COMPLETED','LEGACY_CREATED_AT_NULL','LEGACY_DATA_EXCEPTION_OPEN')
      WHEN decision='review' THEN reason_code IN ('LEGACY_TIMEZONE_UNRESOLVED','LEGACY_EVIDENCE_AMBIGUOUS')
      WHEN decision='quarantine' THEN reason_code IN ('LEGACY_IDENTITY_AMBIGUOUS','LEGACY_EVIDENCE_AMBIGUOUS')
      WHEN decision='cross_link' THEN reason_code='LEGACY_CROSS_LINK_MATCHED'
      WHEN decision='new_compatibility_event' THEN reason_code='LEGACY_COMPATIBILITY_EVENT_CREATED'
      ELSE false END
    UNION ALL
    SELECT 1 FROM public.dues_receipt_reversals WHERE reason_code<>'BANK_DUES_REFUND'
  ) AS invalid_rows;
  IF invalid_count <> 0 THEN
    RAISE EXCEPTION 'business_reason_transition_existing_rows_invalid:%', invalid_count;
  END IF;
END $$;

ALTER TABLE public.schema_release_runs
  DROP CONSTRAINT schema_release_runs__requested_through_sequence__check;
ALTER TABLE public.schema_release_runs
  ADD CONSTRAINT schema_release_runs__requested_through_sequence__check
  CHECK (requested_through_sequence_no IN (1,10,15,20,30,40,50,60,65,70,80,90,100,110,120));

CREATE FUNCTION public.dgkma_validate_business_reason_transition_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_value jsonb := to_jsonb(NEW);
  reason text := row_value->>'reason_code';
  valid boolean := false;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'mutable_entity_action_history' THEN
      valid := CASE
        WHEN row_value->>'action'='end' THEN reason='MEMBER_ENDED'
        WHEN row_value->>'action'='reactivate' THEN reason='MEMBER_REACTIVATED'
        WHEN row_value->>'action'='correct' AND row_value->>'mutation_actor_scope'='admin' THEN reason='MEMBER_IDENTITY_CORRECTED'
        WHEN row_value->>'action'='correct' AND row_value->>'mutation_actor_scope'='member_self' THEN reason='ACCOUNT_DELETE_UNLINK'
        WHEN row_value->>'action'='reconcile' THEN reason='PERIOD_RECONCILE_REQUESTED'
        WHEN row_value->>'action'='close' THEN reason='PERIOD_CLOSE_APPROVED'
        WHEN row_value->>'action'='reopen' THEN reason='PERIOD_REOPEN_APPROVED'
        ELSE false END;
    WHEN 'member_match_cases' THEN
      valid := CASE
        WHEN row_value->>'supersedes_id' IS NULL AND row_value->>'status'='unmatched' THEN reason=ANY(ARRAY['SOURCE_MATCH_REQUIRED','MANUAL_MATCH_REQUIRED','NAME_ONLY_UNAPPROVABLE','NO_CANDIDATE'])
        WHEN row_value->>'supersedes_id' IS NULL AND row_value->>'status'='candidate' THEN reason=ANY(ARRAY['SOURCE_MATCH_REQUIRED','MANUAL_MATCH_REQUIRED','MULTIPLE_CANDIDATES'])
        WHEN row_value->>'supersedes_id' IS NOT NULL AND row_value->>'decision_actor_correlation_uid' IS NOT NULL AND row_value->>'status'='approved' THEN reason='MATCH_APPROVED'
        WHEN row_value->>'supersedes_id' IS NOT NULL AND row_value->>'decision_actor_correlation_uid' IS NOT NULL AND row_value->>'status'='rejected' THEN reason='MATCH_REJECTED'
        WHEN row_value->>'supersedes_id' IS NOT NULL AND row_value->>'supersede_actor_correlation_uid' IS NOT NULL THEN reason='MATCH_SUPERSEDED'
        ELSE false END;
    WHEN 'member_identity_link_history' THEN
      valid := CASE
        WHEN row_value->>'operation'='link' THEN reason='IDENTITY_LINKED'
        WHEN row_value->>'operation'='correct' THEN reason='IDENTITY_CORRECTED'
        WHEN row_value->>'operation'='unlink_user' AND row_value->>'decision_actor_scope'='admin' THEN reason='IDENTITY_USER_UNLINKED'
        WHEN row_value->>'operation'='unlink_user' AND row_value->>'decision_actor_scope'='member_self' THEN reason='ACCOUNT_DELETE_UNLINK'
        WHEN row_value->>'operation'='unlink_all' THEN reason='IDENTITY_ALL_UNLINKED'
        ELSE false END;
    WHEN 'economic_event_authority_decisions' THEN
      valid := CASE
        WHEN row_value->>'decision_kind'='select' THEN reason='HIGHEST_AUTHORITY_SELECTED'
        WHEN row_value->>'decision_kind'='supersede' THEN reason='HIGHER_AUTHORITY_SUPERSEDED'
        WHEN row_value->>'decision_kind'='quarantine' THEN reason=ANY(ARRAY['AUTHORITY_TIE_QUARANTINED','AUTHORITY_INVALID_QUARANTINED'])
        ELSE false END;
    WHEN 'economic_event_canonicalizations' THEN valid := reason='CHILDLESS_DUPLICATE_CANONICALIZED';
    WHEN 'economic_event_collisions' THEN
      valid := CASE
        WHEN row_value->>'supersedes_id' IS NULL AND row_value->>'status'='open' THEN reason=ANY(ARRAY['POTENTIAL_DUPLICATE_OPEN','COLLISION_REVIEW_REQUIRED'])
        WHEN row_value->>'supersedes_id' IS NOT NULL AND row_value->>'status'='open' THEN reason='COLLISION_REVIEW_REQUIRED'
        WHEN row_value->>'supersedes_id' IS NOT NULL AND row_value->>'status'='resolved' THEN reason='CHILDLESS_DUPLICATE_RESOLVED'
        ELSE false END;
    WHEN 'legacy_payment_decisions' THEN
      valid := CASE
        WHEN row_value->>'decision'='ineligible' THEN reason=ANY(ARRAY['LEGACY_USER_NULL','LEGACY_AMOUNT_INVALID','LEGACY_AMOUNT_NONPOSITIVE','LEGACY_YEAR_OUT_OF_RANGE','LEGACY_TYPE_NOT_ANNUAL_DUES','LEGACY_STATUS_NOT_COMPLETED','LEGACY_CREATED_AT_NULL','LEGACY_DATA_EXCEPTION_OPEN'])
        WHEN row_value->>'decision'='review' THEN reason=ANY(ARRAY['LEGACY_TIMEZONE_UNRESOLVED','LEGACY_EVIDENCE_AMBIGUOUS'])
        WHEN row_value->>'decision'='quarantine' THEN reason=ANY(ARRAY['LEGACY_IDENTITY_AMBIGUOUS','LEGACY_EVIDENCE_AMBIGUOUS'])
        WHEN row_value->>'decision'='cross_link' THEN reason='LEGACY_CROSS_LINK_MATCHED'
        WHEN row_value->>'decision'='new_compatibility_event' THEN reason='LEGACY_COMPATIBILITY_EVENT_CREATED'
        ELSE false END;
    WHEN 'dues_receipt_reversals' THEN valid := reason='BANK_DUES_REFUND';
    ELSE valid := false;
  END CASE;
  IF valid IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'business_reason_transition_invalid:%:%:%', TG_TABLE_NAME, TG_OP, coalesce(reason,'<null>') USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER mutable_entity_action_history__business_reason_transition_v1 BEFORE INSERT OR UPDATE ON public.mutable_entity_action_history FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_business_reason_transition_v1();
CREATE TRIGGER member_match_cases__business_reason_transition_v1 BEFORE INSERT OR UPDATE ON public.member_match_cases FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_business_reason_transition_v1();
CREATE TRIGGER member_identity_link_history__business_reason_transition_v1 BEFORE INSERT OR UPDATE ON public.member_identity_link_history FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_business_reason_transition_v1();
CREATE TRIGGER economic_event_authority_decisions__business_reason__87a9478ac7 BEFORE INSERT OR UPDATE ON public.economic_event_authority_decisions FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_business_reason_transition_v1();
CREATE TRIGGER economic_event_canonicalizations__business_reason_transition_v1 BEFORE INSERT OR UPDATE ON public.economic_event_canonicalizations FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_business_reason_transition_v1();
CREATE TRIGGER economic_event_collisions__business_reason_transition_v1 BEFORE INSERT OR UPDATE ON public.economic_event_collisions FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_business_reason_transition_v1();
CREATE TRIGGER legacy_payment_decisions__business_reason_transition_v1 BEFORE INSERT OR UPDATE ON public.legacy_payment_decisions FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_business_reason_transition_v1();
CREATE TRIGGER dues_receipt_reversals__business_reason_transition_v1 BEFORE INSERT OR UPDATE ON public.dues_receipt_reversals FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_business_reason_transition_v1();
