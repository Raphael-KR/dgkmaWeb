DO $$
DECLARE
  constraint_name text;
BEGIN
  FOREACH constraint_name IN ARRAY ARRAY[
    'dues_receipt_reversals__reason_code__check',
    'economic_event_authority_decisions__reason_code__check',
    'economic_event_canonicalizations__reason_code__check',
    'economic_event_collisions__reason_code__check',
    'legacy_payment_decisions__reason_code__check',
    'member_identity_link_history__reason_code__check',
    'member_match_cases__reason_code__check',
    'mutable_entity_action_history__reason_code__check'
  ] LOOP
    IF EXISTS (SELECT 1 FROM pg_catalog.pg_constraint WHERE conname=constraint_name) THEN
      RAISE EXCEPTION 'business_reason_constraint_already_exists:%', constraint_name;
    END IF;
  END LOOP;
END $$;

ALTER TABLE public.schema_release_runs
  DROP CONSTRAINT schema_release_runs__requested_through_sequence__check;
ALTER TABLE public.schema_release_runs
  ADD CONSTRAINT schema_release_runs__requested_through_sequence__check
  CHECK (requested_through_sequence_no IN (1,10,15,20,30,40,50,60,65,70,80,90,100,110));

ALTER TABLE public.dues_receipt_reversals
  ADD CONSTRAINT dues_receipt_reversals__reason_code__check
  CHECK (reason_code IN ('BANK_DUES_REFUND'));
ALTER TABLE public.economic_event_authority_decisions
  ADD CONSTRAINT economic_event_authority_decisions__reason_code__check
  CHECK (reason_code IN ('AUTHORITY_INVALID_QUARANTINED','AUTHORITY_TIE_QUARANTINED','HIGHER_AUTHORITY_SUPERSEDED','HIGHEST_AUTHORITY_SELECTED'));
ALTER TABLE public.economic_event_canonicalizations
  ADD CONSTRAINT economic_event_canonicalizations__reason_code__check
  CHECK (reason_code IN ('CHILDLESS_DUPLICATE_CANONICALIZED'));
ALTER TABLE public.economic_event_collisions
  ADD CONSTRAINT economic_event_collisions__reason_code__check
  CHECK (reason_code IN ('CHILDLESS_DUPLICATE_RESOLVED','COLLISION_REVIEW_REQUIRED','POTENTIAL_DUPLICATE_OPEN'));
ALTER TABLE public.legacy_payment_decisions
  ADD CONSTRAINT legacy_payment_decisions__reason_code__check
  CHECK (reason_code IN ('LEGACY_AMOUNT_INVALID','LEGACY_AMOUNT_NONPOSITIVE','LEGACY_COMPATIBILITY_EVENT_CREATED','LEGACY_CREATED_AT_NULL','LEGACY_CROSS_LINK_MATCHED','LEGACY_DATA_EXCEPTION_OPEN','LEGACY_EVIDENCE_AMBIGUOUS','LEGACY_IDENTITY_AMBIGUOUS','LEGACY_STATUS_NOT_COMPLETED','LEGACY_TIMEZONE_UNRESOLVED','LEGACY_TYPE_NOT_ANNUAL_DUES','LEGACY_USER_NULL','LEGACY_YEAR_OUT_OF_RANGE'));
ALTER TABLE public.member_identity_link_history
  ADD CONSTRAINT member_identity_link_history__reason_code__check
  CHECK (reason_code IN ('ACCOUNT_DELETE_UNLINK','IDENTITY_ALL_UNLINKED','IDENTITY_CORRECTED','IDENTITY_LINKED','IDENTITY_USER_UNLINKED'));
ALTER TABLE public.member_match_cases
  ADD CONSTRAINT member_match_cases__reason_code__check
  CHECK (reason_code IN ('MANUAL_MATCH_REQUIRED','MATCH_APPROVED','MATCH_REJECTED','MATCH_SUPERSEDED','MULTIPLE_CANDIDATES','NAME_ONLY_UNAPPROVABLE','NO_CANDIDATE','SOURCE_MATCH_REQUIRED'));
ALTER TABLE public.mutable_entity_action_history
  ADD CONSTRAINT mutable_entity_action_history__reason_code__check
  CHECK (reason_code IN ('ACCOUNT_DELETE_UNLINK','MEMBER_ENDED','MEMBER_IDENTITY_CORRECTED','MEMBER_REACTIVATED','PERIOD_CLOSE_APPROVED','PERIOD_RECONCILE_REQUESTED','PERIOD_REOPEN_APPROVED'));
