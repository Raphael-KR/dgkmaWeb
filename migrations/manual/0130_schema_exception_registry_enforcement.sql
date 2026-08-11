DO $$
DECLARE
  object_count integer;
  exception_count bigint;
BEGIN
  SELECT count(*)::integer INTO object_count
  FROM pg_catalog.pg_proc AS procedure
  JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid=procedure.pronamespace
  WHERE namespace.nspname='public' AND procedure.proname='dgkma_validate_schema_exception_transition_v1';
  IF object_count <> 0 THEN RAISE EXCEPTION 'schema_exception_transition_function_already_exists'; END IF;

  SELECT count(*)::integer INTO object_count
  FROM pg_catalog.pg_trigger
  WHERE tgname='schema_data_exceptions__registry_transition_v1' AND NOT tgisinternal;
  IF object_count <> 0 THEN RAISE EXCEPTION 'schema_exception_transition_trigger_already_exists'; END IF;

  SELECT count(*)::integer INTO object_count
  FROM pg_catalog.pg_constraint
  WHERE conrelid='public.schema_data_exceptions'::regclass
    AND conname=ANY(ARRAY[
      'schema_data_exceptions__rule_code_registry__check',
      'schema_data_exceptions__rule_class_registry__check',
      'schema_data_exceptions__status_resolution__check',
      'schema_data_exceptions__resolution_duplicate__check',
      'schema_data_exceptions__lifecycle_actor__check',
      'schema_data_exceptions__capture_chain__check'
    ]);
  IF object_count <> 0 THEN RAISE EXCEPTION 'schema_exception_registry_constraint_already_exists'; END IF;

  SELECT count(*) INTO exception_count FROM public.schema_data_exceptions;
  IF exception_count <> 0 THEN
    RAISE EXCEPTION 'schema_exception_historical_code_migration_required:%', exception_count;
  END IF;
END $$;

ALTER TABLE public.schema_release_runs
  DROP CONSTRAINT schema_release_runs__requested_through_sequence__check;
ALTER TABLE public.schema_release_runs
  ADD CONSTRAINT schema_release_runs__requested_through_sequence__check
  CHECK (requested_through_sequence_no IN (1,10,15,20,30,40,50,60,65,70,80,90,100,110,120,130));

ALTER TABLE public.schema_data_exceptions
  ADD CONSTRAINT schema_data_exceptions__rule_code_registry__check CHECK (rule_code IN (
    'USERS_EMAIL_CANONICAL_BLANK','USERS_EMAIL_CANONICAL_DUPLICATE','USERS_PHONE_CANONICAL_INVALID','USERS_PHONE_CANONICAL_DUPLICATE','USERS_BIRTHDAY_TYPE_UNKNOWN',
    'CATEGORIES_BADGE_VARIANT_UNKNOWN','CATEGORIES_SORT_ORDER_NEGATIVE','ALUMNI_MOBILE_CANONICAL_INVALID','ALUMNI_MOBILE_CANONICAL_DUPLICATE','ALUMNI_MATCHED_USER_DUPLICATE',
    'COMMUNITY_EVENT_LEGACY_OBITUARY_ORPHAN','COMMUNITY_EVENT_TYPE_UNKNOWN','COMMUNITY_EVENT_STATUS_UNKNOWN','EVENT_PARSE_REQUEST_COUNT_NEGATIVE','EVENT_PARSE_UPDATED_BEFORE_WINDOW',
    'PENDING_EMAIL_BLANK','PENDING_KAKAO_DUPLICATE','PENDING_EMAIL_CANONICAL_DUPLICATE','PENDING_STATUS_NULL','PENDING_STATUS_UNKNOWN','KAKAO_OAUTH_EXPIRES_NOT_AFTER_START',
    'PAYMENTS_AMOUNT_NONPOSITIVE','PAYMENTS_YEAR_OUT_OF_RANGE','PAYMENTS_TYPE_UNKNOWN','PAYMENTS_STATUS_UNKNOWN'
  )),
  ADD CONSTRAINT schema_data_exceptions__rule_class_registry__check CHECK (
    CASE
      WHEN rule_code IN ('PAYMENTS_AMOUNT_NONPOSITIVE','PAYMENTS_YEAR_OUT_OF_RANGE','PAYMENTS_TYPE_UNKNOWN','PAYMENTS_STATUS_UNKNOWN') THEN exception_class='legacy_not_valid'
      WHEN rule_code IN (
        'USERS_EMAIL_CANONICAL_BLANK','USERS_EMAIL_CANONICAL_DUPLICATE','USERS_PHONE_CANONICAL_INVALID','USERS_PHONE_CANONICAL_DUPLICATE','USERS_BIRTHDAY_TYPE_UNKNOWN',
        'CATEGORIES_BADGE_VARIANT_UNKNOWN','CATEGORIES_SORT_ORDER_NEGATIVE','ALUMNI_MOBILE_CANONICAL_INVALID','ALUMNI_MOBILE_CANONICAL_DUPLICATE','ALUMNI_MATCHED_USER_DUPLICATE',
        'COMMUNITY_EVENT_LEGACY_OBITUARY_ORPHAN','COMMUNITY_EVENT_TYPE_UNKNOWN','COMMUNITY_EVENT_STATUS_UNKNOWN','EVENT_PARSE_REQUEST_COUNT_NEGATIVE','EVENT_PARSE_UPDATED_BEFORE_WINDOW',
        'PENDING_EMAIL_BLANK','PENDING_KAKAO_DUPLICATE','PENDING_EMAIL_CANONICAL_DUPLICATE','PENDING_STATUS_NULL','PENDING_STATUS_UNKNOWN','KAKAO_OAUTH_EXPIRES_NOT_AFTER_START'
      ) THEN exception_class='pre_anchor_blocking'
      ELSE false
    END
  ),
  ADD CONSTRAINT schema_data_exceptions__status_resolution__check CHECK (
    (status='open' AND resolution_code IS NULL) OR
    (status='resolved' AND resolution_code IN ('SOURCE_FIXED','DUPLICATE_RESOLVED')) OR
    (status='waived' AND resolution_code='OWNER_WAIVER')
  ),
  ADD CONSTRAINT schema_data_exceptions__resolution_duplicate__check CHECK (
    resolution_code IS DISTINCT FROM 'DUPLICATE_RESOLVED' OR rule_code IN (
      'USERS_EMAIL_CANONICAL_DUPLICATE','USERS_PHONE_CANONICAL_DUPLICATE','ALUMNI_MOBILE_CANONICAL_DUPLICATE',
      'ALUMNI_MATCHED_USER_DUPLICATE','PENDING_KAKAO_DUPLICATE','PENDING_EMAIL_CANONICAL_DUPLICATE'
    )
  ),
  ADD CONSTRAINT schema_data_exceptions__lifecycle_actor__check CHECK (
    (status='open' AND resolved_at IS NULL
      AND resolved_actor_correlation_uid IS NULL AND resolved_actor_uid_snapshot IS NULL AND resolved_actor_name_snapshot IS NULL AND resolved_actor_scope IS NULL AND resolved_actor_authorization_version IS NULL AND resolved_actor_at IS NULL
      AND waive_actor_correlation_uid IS NULL AND waive_actor_uid_snapshot IS NULL AND waive_actor_name_snapshot IS NULL AND waive_actor_scope IS NULL AND waive_actor_authorization_version IS NULL AND waive_actor_at IS NULL)
    OR
    (status='resolved' AND resolved_at IS NOT NULL
      AND resolved_actor_correlation_uid IS NOT NULL AND resolved_actor_uid_snapshot IS NOT NULL AND resolved_actor_name_snapshot IS NOT NULL AND resolved_actor_scope='migration_admin' AND resolved_actor_authorization_version IS NOT NULL AND resolved_actor_at IS NOT NULL
      AND waive_actor_correlation_uid IS NULL AND waive_actor_uid_snapshot IS NULL AND waive_actor_name_snapshot IS NULL AND waive_actor_scope IS NULL AND waive_actor_authorization_version IS NULL AND waive_actor_at IS NULL)
    OR
    (status='waived' AND resolved_at IS NOT NULL
      AND waive_actor_correlation_uid IS NOT NULL AND waive_actor_uid_snapshot IS NOT NULL AND waive_actor_name_snapshot IS NOT NULL AND waive_actor_scope='migration_admin' AND waive_actor_authorization_version IS NOT NULL AND waive_actor_at IS NOT NULL
      AND resolved_actor_correlation_uid IS NULL AND resolved_actor_uid_snapshot IS NULL AND resolved_actor_name_snapshot IS NULL AND resolved_actor_scope IS NULL AND resolved_actor_authorization_version IS NULL AND resolved_actor_at IS NULL)
  ),
  ADD CONSTRAINT schema_data_exceptions__capture_chain__check CHECK (
    (version=1 AND supersedes_id IS NULL AND status='open') OR
    (version>1 AND supersedes_id IS NOT NULL AND status IN ('resolved','waived') AND exception_class='legacy_not_valid')
  );

CREATE FUNCTION public.dgkma_validate_schema_exception_transition_v1()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_row public.schema_data_exceptions%ROWTYPE;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    RAISE EXCEPTION 'schema_exception_append_only:%', TG_OP USING ERRCODE='23514';
  END IF;
  IF NEW.version=1 THEN
    RAISE EXCEPTION 'schema_exception_capture_closed' USING ERRCODE='23514';
  END IF;

  SELECT * INTO parent_row
  FROM public.schema_data_exceptions
  WHERE id=NEW.supersedes_id
  FOR UPDATE;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.schema_data_exceptions WHERE supersedes_id=parent_row.id) THEN
    RAISE EXCEPTION 'schema_exception_parent_not_tip' USING ERRCODE='23514';
  END IF;
  IF parent_row.version<>1 OR parent_row.status<>'open' OR parent_row.exception_class<>'legacy_not_valid'
     OR NEW.version<>parent_row.version+1 OR NEW.exception_uid<>parent_row.exception_uid
     OR NEW.table_name<>parent_row.table_name OR NEW.row_key<>parent_row.row_key
     OR NEW.rule_code<>parent_row.rule_code OR NEW.exception_class<>parent_row.exception_class
     OR NEW.row_digest<>parent_row.row_digest OR NEW.detected_at<>parent_row.detected_at
     OR NEW.effective_at<parent_row.effective_at OR NEW.recorded_at<parent_row.recorded_at THEN
    RAISE EXCEPTION 'schema_exception_transition_invalid' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER schema_data_exceptions__registry_transition_v1
BEFORE INSERT OR UPDATE OR DELETE ON public.schema_data_exceptions
FOR EACH ROW EXECUTE FUNCTION public.dgkma_validate_schema_exception_transition_v1();
