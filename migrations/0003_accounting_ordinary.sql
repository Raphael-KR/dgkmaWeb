CREATE TABLE public."business_operation_receipts" (
  "action" text NOT NULL,
  "actor_name_snapshot" text NOT NULL,
  "actor_scope" text NOT NULL,
  "actor_target_user_id" integer,
  "actor_target_user_id_snapshot" integer,
  "actor_uid_snapshot" uuid NOT NULL,
  "actor_user_id" integer,
  "actor_user_id_snapshot" integer NOT NULL,
  "authorization_version" char(64) NOT NULL,
  "canonical_payload" jsonb NOT NULL,
  "entity_type" text NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "operation_uid" uuid NOT NULL,
  "payload_sha256" char(64) NOT NULL,
  "recorded_at" timestamptz NOT NULL,
  "result_entity_keys" jsonb NOT NULL,
  "root_correlation_uid" uuid NOT NULL,
  "target_fingerprint" char(64) NOT NULL
);

CREATE TABLE public."business_operation_entities" (
  "action_correlation_uid" uuid NOT NULL,
  "entity_action" text NOT NULL,
  "entity_key" text NOT NULL,
  "entity_type" text NOT NULL,
  "operation_uid" uuid NOT NULL,
  "ordinal" integer NOT NULL
);

CREATE TABLE public."mutable_entity_action_history" (
  "accounting_period_id" bigint,
  "action" text NOT NULL,
  "after_digest" char(64) NOT NULL,
  "association_member_id" bigint,
  "before_digest" char(64) NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "from_state" text NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "mutation_actor_at" timestamptz NOT NULL,
  "mutation_actor_authorization_version" char(64) NOT NULL,
  "mutation_actor_correlation_uid" uuid NOT NULL,
  "mutation_actor_name_snapshot" text NOT NULL,
  "mutation_actor_scope" text NOT NULL,
  "mutation_actor_uid_snapshot" uuid NOT NULL,
  "mutation_actor_user_id" integer,
  "mutation_no" integer NOT NULL,
  "reason_code" text NOT NULL,
  "to_state" text NOT NULL
);

CREATE TABLE public."member_activity_events" (
  "activity_actor_at" timestamptz NOT NULL,
  "activity_actor_authorization_version" char(64) NOT NULL,
  "activity_actor_name_snapshot" text NOT NULL,
  "activity_actor_scope" text NOT NULL,
  "activity_actor_uid_snapshot" uuid NOT NULL,
  "activity_actor_user_id" integer,
  "activity_no" integer NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "member_id" bigint NOT NULL,
  "mutation_history_id" bigint,
  "state" text NOT NULL
);

CREATE TABLE public."association_members" (
  "alumni_record_id" integer,
  "display_name" text NOT NULL,
  "ended_at" timestamptz,
  "generation" text NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "joined_at" timestamptz NOT NULL,
  "member_kind" text NOT NULL,
  "member_uid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "status" text NOT NULL,
  "user_id" integer
);

CREATE TABLE public."member_match_cases" (
  "case_uid" uuid NOT NULL,
  "decision_actor_at" timestamptz,
  "decision_actor_authorization_version" char(64),
  "decision_actor_correlation_uid" uuid,
  "decision_actor_name_snapshot" text,
  "decision_actor_scope" text,
  "decision_actor_uid_snapshot" uuid,
  "decision_actor_user_id" integer,
  "decision_item_id" bigint,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "opened_at" timestamptz NOT NULL,
  "reason_code" text NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "source_row_version_id" bigint,
  "status" text NOT NULL,
  "subject_generation_snapshot" text,
  "subject_kind" text NOT NULL,
  "subject_name_digest" char(64) NOT NULL,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."member_match_candidates" (
  "case_uid_snapshot" uuid NOT NULL,
  "decision_actor_at" timestamptz,
  "decision_actor_authorization_version" char(64),
  "decision_actor_correlation_uid" uuid,
  "decision_actor_name_snapshot" text,
  "decision_actor_scope" text,
  "decision_actor_uid_snapshot" uuid,
  "decision_actor_user_id" integer,
  "decision_item_id" bigint,
  "evidence_digest" char(64) NOT NULL,
  "evidence_kind" text NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "member_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "root_case_id" bigint NOT NULL,
  "score_basis" text NOT NULL,
  "status" text NOT NULL
);

CREATE TABLE public."member_identity_link_history" (
  "alumni_id_snapshot" integer,
  "decision_actor_at" timestamptz NOT NULL,
  "decision_actor_authorization_version" char(64) NOT NULL,
  "decision_actor_correlation_uid" uuid NOT NULL,
  "decision_actor_name_snapshot" text NOT NULL,
  "decision_actor_scope" text NOT NULL,
  "decision_actor_uid_snapshot" uuid NOT NULL,
  "decision_actor_user_id" integer,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "link_kind" text NOT NULL,
  "link_uid" uuid NOT NULL,
  "linked_alumni_record_id_snapshot" integer,
  "linked_user_id_snapshot" integer,
  "member_id" bigint NOT NULL,
  "operation" text NOT NULL,
  "reason_code" text NOT NULL,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "result_link_kind" text NOT NULL,
  "supersedes_id" bigint,
  "user_uid_snapshot" uuid,
  "version" integer NOT NULL
);

CREATE TABLE public."member_position_assignments" (
  "administration_no" integer NOT NULL,
  "appointment_basis" text NOT NULL,
  "assignment_uid" uuid NOT NULL,
  "date_precision" text NOT NULL,
  "decision_item_id" bigint,
  "display_position" text NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "effective_from" timestamptz NOT NULL,
  "effective_to" timestamptz,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "match_candidate_id" bigint,
  "match_case_id" bigint,
  "member_id" bigint NOT NULL,
  "override_reason" text,
  "position_code" text NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "source_appointment_date" date,
  "source_date_text" text NOT NULL,
  "source_row_version_id" bigint,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."dues_position_tier_mappings" (
  "adds_obligation" boolean NOT NULL,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "approved_at" timestamptz,
  "dues_year" integer NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "policy_id" bigint,
  "position_code" text NOT NULL,
  "priority" integer NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "source_logical_id" bigint NOT NULL,
  "source_row_version_id" bigint,
  "status" text NOT NULL,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer,
  "supersedes_id" bigint,
  "tier_code" text,
  "version" integer NOT NULL
);

CREATE TABLE public."member_dues_tier_history" (
  "basis_assignment_id" bigint,
  "derivation_digest" char(64) NOT NULL,
  "derived_actor_at" timestamptz NOT NULL,
  "derived_actor_authorization_version" char(64) NOT NULL,
  "derived_actor_correlation_uid" uuid NOT NULL,
  "derived_actor_name_snapshot" text NOT NULL,
  "derived_actor_scope" text NOT NULL,
  "derived_actor_uid_snapshot" uuid NOT NULL,
  "derived_actor_user_id" integer,
  "dues_year" integer NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "mapping_id" bigint NOT NULL,
  "member_id" bigint NOT NULL,
  "obligation_from" date NOT NULL,
  "obligation_to" date NOT NULL,
  "policy_id" bigint NOT NULL,
  "priority" integer NOT NULL,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "supersedes_id" bigint,
  "tier_code" text NOT NULL,
  "version" integer NOT NULL
);

CREATE TABLE public."dues_policies" (
  "annual_minimum" bigint NOT NULL,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "approved_at" timestamptz,
  "due_day" integer NOT NULL,
  "dues_year" integer NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "monthly_minimum" bigint NOT NULL,
  "priority" integer NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "reminder_day" integer NOT NULL,
  "resolution_ref" text,
  "source_logical_id" bigint NOT NULL,
  "source_row_version_id" bigint,
  "status" text NOT NULL,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer,
  "supersedes_id" bigint,
  "tier_code" text NOT NULL,
  "version" integer NOT NULL
);

CREATE TABLE public."dues_pledges" (
  "derivation_digest" char(64) NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "effective_from" date NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "mapping_id" bigint NOT NULL,
  "member_id" bigint NOT NULL,
  "monthly_amount" bigint NOT NULL,
  "origin_kind" text NOT NULL,
  "policy_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "status" text NOT NULL,
  "supersedes_id" bigint,
  "tier_history_id" bigint NOT NULL,
  "version" integer NOT NULL
);

CREATE TABLE public."member_assessments" (
  "amount" bigint NOT NULL,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "assessment_uid" uuid NOT NULL,
  "burden_kind" text NOT NULL,
  "due_date" date NOT NULL,
  "dues_year" integer NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "member_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "resolution_ref" text,
  "reversal_actor_at" timestamptz,
  "reversal_actor_authorization_version" char(64),
  "reversal_actor_correlation_uid" uuid,
  "reversal_actor_name_snapshot" text,
  "reversal_actor_scope" text,
  "reversal_actor_uid_snapshot" uuid,
  "reversal_actor_user_id" integer,
  "rights_effect" text NOT NULL,
  "status" text NOT NULL,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."dues_status_snapshots" (
  "annual_required" bigint NOT NULL,
  "assessment_derivation_digest" char(64) NOT NULL,
  "dues_year" integer NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "evaluation_date" date NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "member_id" bigint NOT NULL,
  "monthly_required_to_date" bigint NOT NULL,
  "paid_total" bigint NOT NULL,
  "pledge_derivation_digest" char(64) NOT NULL,
  "pledge_id" bigint NOT NULL,
  "pledge_shortfall" bigint NOT NULL,
  "pledge_target_to_date" bigint NOT NULL,
  "policy_id" bigint NOT NULL,
  "policy_shortfall" bigint NOT NULL,
  "reason_code" text NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "rights_paid_total" bigint NOT NULL,
  "rights_required_to_date" bigint NOT NULL,
  "rights_status" text NOT NULL,
  "special_assessment_paid" bigint NOT NULL,
  "special_assessment_required" bigint NOT NULL,
  "special_assessment_rights_paid" bigint NOT NULL,
  "special_assessment_rights_required" bigint NOT NULL,
  "supersedes_id" bigint,
  "tier_history_id" bigint NOT NULL,
  "version" integer NOT NULL
);

CREATE TABLE public."accounting_logical_sources" (
  "authority_role" text NOT NULL,
  "contract_fingerprint" char(64) NOT NULL,
  "display_name" text NOT NULL,
  "event_authority_rank" integer NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "source_code" text NOT NULL,
  "source_kind" text NOT NULL,
  "source_locator" text NOT NULL,
  "source_timezone" text NOT NULL,
  "source_uid" uuid NOT NULL,
  "status" text NOT NULL,
  "valid_from" date,
  "valid_to" date
);

CREATE TABLE public."accounting_source_releases" (
  "adapter_code" text NOT NULL,
  "adapter_version" text NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "logical_source_id" bigint NOT NULL,
  "mapping_approval_receipt_sha256" char(64) NOT NULL,
  "mapping_table_sha256" char(64) NOT NULL,
  "normalization_implementation_sha256" char(64) NOT NULL,
  "normalized_schema_sha256" char(64) NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "release_uid" uuid NOT NULL,
  "released_at" timestamptz NOT NULL,
  "status" text NOT NULL
);

CREATE TABLE public."bank_source_account_mappings" (
  "account_code_snapshot" text NOT NULL,
  "account_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "logical_source_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "source_code_snapshot" text NOT NULL
);

CREATE TABLE public."accounting_import_batches" (
  "applied_at" timestamptz,
  "apply_actor_at" timestamptz,
  "apply_actor_authorization_version" char(64),
  "apply_actor_correlation_uid" uuid,
  "apply_actor_name_snapshot" text,
  "apply_actor_scope" text,
  "apply_actor_uid_snapshot" uuid,
  "apply_actor_user_id" integer,
  "batch_uid" uuid NOT NULL,
  "captured_timezone" text NOT NULL,
  "coverage_from" timestamptz NOT NULL,
  "coverage_through" timestamptz NOT NULL,
  "error_count" integer NOT NULL,
  "failed_at" timestamptz,
  "failure_actor_at" timestamptz,
  "failure_actor_authorization_version" char(64),
  "failure_actor_correlation_uid" uuid,
  "failure_actor_name_snapshot" text,
  "failure_actor_scope" text,
  "failure_actor_uid_snapshot" uuid,
  "failure_actor_user_id" integer,
  "failure_code" text,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "preview_actor_at" timestamptz,
  "preview_actor_authorization_version" char(64),
  "preview_actor_correlation_uid" uuid,
  "preview_actor_name_snapshot" text,
  "preview_actor_scope" text,
  "preview_actor_uid_snapshot" uuid,
  "preview_actor_user_id" integer,
  "preview_manifest" jsonb NOT NULL,
  "preview_manifest_sha256" char(64) NOT NULL,
  "previewed_at" timestamptz NOT NULL,
  "row_count" integer NOT NULL,
  "source_fingerprint" char(64) NOT NULL,
  "source_release_id" bigint NOT NULL,
  "source_revision" text NOT NULL,
  "status" text NOT NULL,
  "warning_count" integer NOT NULL
);

CREATE TABLE public."accounting_import_coordinates" (
  "coordinate_key" text NOT NULL,
  "coordinate_normalization_version" text NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "logical_source_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer
);

CREATE TABLE public."accounting_import_row_versions" (
  "batch_id" bigint NOT NULL,
  "content_digest" char(64) NOT NULL,
  "coordinate_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "issue_status" text NOT NULL,
  "normalization_version" text NOT NULL,
  "normalized_payload" jsonb NOT NULL,
  "raw_payload" jsonb NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz NOT NULL,
  "source_display_snapshot" text NOT NULL,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."accounting_import_batch_rows" (
  "batch_id" bigint NOT NULL,
  "coordinate_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "ordinal" integer NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "row_version_id" bigint NOT NULL
);

CREATE TABLE public."source_decision_sets" (
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "batch_id" bigint NOT NULL,
  "decision_set_uid" uuid NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "manifest" jsonb NOT NULL,
  "manifest_sha256" char(64) NOT NULL,
  "preview_actor_at" timestamptz,
  "preview_actor_authorization_version" char(64),
  "preview_actor_correlation_uid" uuid,
  "preview_actor_name_snapshot" text,
  "preview_actor_scope" text,
  "preview_actor_uid_snapshot" uuid,
  "preview_actor_user_id" integer,
  "rejection_actor_at" timestamptz,
  "rejection_actor_authorization_version" char(64),
  "rejection_actor_correlation_uid" uuid,
  "rejection_actor_name_snapshot" text,
  "rejection_actor_scope" text,
  "rejection_actor_uid_snapshot" uuid,
  "rejection_actor_user_id" integer,
  "status" text NOT NULL,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer
);

CREATE TABLE public."source_decision_items" (
  "coordinate_id" bigint NOT NULL,
  "decision_kind" text NOT NULL,
  "decision_payload" jsonb NOT NULL,
  "decision_payload_sha256" char(64) NOT NULL,
  "decision_set_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "ordinal" integer NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "source_row_version_id" bigint NOT NULL
);

CREATE TABLE public."economic_event_parties" (
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "party_kind" text NOT NULL,
  "party_uid" uuid NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "stable_code" text,
  "status" text NOT NULL
);

CREATE TABLE public."economic_event_party_aliases" (
  "decision_item_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "party_digest" char(64) NOT NULL,
  "party_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "source_row_version_id" bigint NOT NULL
);

CREATE TABLE public."source_row_classification_decisions" (
  "category_splits" jsonb NOT NULL,
  "classification_kind" text NOT NULL,
  "classification_uid" uuid NOT NULL,
  "coordinate_id" bigint NOT NULL,
  "decision_actor_at" timestamptz,
  "decision_actor_authorization_version" char(64),
  "decision_actor_correlation_uid" uuid,
  "decision_actor_name_snapshot" text,
  "decision_actor_scope" text,
  "decision_actor_uid_snapshot" uuid,
  "decision_actor_user_id" integer,
  "decision_item_id" bigint NOT NULL,
  "decision_payload_sha256" char(64) NOT NULL,
  "direction" text NOT NULL,
  "dues_year" integer,
  "effective_at" timestamptz NOT NULL,
  "event_kind" text NOT NULL,
  "event_party_id" bigint,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "member_id" bigint,
  "member_match_candidate_id" bigint,
  "member_match_case_id" bigint,
  "member_match_decision_item_id" bigint,
  "party_kind" text NOT NULL,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "refund_receipt_id" bigint,
  "resolve_actor_at" timestamptz,
  "resolve_actor_authorization_version" char(64),
  "resolve_actor_correlation_uid" uuid,
  "resolve_actor_name_snapshot" text,
  "resolve_actor_scope" text,
  "resolve_actor_uid_snapshot" uuid,
  "resolve_actor_user_id" integer,
  "reverses_event_id" bigint,
  "source_row_version_id" bigint NOT NULL,
  "status" text NOT NULL,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."economic_event_claims" (
  "amount" bigint NOT NULL,
  "candidate_key" char(64) NOT NULL,
  "claim_actor_at" timestamptz,
  "claim_actor_authorization_version" char(64),
  "claim_actor_correlation_uid" uuid,
  "claim_actor_name_snapshot" text,
  "claim_actor_scope" text,
  "claim_actor_uid_snapshot" uuid,
  "claim_actor_user_id" integer,
  "claim_uid" uuid NOT NULL,
  "coordinate_id" bigint NOT NULL,
  "created_at" timestamptz NOT NULL,
  "decision_actor_at" timestamptz,
  "decision_actor_authorization_version" char(64),
  "decision_actor_correlation_uid" uuid,
  "decision_actor_name_snapshot" text,
  "decision_actor_scope" text,
  "decision_actor_uid_snapshot" uuid,
  "decision_actor_user_id" integer,
  "direction" text NOT NULL,
  "dues_year" integer,
  "effective_at" timestamptz NOT NULL,
  "event_id" bigint,
  "event_party_id" bigint,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "member_id" bigint,
  "occurred_date_kst" date NOT NULL,
  "party_kind" text NOT NULL,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "source_row_version_id" bigint NOT NULL,
  "state" text NOT NULL,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."economic_events" (
  "amount" bigint NOT NULL,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "direction" text NOT NULL,
  "dues_year" integer,
  "event_kind" text NOT NULL,
  "event_uid" uuid NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "rejection_actor_at" timestamptz,
  "rejection_actor_authorization_version" char(64),
  "rejection_actor_correlation_uid" uuid,
  "rejection_actor_name_snapshot" text,
  "rejection_actor_scope" text,
  "rejection_actor_uid_snapshot" uuid,
  "rejection_actor_user_id" integer,
  "reverses_event_id" bigint,
  "status" text NOT NULL
);

CREATE TABLE public."economic_event_provenance" (
  "authority_rank_snapshot" integer NOT NULL,
  "event_id" bigint NOT NULL,
  "evidence_digest" char(64) NOT NULL,
  "evidence_role" text NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "normalization_version" text NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "source_row_version_id" bigint NOT NULL
);

CREATE TABLE public."economic_event_authority_decisions" (
  "decision_actor_at" timestamptz NOT NULL,
  "decision_actor_authorization_version" char(64) NOT NULL,
  "decision_actor_correlation_uid" uuid NOT NULL,
  "decision_actor_name_snapshot" text NOT NULL,
  "decision_actor_scope" text NOT NULL,
  "decision_actor_uid_snapshot" uuid NOT NULL,
  "decision_actor_user_id" integer,
  "decision_kind" text NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "event_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "reason_code" text NOT NULL,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "selected_provenance_id" bigint,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."economic_event_canonicalizations" (
  "canonical_event_id" bigint NOT NULL,
  "decision_actor_at" timestamptz NOT NULL,
  "decision_actor_authorization_version" char(64) NOT NULL,
  "decision_actor_correlation_uid" uuid NOT NULL,
  "decision_actor_name_snapshot" text NOT NULL,
  "decision_actor_scope" text NOT NULL,
  "decision_actor_uid_snapshot" uuid NOT NULL,
  "decision_actor_user_id" integer,
  "duplicate_event_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "reason_code" text NOT NULL,
  "recorded_at" timestamptz NOT NULL
);

CREATE TABLE public."economic_event_collisions" (
  "canonicalization_id" bigint,
  "collision_uid" uuid NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "higher_event_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "lower_event_id" bigint NOT NULL,
  "reason_code" text NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "status" text NOT NULL,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."legacy_payment_decisions" (
  "candidate_event_id" bigint,
  "created_event_id" bigint,
  "decision" text NOT NULL,
  "decision_actor_at" timestamptz NOT NULL,
  "decision_actor_authorization_version" char(64) NOT NULL,
  "decision_actor_correlation_uid" uuid NOT NULL,
  "decision_actor_name_snapshot" text NOT NULL,
  "decision_actor_scope" text NOT NULL,
  "decision_actor_uid_snapshot" uuid NOT NULL,
  "decision_actor_user_id" integer,
  "decision_key" char(64) NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "legacy_payment_id" integer NOT NULL,
  "member_id" bigint,
  "preview_batch_id" bigint NOT NULL,
  "reason_code" text NOT NULL,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "supersedes_id" bigint,
  "timezone_snapshot" text NOT NULL,
  "version" integer NOT NULL
);

CREATE TABLE public."legacy_cutover_states" (
  "comparison_digest" char(64),
  "cutover_code" text NOT NULL,
  "cutover_uid" uuid NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "phase" text NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "supersedes_id" bigint,
  "version" integer NOT NULL,
  "watermark_payment_id" integer
);

CREATE TABLE public."accounting_periods" (
  "boundary_evidence_row_version_id" bigint NOT NULL,
  "boundary_source_row_version_id" bigint NOT NULL,
  "decision_item_id" bigint NOT NULL,
  "ends_at" timestamptz,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "period_code" text NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "starts_at" timestamptz NOT NULL,
  "status" text NOT NULL
);

CREATE TABLE public."bank_accounts" (
  "account_code" text NOT NULL,
  "account_uid" uuid DEFAULT gen_random_uuid() NOT NULL,
  "active_from" date NOT NULL,
  "active_to" date,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "institution_code" text NOT NULL,
  "masked_identifier" text NOT NULL,
  "owner_kind" text NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer
);

CREATE TABLE public."bank_transactions" (
  "account_id" bigint NOT NULL,
  "balance_after" bigint,
  "event_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "posted_date" date NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "row_fingerprint" char(64) NOT NULL,
  "source_row_version_id" bigint NOT NULL
);

CREATE TABLE public."bank_balance_anchors" (
  "account_id" bigint NOT NULL,
  "as_of_at" timestamptz NOT NULL,
  "balance" bigint NOT NULL,
  "evidence_kind" text NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "source_row_version_id" bigint NOT NULL
);

CREATE TABLE public."bank_transfer_matches" (
  "amount" bigint NOT NULL,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "credit_transaction_id" bigint NOT NULL,
  "debit_transaction_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "rejection_actor_at" timestamptz,
  "rejection_actor_authorization_version" char(64),
  "rejection_actor_correlation_uid" uuid,
  "rejection_actor_name_snapshot" text,
  "rejection_actor_scope" text,
  "rejection_actor_uid_snapshot" uuid,
  "rejection_actor_user_id" integer,
  "status" text NOT NULL
);

CREATE TABLE public."accounting_categories" (
  "active_from" date NOT NULL,
  "active_to" date,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "category_code" text NOT NULL,
  "display_name" text NOT NULL,
  "dues_effect" text NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "report_section" text NOT NULL,
  "status" text NOT NULL,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."cashbook_entries" (
  "amount" bigint NOT NULL,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "category_id" bigint NOT NULL,
  "category_label_snapshot" text NOT NULL,
  "corrects_entry_id" bigint,
  "description_digest" char(64) NOT NULL,
  "direction" text NOT NULL,
  "discard_actor_at" timestamptz,
  "discard_actor_authorization_version" char(64),
  "discard_actor_correlation_uid" uuid,
  "discard_actor_name_snapshot" text,
  "discard_actor_scope" text,
  "discard_actor_uid_snapshot" uuid,
  "discard_actor_user_id" integer,
  "event_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "period_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "status" text NOT NULL
);

CREATE TABLE public."dues_receipts" (
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "decision_item_id" bigint,
  "event_id" bigint NOT NULL,
  "gross_amount" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "legacy_decision_id" bigint,
  "receipt_uid" uuid NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "rejection_actor_at" timestamptz,
  "rejection_actor_authorization_version" char(64),
  "rejection_actor_correlation_uid" uuid,
  "rejection_actor_name_snapshot" text,
  "rejection_actor_scope" text,
  "rejection_actor_uid_snapshot" uuid,
  "rejection_actor_user_id" integer,
  "status" text NOT NULL
);

CREATE TABLE public."dues_receipt_reversals" (
  "amount" bigint NOT NULL,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "reason_code" text NOT NULL,
  "receipt_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "refund_event_id" bigint NOT NULL,
  "rejection_actor_at" timestamptz,
  "rejection_actor_authorization_version" char(64),
  "rejection_actor_correlation_uid" uuid,
  "rejection_actor_name_snapshot" text,
  "rejection_actor_scope" text,
  "rejection_actor_uid_snapshot" uuid,
  "rejection_actor_user_id" integer,
  "status" text NOT NULL
);

CREATE TABLE public."dues_payment_groups" (
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "expected_total" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "payer_digest" char(64) NOT NULL,
  "receipt_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "rejection_actor_at" timestamptz,
  "rejection_actor_authorization_version" char(64),
  "rejection_actor_correlation_uid" uuid,
  "rejection_actor_name_snapshot" text,
  "rejection_actor_scope" text,
  "rejection_actor_uid_snapshot" uuid,
  "rejection_actor_user_id" integer,
  "roster_batch_id" bigint NOT NULL,
  "snapshot_digest" char(64) NOT NULL,
  "status" text NOT NULL
);

CREATE TABLE public."dues_group_members" (
  "decision_actor_at" timestamptz,
  "decision_actor_authorization_version" char(64),
  "decision_actor_correlation_uid" uuid,
  "decision_actor_name_snapshot" text,
  "decision_actor_scope" text,
  "decision_actor_uid_snapshot" uuid,
  "decision_actor_user_id" integer,
  "decision_item_id" bigint NOT NULL,
  "display_name_digest" char(64) NOT NULL,
  "effect_kind" text NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "group_id" bigint NOT NULL,
  "group_member_uid" uuid NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "match_candidate_id" bigint,
  "match_case_id" bigint,
  "match_status" text NOT NULL,
  "member_id" bigint,
  "proposed_amount" bigint NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "source_row_version_id" bigint NOT NULL,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer,
  "supersedes_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."dues_allocations" (
  "allocation_kind" text NOT NULL,
  "amount" bigint NOT NULL,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "assessment_id" bigint,
  "correction_group_uid" uuid,
  "correction_kind" text,
  "correction_reason_code" text,
  "decision_item_id" bigint,
  "dues_year" integer NOT NULL,
  "effect_kind" text NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "funding_event_id" bigint,
  "group_member_id" bigint,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "legacy_decision_id" bigint,
  "member_id" bigint NOT NULL,
  "receipt_id" bigint,
  "receipt_reversal_id" bigint,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz NOT NULL,
  "rejection_actor_at" timestamptz,
  "rejection_actor_authorization_version" char(64),
  "rejection_actor_correlation_uid" uuid,
  "rejection_actor_name_snapshot" text,
  "rejection_actor_scope" text,
  "rejection_actor_uid_snapshot" uuid,
  "rejection_actor_user_id" integer,
  "request_uid" uuid NOT NULL,
  "reverses_allocation_id" bigint,
  "rights_effect_mode" text NOT NULL,
  "status" text NOT NULL
);

CREATE TABLE public."bank_reconciliations" (
  "account_id" bigint NOT NULL,
  "anchor_id" bigint NOT NULL,
  "approval_actor_at" timestamptz,
  "approval_actor_authorization_version" char(64),
  "approval_actor_correlation_uid" uuid,
  "approval_actor_name_snapshot" text,
  "approval_actor_scope" text,
  "approval_actor_uid_snapshot" uuid,
  "approval_actor_user_id" integer,
  "bank_balance" bigint NOT NULL,
  "difference" bigint GENERATED ALWAYS AS (bank_balance-ledger_balance) STORED NOT NULL,
  "ending_transaction_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "ledger_balance" bigint NOT NULL,
  "period_id" bigint NOT NULL,
  "reconciliation_uid" uuid NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "rejection_actor_at" timestamptz,
  "rejection_actor_authorization_version" char(64),
  "rejection_actor_correlation_uid" uuid,
  "rejection_actor_name_snapshot" text,
  "rejection_actor_scope" text,
  "rejection_actor_uid_snapshot" uuid,
  "rejection_actor_user_id" integer,
  "revalidation_digest" char(64) NOT NULL,
  "statement_end_at" timestamptz NOT NULL,
  "status" text NOT NULL,
  "supersedes_reconciliation_id" bigint
);

CREATE TABLE public."bank_reconciliation_items" (
  "bank_transaction_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "note_code" text,
  "reconciliation_id" bigint NOT NULL,
  "recorded_actor_at" timestamptz NOT NULL,
  "recorded_actor_authorization_version" char(64) NOT NULL,
  "recorded_actor_correlation_uid" uuid NOT NULL,
  "recorded_actor_name_snapshot" text NOT NULL,
  "recorded_actor_scope" text NOT NULL,
  "recorded_actor_uid_snapshot" uuid NOT NULL,
  "recorded_actor_user_id" integer,
  "resolution_status" text NOT NULL
);

CREATE TABLE public."bank_reconciliation_carryforwards" (
  "binding_actor_at" timestamptz,
  "binding_actor_authorization_version" char(64),
  "binding_actor_correlation_uid" uuid,
  "binding_actor_name_snapshot" text,
  "binding_actor_scope" text,
  "binding_actor_uid_snapshot" uuid,
  "binding_actor_user_id" integer,
  "carry_uid" uuid NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "from_item_id" bigint NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "recorded_actor_at" timestamptz,
  "recorded_actor_authorization_version" char(64),
  "recorded_actor_correlation_uid" uuid,
  "recorded_actor_name_snapshot" text,
  "recorded_actor_scope" text,
  "recorded_actor_uid_snapshot" uuid,
  "recorded_actor_user_id" integer,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "resolution_actor_at" timestamptz,
  "resolution_actor_authorization_version" char(64),
  "resolution_actor_correlation_uid" uuid,
  "resolution_actor_name_snapshot" text,
  "resolution_actor_scope" text,
  "resolution_actor_uid_snapshot" uuid,
  "resolution_actor_user_id" integer,
  "resolution_digest" char(64),
  "resolution_kind" text,
  "resolution_reason_code" text,
  "resolution_status" text NOT NULL,
  "resolved_by_transaction_id" bigint,
  "supersede_actor_at" timestamptz,
  "supersede_actor_authorization_version" char(64),
  "supersede_actor_correlation_uid" uuid,
  "supersede_actor_name_snapshot" text,
  "supersede_actor_scope" text,
  "supersede_actor_uid_snapshot" uuid,
  "supersede_actor_user_id" integer,
  "supersedes_id" bigint,
  "supporting_document_digest" char(64),
  "target_account_id" bigint NOT NULL,
  "target_period_id" bigint NOT NULL,
  "to_reconciliation_id" bigint,
  "version" integer NOT NULL
);

CREATE TABLE public."accounting_audit_events" (
  "action" text NOT NULL,
  "actor_at" timestamptz NOT NULL,
  "actor_authorization_version" char(64) NOT NULL,
  "actor_name_snapshot" text NOT NULL,
  "actor_scope" text NOT NULL,
  "actor_uid_snapshot" uuid NOT NULL,
  "actor_user_id" integer,
  "after_json" jsonb,
  "before_json" jsonb,
  "correlation_uid" uuid NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "entity_key" text NOT NULL,
  "entity_type" text NOT NULL,
  "event_uid" uuid NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "reason_code" text NOT NULL,
  "recorded_at" timestamptz NOT NULL
);

ALTER TABLE public."business_operation_receipts" ADD CONSTRAINT "business_operation_receipts_pkey" PRIMARY KEY ("id");
ALTER TABLE public."business_operation_entities" ADD CONSTRAINT "business_operation_entities_pkey" PRIMARY KEY ("operation_uid", "ordinal");
ALTER TABLE public."mutable_entity_action_history" ADD CONSTRAINT "mutable_entity_action_history_pkey" PRIMARY KEY ("id");
ALTER TABLE public."member_activity_events" ADD CONSTRAINT "member_activity_events_pkey" PRIMARY KEY ("id");
ALTER TABLE public."association_members" ADD CONSTRAINT "association_members_pkey" PRIMARY KEY ("id");
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases_pkey" PRIMARY KEY ("id");
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates_pkey" PRIMARY KEY ("id");
ALTER TABLE public."member_identity_link_history" ADD CONSTRAINT "member_identity_link_history_pkey" PRIMARY KEY ("id");
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments_pkey" PRIMARY KEY ("id");
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings_pkey" PRIMARY KEY ("id");
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history_pkey" PRIMARY KEY ("id");
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies_pkey" PRIMARY KEY ("id");
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges_pkey" PRIMARY KEY ("id");
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments_pkey" PRIMARY KEY ("id");
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_logical_sources" ADD CONSTRAINT "accounting_logical_sources_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_source_releases" ADD CONSTRAINT "accounting_source_releases_pkey" PRIMARY KEY ("id");
ALTER TABLE public."bank_source_account_mappings" ADD CONSTRAINT "bank_source_account_mappings_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_import_coordinates" ADD CONSTRAINT "accounting_import_coordinates_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_import_row_versions" ADD CONSTRAINT "accounting_import_row_versions_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_import_batch_rows" ADD CONSTRAINT "accounting_import_batch_rows_pkey" PRIMARY KEY ("id");
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets_pkey" PRIMARY KEY ("id");
ALTER TABLE public."source_decision_items" ADD CONSTRAINT "source_decision_items_pkey" PRIMARY KEY ("id");
ALTER TABLE public."economic_event_parties" ADD CONSTRAINT "economic_event_parties_pkey" PRIMARY KEY ("id");
ALTER TABLE public."economic_event_party_aliases" ADD CONSTRAINT "economic_event_party_aliases_pkey" PRIMARY KEY ("id");
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_pkey" PRIMARY KEY ("id");
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_pkey" PRIMARY KEY ("id");
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events_pkey" PRIMARY KEY ("id");
ALTER TABLE public."economic_event_provenance" ADD CONSTRAINT "economic_event_provenance_pkey" PRIMARY KEY ("id");
ALTER TABLE public."economic_event_authority_decisions" ADD CONSTRAINT "economic_event_authority_decisions_pkey" PRIMARY KEY ("id");
ALTER TABLE public."economic_event_canonicalizations" ADD CONSTRAINT "economic_event_canonicalizations_pkey" PRIMARY KEY ("id");
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions_pkey" PRIMARY KEY ("id");
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions_pkey" PRIMARY KEY ("id");
ALTER TABLE public."legacy_cutover_states" ADD CONSTRAINT "legacy_cutover_states_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_periods" ADD CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id");
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id");
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id");
ALTER TABLE public."bank_balance_anchors" ADD CONSTRAINT "bank_balance_anchors_pkey" PRIMARY KEY ("id");
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories_pkey" PRIMARY KEY ("id");
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries_pkey" PRIMARY KEY ("id");
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts_pkey" PRIMARY KEY ("id");
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals_pkey" PRIMARY KEY ("id");
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups_pkey" PRIMARY KEY ("id");
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_pkey" PRIMARY KEY ("id");
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_pkey" PRIMARY KEY ("id");
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_pkey" PRIMARY KEY ("id");
ALTER TABLE public."bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_pkey" PRIMARY KEY ("id");
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_audit_events" ADD CONSTRAINT "accounting_audit_events_pkey" PRIMARY KEY ("id");
ALTER TABLE public."accounting_audit_events" ADD CONSTRAINT "accounting_audit_events__correlation_uid__key" UNIQUE ("correlation_uid");
ALTER TABLE public."accounting_audit_events" ADD CONSTRAINT "accounting_audit_events__event_uid__key" UNIQUE ("event_uid");
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__category_code_version__key" UNIQUE ("category_code", "version");
CREATE UNIQUE INDEX "accounting_categories__supersedes_id__key" ON public."accounting_categories" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."accounting_import_batch_rows" ADD CONSTRAINT "accounting_import_batch_rows__batch_id_coordinate_id__key" UNIQUE ("batch_id", "coordinate_id");
ALTER TABLE public."accounting_import_batch_rows" ADD CONSTRAINT "accounting_import_batch_rows__batch_id_ordinal__key" UNIQUE ("batch_id", "ordinal");
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__batch_uid__key" UNIQUE ("batch_uid");
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__source_release_id_source__26d9dcb3e5" UNIQUE ("source_release_id", "source_fingerprint");
ALTER TABLE public."accounting_import_coordinates" ADD CONSTRAINT "accounting_import_coordinates__logical_source_id_coo_c02e0e0875" UNIQUE ("logical_source_id", "coordinate_key");
ALTER TABLE public."accounting_import_row_versions" ADD CONSTRAINT "accounting_import_row_versions__coordinate_id_conten_3a58653a12" UNIQUE ("coordinate_id", "content_digest");
ALTER TABLE public."accounting_import_row_versions" ADD CONSTRAINT "accounting_import_row_versions__coordinate_id_version__key" UNIQUE ("coordinate_id", "version");
CREATE UNIQUE INDEX "accounting_import_row_versions__supersedes_id__key" ON public."accounting_import_row_versions" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."accounting_logical_sources" ADD CONSTRAINT "accounting_logical_sources__source_code__key" UNIQUE ("source_code");
ALTER TABLE public."accounting_logical_sources" ADD CONSTRAINT "accounting_logical_sources__source_kind_source_locator__key" UNIQUE ("source_kind", "source_locator");
ALTER TABLE public."accounting_logical_sources" ADD CONSTRAINT "accounting_logical_sources__source_uid__key" UNIQUE ("source_uid");
ALTER TABLE public."accounting_periods" ADD CONSTRAINT "accounting_periods__period_code__key" UNIQUE ("period_code");
ALTER TABLE public."accounting_source_releases" ADD CONSTRAINT "accounting_source_releases__logical_source_id_adapte_7191a5214c" UNIQUE ("logical_source_id", "adapter_code", "adapter_version", "normalized_schema_sha256", "normalization_implementation_sha256", "mapping_table_sha256", "mapping_approval_receipt_sha256");
ALTER TABLE public."accounting_source_releases" ADD CONSTRAINT "accounting_source_releases__release_uid__key" UNIQUE ("release_uid");
CREATE UNIQUE INDEX "association_members__alumni_record_id__key" ON public."association_members" ("alumni_record_id") WHERE alumni_record_id IS NOT NULL;
ALTER TABLE public."association_members" ADD CONSTRAINT "association_members__member_uid__key" UNIQUE ("member_uid");
CREATE UNIQUE INDEX "association_members__user_id__key" ON public."association_members" ("user_id") WHERE user_id IS NOT NULL;
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts__account_code__key" UNIQUE ("account_code");
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts__account_uid__key" UNIQUE ("account_uid");
ALTER TABLE public."bank_balance_anchors" ADD CONSTRAINT "bank_balance_anchors__account_id_as_of_at__key" UNIQUE ("account_id", "as_of_at");
ALTER TABLE public."bank_balance_anchors" ADD CONSTRAINT "bank_balance_anchors__source_row_version_id_evidence_kind__key" UNIQUE ("source_row_version_id", "evidence_kind");
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__carry_uid_version__key" UNIQUE ("carry_uid", "version");
CREATE UNIQUE INDEX "bank_reconciliation_carryforwards__supersedes_id__key" ON public."bank_reconciliation_carryforwards" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items__reconciliation_id_bank_tr_65f70d304c" UNIQUE ("reconciliation_id", "bank_transaction_id");
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations__reconciliation_uid__key" UNIQUE ("reconciliation_uid");
ALTER TABLE public."bank_source_account_mappings" ADD CONSTRAINT "bank_source_account_mappings__logical_source_id_account_id__key" UNIQUE ("logical_source_id", "account_id");
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions__account_id_row_fingerprint__key" UNIQUE ("account_id", "row_fingerprint");
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions__event_id__key" UNIQUE ("event_id");
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions__source_row_version_id__key" UNIQUE ("source_row_version_id");
ALTER TABLE public."business_operation_entities" ADD CONSTRAINT "business_operation_entities__action_correlation_uid__key" UNIQUE ("action_correlation_uid");
ALTER TABLE public."business_operation_entities" ADD CONSTRAINT "business_operation_entities__operation_uid_entity_ty_c1d81a6975" UNIQUE ("operation_uid", "entity_type", "entity_key", "entity_action");
ALTER TABLE public."business_operation_receipts" ADD CONSTRAINT "business_operation_receipts__operation_uid__key" UNIQUE ("operation_uid");
ALTER TABLE public."business_operation_receipts" ADD CONSTRAINT "business_operation_receipts__root_correlation_uid__key" UNIQUE ("root_correlation_uid");
CREATE UNIQUE INDEX "cashbook_entries__corrects_entry_id__key" ON public."cashbook_entries" ("corrects_entry_id") WHERE corrects_entry_id IS NOT NULL AND status IN ('draft','approved');
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__correction_group_uid_effect_kind__key" UNIQUE ("correction_group_uid", "effect_kind");
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__request_uid__key" UNIQUE ("request_uid");
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__group_id_source_row_version_id__key" UNIQUE ("group_id", "source_row_version_id");
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__group_member_uid_version__key" UNIQUE ("group_member_uid", "version");
CREATE UNIQUE INDEX "dues_group_members__supersedes_id__key" ON public."dues_group_members" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
CREATE UNIQUE INDEX "dues_payment_groups__receipt_id__key" ON public."dues_payment_groups" ("receipt_id") WHERE status IN ('proposed','approved');
CREATE UNIQUE INDEX "dues_payment_groups__roster_batch_id_snapshot_digest__key" ON public."dues_payment_groups" ("roster_batch_id", "snapshot_digest") WHERE status IN ('proposed','approved');
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges__member_id_version__key" UNIQUE ("member_id", "version");
CREATE UNIQUE INDEX "dues_pledges__supersedes_id__key" ON public."dues_pledges" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__dues_year_tier_code_version__key" UNIQUE ("dues_year", "tier_code", "version");
CREATE UNIQUE INDEX "dues_policies__supersedes_id__key" ON public."dues_policies" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__dues_year_position_code_5893acc4a7" UNIQUE ("dues_year", "position_code", "version");
CREATE UNIQUE INDEX "dues_position_tier_mappings__supersedes_id__key" ON public."dues_position_tier_mappings" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals__refund_event_id__key" UNIQUE ("refund_event_id");
CREATE UNIQUE INDEX "dues_receipts__event_id__key" ON public."dues_receipts" ("event_id") WHERE status IN ('proposed','approved');
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts__receipt_uid__key" UNIQUE ("receipt_uid");
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots__member_id_dues_year_evaluatio_8b26410dc8" UNIQUE ("member_id", "dues_year", "evaluation_date", "version");
CREATE UNIQUE INDEX "dues_status_snapshots__supersedes_id__key" ON public."dues_status_snapshots" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."economic_event_authority_decisions" ADD CONSTRAINT "economic_event_authority_decisions__event_id_version__key" UNIQUE ("event_id", "version");
CREATE UNIQUE INDEX "economic_event_authority_decisions__supersedes_id__key" ON public."economic_event_authority_decisions" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__claim_uid_version__key" UNIQUE ("claim_uid", "version");
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__coordinate_id__key" UNIQUE ("coordinate_id");
CREATE UNIQUE INDEX "economic_event_claims__supersedes_id__key" ON public."economic_event_claims" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions__collision_uid_version__key" UNIQUE ("collision_uid", "version");
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions__lower_event_id_higher_event_id__key" UNIQUE ("lower_event_id", "higher_event_id");
CREATE UNIQUE INDEX "economic_event_collisions__supersedes_id__key" ON public."economic_event_collisions" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
CREATE UNIQUE INDEX "economic_event_parties__party_kind_stable_code__key" ON public."economic_event_parties" ("party_kind", "stable_code") WHERE stable_code IS NOT NULL;
ALTER TABLE public."economic_event_parties" ADD CONSTRAINT "economic_event_parties__party_uid__key" UNIQUE ("party_uid");
ALTER TABLE public."economic_event_party_aliases" ADD CONSTRAINT "economic_event_party_aliases__party_id_source_row_ve_e6e2579c2a" UNIQUE ("party_id", "source_row_version_id");
ALTER TABLE public."economic_event_provenance" ADD CONSTRAINT "economic_event_provenance__event_id_evidence_digest__key" UNIQUE ("event_id", "evidence_digest");
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events__event_uid__key" UNIQUE ("event_uid");
ALTER TABLE public."legacy_cutover_states" ADD CONSTRAINT "legacy_cutover_states__cutover_code__key" UNIQUE ("cutover_code");
ALTER TABLE public."legacy_cutover_states" ADD CONSTRAINT "legacy_cutover_states__cutover_uid_version__key" UNIQUE ("cutover_uid", "version");
CREATE UNIQUE INDEX "legacy_cutover_states__supersedes_id__key" ON public."legacy_cutover_states" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions__decision_key__key" UNIQUE ("decision_key");
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions__legacy_payment_id_version__key" UNIQUE ("legacy_payment_id", "version");
CREATE UNIQUE INDEX "legacy_payment_decisions__supersedes_id__key" ON public."legacy_payment_decisions" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."member_activity_events" ADD CONSTRAINT "member_activity_events__member_id_activity_no__key" UNIQUE ("member_id", "activity_no");
CREATE UNIQUE INDEX "member_activity_events__mutation_history_id__key" ON public."member_activity_events" ("mutation_history_id") WHERE mutation_history_id IS NOT NULL;
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__assessment_uid_version__key" UNIQUE ("assessment_uid", "version");
CREATE UNIQUE INDEX "member_assessments__supersedes_id__key" ON public."member_assessments" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history__member_id_dues_year_version__key" UNIQUE ("member_id", "dues_year", "version");
CREATE UNIQUE INDEX "member_dues_tier_history__supersedes_id__key" ON public."member_dues_tier_history" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."member_identity_link_history" ADD CONSTRAINT "member_identity_link_history__link_uid_version__key" UNIQUE ("link_uid", "version");
CREATE UNIQUE INDEX "member_identity_link_history__member_id__key" ON public."member_identity_link_history" ("member_id") WHERE version=1;
CREATE UNIQUE INDEX "member_identity_link_history__supersedes_id__key" ON public."member_identity_link_history" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
CREATE UNIQUE INDEX "member_match_candidates__root_case_id__key" ON public."member_match_candidates" ("root_case_id") WHERE status='approved';
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates__root_case_id_member_id__key" UNIQUE ("root_case_id", "member_id");
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__case_uid_version__key" UNIQUE ("case_uid", "version");
CREATE UNIQUE INDEX "member_match_cases__supersedes_id__key" ON public."member_match_cases" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments__assignment_uid_version__key" UNIQUE ("assignment_uid", "version");
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments__member_id_administratio_72bcbfcae9" UNIQUE ("member_id", "administration_no", "position_code", "effective_from", "version");
CREATE UNIQUE INDEX "member_position_assignments__supersedes_id__key" ON public."member_position_assignments" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
CREATE UNIQUE INDEX "mutable_entity_action_history__accounting_period_id__275ec3f5af" ON public."mutable_entity_action_history" ("accounting_period_id", "mutation_no") WHERE accounting_period_id IS NOT NULL;
CREATE UNIQUE INDEX "mutable_entity_action_history__association_member_id_a9f3678384" ON public."mutable_entity_action_history" ("association_member_id", "mutation_no") WHERE association_member_id IS NOT NULL;
ALTER TABLE public."source_decision_items" ADD CONSTRAINT "source_decision_items__decision_set_id_coordinate_id_f61f66fa0a" UNIQUE ("decision_set_id", "coordinate_id", "decision_kind");
ALTER TABLE public."source_decision_items" ADD CONSTRAINT "source_decision_items__decision_set_id_ordinal__key" UNIQUE ("decision_set_id", "ordinal");
CREATE UNIQUE INDEX "source_decision_sets__batch_id__key" ON public."source_decision_sets" ("batch_id") WHERE status IN ('previewed','approved');
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__decision_set_uid__key" UNIQUE ("decision_set_uid");
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__classification__cbacd6f1fc" UNIQUE ("classification_uid", "version");
CREATE UNIQUE INDEX "source_row_classification_decisions__coordinate_id__key" ON public."source_row_classification_decisions" ("coordinate_id") WHERE version=1;
CREATE UNIQUE INDEX "source_row_classification_decisions__supersedes_id__key" ON public."source_row_classification_decisions" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
ALTER TABLE public."accounting_audit_events" ADD CONSTRAINT "accounting_audit_events__actor_authorization_version__check" CHECK (actor_authorization_version IS NULL OR actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_audit_events" ADD CONSTRAINT "accounting_audit_events__actor_scope__check" CHECK (actor_scope IS NULL OR actor_scope IN ('admin','member_self','migration_admin'));
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__approval_actor_authorization__be8d7d4d3f" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__recorded_actor_authorization__f444bc35d7" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__supersede_actor_authorization_ca17cc5c25" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__supersede_actor_completeness__check" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__supersede_actor_scope__check" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin'));
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__version__check" CHECK (version >= 1);
ALTER TABLE public."accounting_import_batch_rows" ADD CONSTRAINT "accounting_import_batch_rows__recorded_actor_authori_edbb9668db" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_import_batch_rows" ADD CONSTRAINT "accounting_import_batch_rows__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__apply_actor_authorization_1cde251e43" CHECK (apply_actor_authorization_version IS NULL OR apply_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__apply_actor_completeness__check" CHECK ((apply_actor_correlation_uid IS NULL AND apply_actor_uid_snapshot IS NULL AND apply_actor_name_snapshot IS NULL AND apply_actor_scope IS NULL AND apply_actor_authorization_version IS NULL AND apply_actor_at IS NULL) OR (apply_actor_correlation_uid IS NOT NULL AND apply_actor_uid_snapshot IS NOT NULL AND apply_actor_name_snapshot IS NOT NULL AND apply_actor_scope IS NOT NULL AND apply_actor_authorization_version IS NOT NULL AND apply_actor_at IS NOT NULL));
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__apply_actor_scope__check" CHECK (apply_actor_scope IS NULL OR apply_actor_scope IN ('admin'));
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__failure_actor_authorizati_660bfc77e1" CHECK (failure_actor_authorization_version IS NULL OR failure_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__failure_actor_completeness__check" CHECK ((failure_actor_correlation_uid IS NULL AND failure_actor_uid_snapshot IS NULL AND failure_actor_name_snapshot IS NULL AND failure_actor_scope IS NULL AND failure_actor_authorization_version IS NULL AND failure_actor_at IS NULL) OR (failure_actor_correlation_uid IS NOT NULL AND failure_actor_uid_snapshot IS NOT NULL AND failure_actor_name_snapshot IS NOT NULL AND failure_actor_scope IS NOT NULL AND failure_actor_authorization_version IS NOT NULL AND failure_actor_at IS NOT NULL));
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__failure_actor_scope__check" CHECK (failure_actor_scope IS NULL OR failure_actor_scope IN ('admin'));
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__preview_actor_authorizati_2ac1d1a70b" CHECK (preview_actor_authorization_version IS NULL OR preview_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__preview_actor_scope__check" CHECK (preview_actor_scope IS NULL OR preview_actor_scope IN ('admin'));
ALTER TABLE public."accounting_import_coordinates" ADD CONSTRAINT "accounting_import_coordinates__recorded_actor_author_fe98b3c0ab" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_import_coordinates" ADD CONSTRAINT "accounting_import_coordinates__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."accounting_import_row_versions" ADD CONSTRAINT "accounting_import_row_versions__recorded_actor_autho_ffe01b4c4b" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_import_row_versions" ADD CONSTRAINT "accounting_import_row_versions__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."accounting_logical_sources" ADD CONSTRAINT "accounting_logical_sources__recorded_actor_authoriza_7fc62b993c" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_logical_sources" ADD CONSTRAINT "accounting_logical_sources__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."accounting_periods" ADD CONSTRAINT "accounting_periods__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_periods" ADD CONSTRAINT "accounting_periods__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."accounting_source_releases" ADD CONSTRAINT "accounting_source_releases__recorded_actor_authoriza_acff7b71ee" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."accounting_source_releases" ADD CONSTRAINT "accounting_source_releases__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."association_members" ADD CONSTRAINT "association_members__recorded_actor_authorization_ve_a583e266f9" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."association_members" ADD CONSTRAINT "association_members__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."bank_balance_anchors" ADD CONSTRAINT "bank_balance_anchors__recorded_actor_authorization_v_ffb36f210e" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_balance_anchors" ADD CONSTRAINT "bank_balance_anchors__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__binding_actor_aut_5a9b8f3979" CHECK (binding_actor_authorization_version IS NULL OR binding_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__binding_actor_com_6640179794" CHECK ((binding_actor_correlation_uid IS NULL AND binding_actor_uid_snapshot IS NULL AND binding_actor_name_snapshot IS NULL AND binding_actor_scope IS NULL AND binding_actor_authorization_version IS NULL AND binding_actor_at IS NULL) OR (binding_actor_correlation_uid IS NOT NULL AND binding_actor_uid_snapshot IS NOT NULL AND binding_actor_name_snapshot IS NOT NULL AND binding_actor_scope IS NOT NULL AND binding_actor_authorization_version IS NOT NULL AND binding_actor_at IS NOT NULL));
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__binding_actor_scope__check" CHECK (binding_actor_scope IS NULL OR binding_actor_scope IN ('admin'));
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__recorded_actor_au_2fa4919860" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__resolution_actor__211b44d23b" CHECK (resolution_actor_authorization_version IS NULL OR resolution_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__resolution_actor__59a1b5eb97" CHECK (resolution_actor_scope IS NULL OR resolution_actor_scope IN ('admin'));
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__resolution_actor__f013214e42" CHECK ((resolution_actor_correlation_uid IS NULL AND resolution_actor_uid_snapshot IS NULL AND resolution_actor_name_snapshot IS NULL AND resolution_actor_scope IS NULL AND resolution_actor_authorization_version IS NULL AND resolution_actor_at IS NULL) OR (resolution_actor_correlation_uid IS NOT NULL AND resolution_actor_uid_snapshot IS NOT NULL AND resolution_actor_name_snapshot IS NOT NULL AND resolution_actor_scope IS NOT NULL AND resolution_actor_authorization_version IS NOT NULL AND resolution_actor_at IS NOT NULL));
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__supersede_actor_a_5b64c9dea9" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__supersede_actor_c_4c08680a12" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__supersede_actor_scope__check" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin'));
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards__version__check" CHECK (version >= 1);
ALTER TABLE public."bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items__recorded_actor_authorizat_b7b677c2de" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations__approval_actor_authorization_v_7b2451e155" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations__recorded_actor_authorization_v_dd2e22b574" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations__rejection_actor_authorization__20f3e7ff71" CHECK (rejection_actor_authorization_version IS NULL OR rejection_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations__rejection_actor_completeness__check" CHECK ((rejection_actor_correlation_uid IS NULL AND rejection_actor_uid_snapshot IS NULL AND rejection_actor_name_snapshot IS NULL AND rejection_actor_scope IS NULL AND rejection_actor_authorization_version IS NULL AND rejection_actor_at IS NULL) OR (rejection_actor_correlation_uid IS NOT NULL AND rejection_actor_uid_snapshot IS NOT NULL AND rejection_actor_name_snapshot IS NOT NULL AND rejection_actor_scope IS NOT NULL AND rejection_actor_authorization_version IS NOT NULL AND rejection_actor_at IS NOT NULL));
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations__rejection_actor_scope__check" CHECK (rejection_actor_scope IS NULL OR rejection_actor_scope IN ('admin'));
ALTER TABLE public."bank_source_account_mappings" ADD CONSTRAINT "bank_source_account_mappings__recorded_actor_authori_02622c6b9e" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_source_account_mappings" ADD CONSTRAINT "bank_source_account_mappings__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches__approval_actor_authorization__21c5d59849" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches__recorded_actor_authorization__abc8efd468" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches__rejection_actor_authorization_f1da2f95c4" CHECK (rejection_actor_authorization_version IS NULL OR rejection_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches__rejection_actor_completeness__check" CHECK ((rejection_actor_correlation_uid IS NULL AND rejection_actor_uid_snapshot IS NULL AND rejection_actor_name_snapshot IS NULL AND rejection_actor_scope IS NULL AND rejection_actor_authorization_version IS NULL AND rejection_actor_at IS NULL) OR (rejection_actor_correlation_uid IS NOT NULL AND rejection_actor_uid_snapshot IS NOT NULL AND rejection_actor_name_snapshot IS NOT NULL AND rejection_actor_scope IS NOT NULL AND rejection_actor_authorization_version IS NOT NULL AND rejection_actor_at IS NOT NULL));
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches__rejection_actor_scope__check" CHECK (rejection_actor_scope IS NULL OR rejection_actor_scope IN ('admin'));
ALTER TABLE public."business_operation_receipts" ADD CONSTRAINT "business_operation_receipts__canonical_payload__check" CHECK (jsonb_typeof(canonical_payload) = 'object' AND canonical_payload->>'schema_version' = 'business-operation-payload-v2' AND payload_sha256 ~ '^[0-9a-f]{64}$' AND jsonb_typeof(canonical_payload->'expected_results') = 'array' AND jsonb_typeof(canonical_payload->'reservation_slots') = 'array');
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries__approval_actor_authorization_version__check" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries__discard_actor_authorization_version__check" CHECK (discard_actor_authorization_version IS NULL OR discard_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries__discard_actor_completeness__check" CHECK ((discard_actor_correlation_uid IS NULL AND discard_actor_uid_snapshot IS NULL AND discard_actor_name_snapshot IS NULL AND discard_actor_scope IS NULL AND discard_actor_authorization_version IS NULL AND discard_actor_at IS NULL) OR (discard_actor_correlation_uid IS NOT NULL AND discard_actor_uid_snapshot IS NOT NULL AND discard_actor_name_snapshot IS NOT NULL AND discard_actor_scope IS NOT NULL AND discard_actor_authorization_version IS NOT NULL AND discard_actor_at IS NOT NULL));
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries__discard_actor_scope__check" CHECK (discard_actor_scope IS NULL OR discard_actor_scope IN ('admin'));
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__approval_actor_authorization_version__check" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__correction_reason_code__check" CHECK ((correction_reason_code IS NULL AND rights_effect_mode IN ('immediate_positive','next_month_negative')) OR (correction_reason_code IN ('source_error','false_transaction') AND rights_effect_mode = 'retroactive_error'));
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__rejection_actor_authorization_version__check" CHECK (rejection_actor_authorization_version IS NULL OR rejection_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__rejection_actor_completeness__check" CHECK ((rejection_actor_correlation_uid IS NULL AND rejection_actor_uid_snapshot IS NULL AND rejection_actor_name_snapshot IS NULL AND rejection_actor_scope IS NULL AND rejection_actor_authorization_version IS NULL AND rejection_actor_at IS NULL) OR (rejection_actor_correlation_uid IS NOT NULL AND rejection_actor_uid_snapshot IS NOT NULL AND rejection_actor_name_snapshot IS NOT NULL AND rejection_actor_scope IS NOT NULL AND rejection_actor_authorization_version IS NOT NULL AND rejection_actor_at IS NOT NULL));
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations__rejection_actor_scope__check" CHECK (rejection_actor_scope IS NULL OR rejection_actor_scope IN ('admin'));
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__decision_actor_authorization_version__check" CHECK (decision_actor_authorization_version IS NULL OR decision_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__decision_actor_completeness__check" CHECK ((decision_actor_correlation_uid IS NULL AND decision_actor_uid_snapshot IS NULL AND decision_actor_name_snapshot IS NULL AND decision_actor_scope IS NULL AND decision_actor_authorization_version IS NULL AND decision_actor_at IS NULL) OR (decision_actor_correlation_uid IS NOT NULL AND decision_actor_uid_snapshot IS NOT NULL AND decision_actor_name_snapshot IS NOT NULL AND decision_actor_scope IS NOT NULL AND decision_actor_authorization_version IS NOT NULL AND decision_actor_at IS NOT NULL));
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__decision_actor_scope__check" CHECK (decision_actor_scope IS NULL OR decision_actor_scope IN ('admin'));
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__supersede_actor_authorization_ve_85e9828043" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__supersede_actor_completeness__check" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__supersede_actor_scope__check" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin'));
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members__version__check" CHECK (version >= 1);
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups__approval_actor_authorization_ve_caef57bc67" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups__recorded_actor_authorization_ve_8a4e6d474c" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups__rejection_actor_authorization_v_81c0e1fbf4" CHECK (rejection_actor_authorization_version IS NULL OR rejection_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups__rejection_actor_completeness__check" CHECK ((rejection_actor_correlation_uid IS NULL AND rejection_actor_uid_snapshot IS NULL AND rejection_actor_name_snapshot IS NULL AND rejection_actor_scope IS NULL AND rejection_actor_authorization_version IS NULL AND rejection_actor_at IS NULL) OR (rejection_actor_correlation_uid IS NOT NULL AND rejection_actor_uid_snapshot IS NOT NULL AND rejection_actor_name_snapshot IS NOT NULL AND rejection_actor_scope IS NOT NULL AND rejection_actor_authorization_version IS NOT NULL AND rejection_actor_at IS NOT NULL));
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups__rejection_actor_scope__check" CHECK (rejection_actor_scope IS NULL OR rejection_actor_scope IN ('admin'));
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('member_self','admin'));
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges__version__check" CHECK (version >= 1);
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__approval_actor_authorization_version__check" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__supersede_actor_authorization_version__check" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__supersede_actor_completeness__check" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__supersede_actor_scope__check" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin'));
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies__version__check" CHECK (version >= 1);
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__approval_actor_authoriz_d0ecd5e85a" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__recorded_actor_authoriz_8cb9c61ad2" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__supersede_actor_authori_0792592a70" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__supersede_actor_complet_92169f2ac1" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__supersede_actor_scope__check" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin'));
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings__version__check" CHECK (version >= 1);
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals__approval_actor_authorization_32aaf7390a" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals__recorded_actor_authorization_823281bcc4" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals__rejection_actor_authorizatio_37e261a5d8" CHECK (rejection_actor_authorization_version IS NULL OR rejection_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals__rejection_actor_completeness__check" CHECK ((rejection_actor_correlation_uid IS NULL AND rejection_actor_uid_snapshot IS NULL AND rejection_actor_name_snapshot IS NULL AND rejection_actor_scope IS NULL AND rejection_actor_authorization_version IS NULL AND rejection_actor_at IS NULL) OR (rejection_actor_correlation_uid IS NOT NULL AND rejection_actor_uid_snapshot IS NOT NULL AND rejection_actor_name_snapshot IS NOT NULL AND rejection_actor_scope IS NOT NULL AND rejection_actor_authorization_version IS NOT NULL AND rejection_actor_at IS NOT NULL));
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals__rejection_actor_scope__check" CHECK (rejection_actor_scope IS NULL OR rejection_actor_scope IN ('admin'));
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts__approval_actor_authorization_version__check" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts__rejection_actor_authorization_version__check" CHECK (rejection_actor_authorization_version IS NULL OR rejection_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts__rejection_actor_completeness__check" CHECK ((rejection_actor_correlation_uid IS NULL AND rejection_actor_uid_snapshot IS NULL AND rejection_actor_name_snapshot IS NULL AND rejection_actor_scope IS NULL AND rejection_actor_authorization_version IS NULL AND rejection_actor_at IS NULL) OR (rejection_actor_correlation_uid IS NOT NULL AND rejection_actor_uid_snapshot IS NOT NULL AND rejection_actor_name_snapshot IS NOT NULL AND rejection_actor_scope IS NOT NULL AND rejection_actor_authorization_version IS NOT NULL AND rejection_actor_at IS NOT NULL));
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts__rejection_actor_scope__check" CHECK (rejection_actor_scope IS NULL OR rejection_actor_scope IN ('admin'));
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots__recorded_actor_authorization__bb9dfaa3f9" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots__version__check" CHECK (version >= 1);
ALTER TABLE public."economic_event_authority_decisions" ADD CONSTRAINT "economic_event_authority_decisions__decision_actor_a_c3ffd6f625" CHECK (decision_actor_authorization_version IS NULL OR decision_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_event_authority_decisions" ADD CONSTRAINT "economic_event_authority_decisions__decision_actor_scope__check" CHECK (decision_actor_scope IS NULL OR decision_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."economic_event_authority_decisions" ADD CONSTRAINT "economic_event_authority_decisions__version__check" CHECK (version >= 1);
ALTER TABLE public."economic_event_canonicalizations" ADD CONSTRAINT "economic_event_canonicalizations__decision_actor_aut_977d08666f" CHECK (decision_actor_authorization_version IS NULL OR decision_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_event_canonicalizations" ADD CONSTRAINT "economic_event_canonicalizations__decision_actor_scope__check" CHECK (decision_actor_scope IS NULL OR decision_actor_scope IN ('admin'));
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__claim_actor_authorization_version__check" CHECK (claim_actor_authorization_version IS NULL OR claim_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__claim_actor_scope__check" CHECK (claim_actor_scope IS NULL OR claim_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__decision_actor_authorization__a9f9d6a9fa" CHECK (decision_actor_authorization_version IS NULL OR decision_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__decision_actor_completeness__check" CHECK ((decision_actor_correlation_uid IS NULL AND decision_actor_uid_snapshot IS NULL AND decision_actor_name_snapshot IS NULL AND decision_actor_scope IS NULL AND decision_actor_authorization_version IS NULL AND decision_actor_at IS NULL) OR (decision_actor_correlation_uid IS NOT NULL AND decision_actor_uid_snapshot IS NOT NULL AND decision_actor_name_snapshot IS NOT NULL AND decision_actor_scope IS NOT NULL AND decision_actor_authorization_version IS NOT NULL AND decision_actor_at IS NOT NULL));
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__decision_actor_scope__check" CHECK (decision_actor_scope IS NULL OR decision_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__supersede_actor_authorization_cbc755709e" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__supersede_actor_completeness__check" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__supersede_actor_scope__check" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims__version__check" CHECK (version >= 1);
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions__recorded_actor_authorizat_548e67953f" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions__version__check" CHECK (version >= 1);
ALTER TABLE public."economic_event_parties" ADD CONSTRAINT "economic_event_parties__recorded_actor_authorization_d3742d8240" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_event_parties" ADD CONSTRAINT "economic_event_parties__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."economic_event_party_aliases" ADD CONSTRAINT "economic_event_party_aliases__recorded_actor_authori_0f1649802d" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_event_party_aliases" ADD CONSTRAINT "economic_event_party_aliases__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."economic_event_provenance" ADD CONSTRAINT "economic_event_provenance__recorded_actor_authorizat_cef120f92a" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_event_provenance" ADD CONSTRAINT "economic_event_provenance__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events__approval_actor_authorization_version__check" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events__rejection_actor_authorization_version__check" CHECK (rejection_actor_authorization_version IS NULL OR rejection_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events__rejection_actor_completeness__check" CHECK ((rejection_actor_correlation_uid IS NULL AND rejection_actor_uid_snapshot IS NULL AND rejection_actor_name_snapshot IS NULL AND rejection_actor_scope IS NULL AND rejection_actor_authorization_version IS NULL AND rejection_actor_at IS NULL) OR (rejection_actor_correlation_uid IS NOT NULL AND rejection_actor_uid_snapshot IS NOT NULL AND rejection_actor_name_snapshot IS NOT NULL AND rejection_actor_scope IS NOT NULL AND rejection_actor_authorization_version IS NOT NULL AND rejection_actor_at IS NOT NULL));
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events__rejection_actor_scope__check" CHECK (rejection_actor_scope IS NULL OR rejection_actor_scope IN ('admin'));
ALTER TABLE public."legacy_cutover_states" ADD CONSTRAINT "legacy_cutover_states__recorded_actor_authorization__c3d2c35fff" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."legacy_cutover_states" ADD CONSTRAINT "legacy_cutover_states__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('migration_admin'));
ALTER TABLE public."legacy_cutover_states" ADD CONSTRAINT "legacy_cutover_states__version__check" CHECK (version >= 1);
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions__decision_actor_authorizati_de24415dcd" CHECK (decision_actor_authorization_version IS NULL OR decision_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions__decision_actor_scope__check" CHECK (decision_actor_scope IS NULL OR decision_actor_scope IN ('migration_admin'));
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions__version__check" CHECK (version >= 1);
ALTER TABLE public."member_activity_events" ADD CONSTRAINT "member_activity_events__activity_actor_authorization_08f899dfb6" CHECK (activity_actor_authorization_version IS NULL OR activity_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_activity_events" ADD CONSTRAINT "member_activity_events__activity_actor_scope__check" CHECK (activity_actor_scope IS NULL OR activity_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__approval_actor_authorization_version__check" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__reversal_actor_authorization_version__check" CHECK (reversal_actor_authorization_version IS NULL OR reversal_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__reversal_actor_completeness__check" CHECK ((reversal_actor_correlation_uid IS NULL AND reversal_actor_uid_snapshot IS NULL AND reversal_actor_name_snapshot IS NULL AND reversal_actor_scope IS NULL AND reversal_actor_authorization_version IS NULL AND reversal_actor_at IS NULL) OR (reversal_actor_correlation_uid IS NOT NULL AND reversal_actor_uid_snapshot IS NOT NULL AND reversal_actor_name_snapshot IS NOT NULL AND reversal_actor_scope IS NOT NULL AND reversal_actor_authorization_version IS NOT NULL AND reversal_actor_at IS NOT NULL));
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__reversal_actor_scope__check" CHECK (reversal_actor_scope IS NULL OR reversal_actor_scope IN ('admin'));
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__supersede_actor_authorization_ve_c1922a44b8" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__supersede_actor_completeness__check" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__supersede_actor_scope__check" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin'));
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments__version__check" CHECK (version >= 1);
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history__derived_actor_authorizatio_9745bc89d2" CHECK (derived_actor_authorization_version IS NULL OR derived_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history__derived_actor_scope__check" CHECK (derived_actor_scope IS NULL OR derived_actor_scope IN ('admin'));
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history__version__check" CHECK (version >= 1);
ALTER TABLE public."member_identity_link_history" ADD CONSTRAINT "member_identity_link_history__decision_actor_authori_6ea205963a" CHECK (decision_actor_authorization_version IS NULL OR decision_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_identity_link_history" ADD CONSTRAINT "member_identity_link_history__decision_actor_scope__check" CHECK (decision_actor_scope IS NULL OR decision_actor_scope IN ('admin','member_self'));
ALTER TABLE public."member_identity_link_history" ADD CONSTRAINT "member_identity_link_history__version__check" CHECK (version >= 1);
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates__decision_actor_authorizatio_64af8dd2fe" CHECK (decision_actor_authorization_version IS NULL OR decision_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates__decision_actor_completeness__check" CHECK ((decision_actor_correlation_uid IS NULL AND decision_actor_uid_snapshot IS NULL AND decision_actor_name_snapshot IS NULL AND decision_actor_scope IS NULL AND decision_actor_authorization_version IS NULL AND decision_actor_at IS NULL) OR (decision_actor_correlation_uid IS NOT NULL AND decision_actor_uid_snapshot IS NOT NULL AND decision_actor_name_snapshot IS NOT NULL AND decision_actor_scope IS NOT NULL AND decision_actor_authorization_version IS NOT NULL AND decision_actor_at IS NOT NULL));
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates__decision_actor_scope__check" CHECK (decision_actor_scope IS NULL OR decision_actor_scope IN ('admin'));
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates__recorded_actor_authorizatio_937340a689" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__decision_actor_authorization_version__check" CHECK (decision_actor_authorization_version IS NULL OR decision_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__decision_actor_completeness__check" CHECK ((decision_actor_correlation_uid IS NULL AND decision_actor_uid_snapshot IS NULL AND decision_actor_name_snapshot IS NULL AND decision_actor_scope IS NULL AND decision_actor_authorization_version IS NULL AND decision_actor_at IS NULL) OR (decision_actor_correlation_uid IS NOT NULL AND decision_actor_uid_snapshot IS NOT NULL AND decision_actor_name_snapshot IS NOT NULL AND decision_actor_scope IS NOT NULL AND decision_actor_authorization_version IS NOT NULL AND decision_actor_at IS NOT NULL));
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__decision_actor_scope__check" CHECK (decision_actor_scope IS NULL OR decision_actor_scope IN ('admin'));
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__recorded_actor_authorization_version__check" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__supersede_actor_authorization_ve_2d0578f58d" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__supersede_actor_completeness__check" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__supersede_actor_scope__check" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin'));
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases__version__check" CHECK (version >= 1);
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments__override_reason__check" CHECK (override_reason IS NULL OR override_reason = 'OWNER_APPROVED_21ST_TERM_TO_AGM36_CLOSE');
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments__recorded_actor_authoriz_29906bacf3" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin'));
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments__version__check" CHECK (version >= 1);
ALTER TABLE public."mutable_entity_action_history" ADD CONSTRAINT "mutable_entity_action_history__mutation_actor_author_d3ad855c5d" CHECK (mutation_actor_authorization_version IS NULL OR mutation_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."mutable_entity_action_history" ADD CONSTRAINT "mutable_entity_action_history__mutation_actor_scope__check" CHECK (mutation_actor_scope IS NULL OR mutation_actor_scope IN ('admin','member_self'));
ALTER TABLE public."source_decision_items" ADD CONSTRAINT "source_decision_items__recorded_actor_authorization__e95f590fd7" CHECK (recorded_actor_authorization_version IS NULL OR recorded_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."source_decision_items" ADD CONSTRAINT "source_decision_items__recorded_actor_scope__check" CHECK (recorded_actor_scope IS NULL OR recorded_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__approval_actor_authorization_v_9020f82b11" CHECK (approval_actor_authorization_version IS NULL OR approval_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__approval_actor_completeness__check" CHECK ((approval_actor_correlation_uid IS NULL AND approval_actor_uid_snapshot IS NULL AND approval_actor_name_snapshot IS NULL AND approval_actor_scope IS NULL AND approval_actor_authorization_version IS NULL AND approval_actor_at IS NULL) OR (approval_actor_correlation_uid IS NOT NULL AND approval_actor_uid_snapshot IS NOT NULL AND approval_actor_name_snapshot IS NOT NULL AND approval_actor_scope IS NOT NULL AND approval_actor_authorization_version IS NOT NULL AND approval_actor_at IS NOT NULL));
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__approval_actor_scope__check" CHECK (approval_actor_scope IS NULL OR approval_actor_scope IN ('admin'));
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__preview_actor_authorization_ve_812a0c978c" CHECK (preview_actor_authorization_version IS NULL OR preview_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__preview_actor_scope__check" CHECK (preview_actor_scope IS NULL OR preview_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__rejection_actor_authorization__15a260159c" CHECK (rejection_actor_authorization_version IS NULL OR rejection_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__rejection_actor_completeness__check" CHECK ((rejection_actor_correlation_uid IS NULL AND rejection_actor_uid_snapshot IS NULL AND rejection_actor_name_snapshot IS NULL AND rejection_actor_scope IS NULL AND rejection_actor_authorization_version IS NULL AND rejection_actor_at IS NULL) OR (rejection_actor_correlation_uid IS NOT NULL AND rejection_actor_uid_snapshot IS NOT NULL AND rejection_actor_name_snapshot IS NOT NULL AND rejection_actor_scope IS NOT NULL AND rejection_actor_authorization_version IS NOT NULL AND rejection_actor_at IS NOT NULL));
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__rejection_actor_scope__check" CHECK (rejection_actor_scope IS NULL OR rejection_actor_scope IN ('admin'));
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__supersede_actor_authorization__9901769270" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__supersede_actor_completeness__check" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets__supersede_actor_scope__check" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__decision_actor__8eb56c1472" CHECK (decision_actor_scope IS NULL OR decision_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__decision_actor__ee861fd28d" CHECK (decision_actor_authorization_version IS NULL OR decision_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__resolve_actor_a_b91d9de412" CHECK (resolve_actor_authorization_version IS NULL OR resolve_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__resolve_actor_c_b49ebbf1e5" CHECK ((resolve_actor_correlation_uid IS NULL AND resolve_actor_uid_snapshot IS NULL AND resolve_actor_name_snapshot IS NULL AND resolve_actor_scope IS NULL AND resolve_actor_authorization_version IS NULL AND resolve_actor_at IS NULL) OR (resolve_actor_correlation_uid IS NOT NULL AND resolve_actor_uid_snapshot IS NOT NULL AND resolve_actor_name_snapshot IS NOT NULL AND resolve_actor_scope IS NOT NULL AND resolve_actor_authorization_version IS NOT NULL AND resolve_actor_at IS NOT NULL));
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__resolve_actor_scope__check" CHECK (resolve_actor_scope IS NULL OR resolve_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__supersede_actor_2c698c2ae7" CHECK (supersede_actor_authorization_version IS NULL OR supersede_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__supersede_actor_648c9c5661" CHECK ((supersede_actor_correlation_uid IS NULL AND supersede_actor_uid_snapshot IS NULL AND supersede_actor_name_snapshot IS NULL AND supersede_actor_scope IS NULL AND supersede_actor_authorization_version IS NULL AND supersede_actor_at IS NULL) OR (supersede_actor_correlation_uid IS NOT NULL AND supersede_actor_uid_snapshot IS NOT NULL AND supersede_actor_name_snapshot IS NOT NULL AND supersede_actor_scope IS NOT NULL AND supersede_actor_authorization_version IS NOT NULL AND supersede_actor_at IS NOT NULL));
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__supersede_actor_c96714e122" CHECK (supersede_actor_scope IS NULL OR supersede_actor_scope IN ('admin','migration_admin'));
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions__version__check" CHECK (version >= 1);
ALTER TABLE public."business_operation_receipts" ADD CONSTRAINT "business_operation_receipts_actor_target_user_id_fkey" FOREIGN KEY ("actor_target_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."business_operation_receipts" ADD CONSTRAINT "business_operation_receipts_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."business_operation_entities" ADD CONSTRAINT "business_operation_entities_operation_uid_fkey" FOREIGN KEY ("operation_uid") REFERENCES public."business_operation_receipts" ("operation_uid") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."mutable_entity_action_history" ADD CONSTRAINT "mutable_entity_action_history_accounting_period_id_fkey" FOREIGN KEY ("accounting_period_id") REFERENCES public."accounting_periods" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."mutable_entity_action_history" ADD CONSTRAINT "mutable_entity_action_history_association_member_id_fkey" FOREIGN KEY ("association_member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."mutable_entity_action_history" ADD CONSTRAINT "mutable_entity_action_history_mutation_actor_user_id_fkey" FOREIGN KEY ("mutation_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_activity_events" ADD CONSTRAINT "member_activity_events_activity_actor_user_id_fkey" FOREIGN KEY ("activity_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_activity_events" ADD CONSTRAINT "member_activity_events_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_activity_events" ADD CONSTRAINT "member_activity_events_mutation_history_id_fkey" FOREIGN KEY ("mutation_history_id") REFERENCES public."mutable_entity_action_history" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."association_members" ADD CONSTRAINT "association_members_alumni_record_id_fkey" FOREIGN KEY ("alumni_record_id") REFERENCES public."alumni_database" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."association_members" ADD CONSTRAINT "association_members_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."association_members" ADD CONSTRAINT "association_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases_decision_actor_user_id_fkey" FOREIGN KEY ("decision_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases_decision_item_id_fkey" FOREIGN KEY ("decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases_supersede_actor_user_id_fkey" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_match_cases" ADD CONSTRAINT "member_match_cases_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."member_match_cases" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates_decision_actor_user_id_fkey" FOREIGN KEY ("decision_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates_decision_item_id_fkey" FOREIGN KEY ("decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_match_candidates" ADD CONSTRAINT "member_match_candidates_root_case_id_fkey" FOREIGN KEY ("root_case_id") REFERENCES public."member_match_cases" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_identity_link_history" ADD CONSTRAINT "member_identity_link_history_decision_actor_user_id_fkey" FOREIGN KEY ("decision_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_identity_link_history" ADD CONSTRAINT "member_identity_link_history_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_identity_link_history" ADD CONSTRAINT "member_identity_link_history_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."member_identity_link_history" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments_decision_item_id_fkey" FOREIGN KEY ("decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments_match_candidate_id_fkey" FOREIGN KEY ("match_candidate_id") REFERENCES public."member_match_candidates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments_match_case_id_fkey" FOREIGN KEY ("match_case_id") REFERENCES public."member_match_cases" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."member_position_assignments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES public."dues_policies" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings_source_logical_id_fkey" FOREIGN KEY ("source_logical_id") REFERENCES public."accounting_logical_sources" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings_supersede_actor_user_id_fkey" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_position_tier_mappings" ADD CONSTRAINT "dues_position_tier_mappings_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."dues_position_tier_mappings" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history_basis_assignment_id_fkey" FOREIGN KEY ("basis_assignment_id") REFERENCES public."member_position_assignments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history_derived_actor_user_id_fkey" FOREIGN KEY ("derived_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES public."dues_position_tier_mappings" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES public."dues_policies" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."member_dues_tier_history" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies_source_logical_id_fkey" FOREIGN KEY ("source_logical_id") REFERENCES public."accounting_logical_sources" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies_supersede_actor_user_id_fkey" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_policies" ADD CONSTRAINT "dues_policies_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."dues_policies" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges_mapping_id_fkey" FOREIGN KEY ("mapping_id") REFERENCES public."dues_position_tier_mappings" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES public."dues_policies" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."dues_pledges" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_pledges" ADD CONSTRAINT "dues_pledges_tier_history_id_fkey" FOREIGN KEY ("tier_history_id") REFERENCES public."member_dues_tier_history" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments_reversal_actor_user_id_fkey" FOREIGN KEY ("reversal_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments_supersede_actor_user_id_fkey" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."member_assessments" ADD CONSTRAINT "member_assessments_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."member_assessments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots_pledge_id_fkey" FOREIGN KEY ("pledge_id") REFERENCES public."dues_pledges" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES public."dues_policies" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."dues_status_snapshots" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_status_snapshots" ADD CONSTRAINT "dues_status_snapshots_tier_history_id_fkey" FOREIGN KEY ("tier_history_id") REFERENCES public."member_dues_tier_history" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_logical_sources" ADD CONSTRAINT "accounting_logical_sources_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_source_releases" ADD CONSTRAINT "accounting_source_releases_logical_source_id_fkey" FOREIGN KEY ("logical_source_id") REFERENCES public."accounting_logical_sources" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_source_releases" ADD CONSTRAINT "accounting_source_releases_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_source_account_mappings" ADD CONSTRAINT "bank_source_account_mappings_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES public."bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_source_account_mappings" ADD CONSTRAINT "bank_source_account_mappings_logical_source_id_fkey" FOREIGN KEY ("logical_source_id") REFERENCES public."accounting_logical_sources" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_source_account_mappings" ADD CONSTRAINT "bank_source_account_mappings_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches_apply_actor_user_id_fkey" FOREIGN KEY ("apply_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches_failure_actor_user_id_fkey" FOREIGN KEY ("failure_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches_preview_actor_user_id_fkey" FOREIGN KEY ("preview_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches_source_release_id_fkey" FOREIGN KEY ("source_release_id") REFERENCES public."accounting_source_releases" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_coordinates" ADD CONSTRAINT "accounting_import_coordinates_logical_source_id_fkey" FOREIGN KEY ("logical_source_id") REFERENCES public."accounting_logical_sources" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_coordinates" ADD CONSTRAINT "accounting_import_coordinates_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_row_versions" ADD CONSTRAINT "accounting_import_row_versions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES public."accounting_import_batches" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_row_versions" ADD CONSTRAINT "accounting_import_row_versions_coordinate_id_fkey" FOREIGN KEY ("coordinate_id") REFERENCES public."accounting_import_coordinates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_row_versions" ADD CONSTRAINT "accounting_import_row_versions_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_row_versions" ADD CONSTRAINT "accounting_import_row_versions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_batch_rows" ADD CONSTRAINT "accounting_import_batch_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES public."accounting_import_batches" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_batch_rows" ADD CONSTRAINT "accounting_import_batch_rows_coordinate_id_fkey" FOREIGN KEY ("coordinate_id") REFERENCES public."accounting_import_coordinates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_batch_rows" ADD CONSTRAINT "accounting_import_batch_rows_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_import_batch_rows" ADD CONSTRAINT "accounting_import_batch_rows_row_version_id_fkey" FOREIGN KEY ("row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES public."accounting_import_batches" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets_preview_actor_user_id_fkey" FOREIGN KEY ("preview_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets_rejection_actor_user_id_fkey" FOREIGN KEY ("rejection_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."source_decision_sets" ADD CONSTRAINT "source_decision_sets_supersede_actor_user_id_fkey" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."source_decision_items" ADD CONSTRAINT "source_decision_items_coordinate_id_fkey" FOREIGN KEY ("coordinate_id") REFERENCES public."accounting_import_coordinates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_decision_items" ADD CONSTRAINT "source_decision_items_decision_set_id_fkey" FOREIGN KEY ("decision_set_id") REFERENCES public."source_decision_sets" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_decision_items" ADD CONSTRAINT "source_decision_items_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."source_decision_items" ADD CONSTRAINT "source_decision_items_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_parties" ADD CONSTRAINT "economic_event_parties_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_party_aliases" ADD CONSTRAINT "economic_event_party_aliases_decision_item_id_fkey" FOREIGN KEY ("decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_party_aliases" ADD CONSTRAINT "economic_event_party_aliases_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES public."economic_event_parties" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_party_aliases" ADD CONSTRAINT "economic_event_party_aliases_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_party_aliases" ADD CONSTRAINT "economic_event_party_aliases_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_coordinate_id_fkey" FOREIGN KEY ("coordinate_id") REFERENCES public."accounting_import_coordinates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_decision_actor_user_id_fkey" FOREIGN KEY ("decision_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_decision_item_id_fkey" FOREIGN KEY ("decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_event_party_id_fkey" FOREIGN KEY ("event_party_id") REFERENCES public."economic_event_parties" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_member_match_can_5dedd0d63f" FOREIGN KEY ("member_match_candidate_id") REFERENCES public."member_match_candidates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_member_match_case_id_fkey" FOREIGN KEY ("member_match_case_id") REFERENCES public."member_match_cases" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_member_match_dec_63326aa193" FOREIGN KEY ("member_match_decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_refund_receipt_id_fkey" FOREIGN KEY ("refund_receipt_id") REFERENCES public."dues_receipts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_resolve_actor_user_id_fkey" FOREIGN KEY ("resolve_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_reverses_event_id_fkey" FOREIGN KEY ("reverses_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_supersede_actor__62042f1822" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."source_row_classification_decisions" ADD CONSTRAINT "source_row_classification_decisions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."source_row_classification_decisions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_claim_actor_user_id_fkey" FOREIGN KEY ("claim_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_coordinate_id_fkey" FOREIGN KEY ("coordinate_id") REFERENCES public."accounting_import_coordinates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_decision_actor_user_id_fkey" FOREIGN KEY ("decision_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_event_party_id_fkey" FOREIGN KEY ("event_party_id") REFERENCES public."economic_event_parties" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_supersede_actor_user_id_fkey" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_claims" ADD CONSTRAINT "economic_event_claims_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."economic_event_claims" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events_rejection_actor_user_id_fkey" FOREIGN KEY ("rejection_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_events" ADD CONSTRAINT "economic_events_reverses_event_id_fkey" FOREIGN KEY ("reverses_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_provenance" ADD CONSTRAINT "economic_event_provenance_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_provenance" ADD CONSTRAINT "economic_event_provenance_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_provenance" ADD CONSTRAINT "economic_event_provenance_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_authority_decisions" ADD CONSTRAINT "economic_event_authority_decisions_decision_actor_user_id_fkey" FOREIGN KEY ("decision_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_authority_decisions" ADD CONSTRAINT "economic_event_authority_decisions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_authority_decisions" ADD CONSTRAINT "economic_event_authority_decisions_selected_provenance_id_fkey" FOREIGN KEY ("selected_provenance_id") REFERENCES public."economic_event_provenance" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_authority_decisions" ADD CONSTRAINT "economic_event_authority_decisions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."economic_event_authority_decisions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_canonicalizations" ADD CONSTRAINT "economic_event_canonicalizations_canonical_event_id_fkey" FOREIGN KEY ("canonical_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_canonicalizations" ADD CONSTRAINT "economic_event_canonicalizations_decision_actor_user_id_fkey" FOREIGN KEY ("decision_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_canonicalizations" ADD CONSTRAINT "economic_event_canonicalizations_duplicate_event_id_fkey" FOREIGN KEY ("duplicate_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions_canonicalization_id_fkey" FOREIGN KEY ("canonicalization_id") REFERENCES public."economic_event_canonicalizations" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions_higher_event_id_fkey" FOREIGN KEY ("higher_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions_lower_event_id_fkey" FOREIGN KEY ("lower_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."economic_event_collisions" ADD CONSTRAINT "economic_event_collisions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."economic_event_collisions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions_candidate_event_id_fkey" FOREIGN KEY ("candidate_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions_created_event_id_fkey" FOREIGN KEY ("created_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions_decision_actor_user_id_fkey" FOREIGN KEY ("decision_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions_legacy_payment_id_fkey" FOREIGN KEY ("legacy_payment_id") REFERENCES public."payments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions_preview_batch_id_fkey" FOREIGN KEY ("preview_batch_id") REFERENCES public."accounting_import_batches" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."legacy_payment_decisions" ADD CONSTRAINT "legacy_payment_decisions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."legacy_payment_decisions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."legacy_cutover_states" ADD CONSTRAINT "legacy_cutover_states_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."legacy_cutover_states" ADD CONSTRAINT "legacy_cutover_states_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."legacy_cutover_states" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_periods" ADD CONSTRAINT "accounting_periods_boundary_evidence_row_version_id_fkey" FOREIGN KEY ("boundary_evidence_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_periods" ADD CONSTRAINT "accounting_periods_boundary_source_row_version_id_fkey" FOREIGN KEY ("boundary_source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_periods" ADD CONSTRAINT "accounting_periods_decision_item_id_fkey" FOREIGN KEY ("decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_periods" ADD CONSTRAINT "accounting_periods_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES public."bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_transactions" ADD CONSTRAINT "bank_transactions_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_balance_anchors" ADD CONSTRAINT "bank_balance_anchors_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES public."bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_balance_anchors" ADD CONSTRAINT "bank_balance_anchors_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_balance_anchors" ADD CONSTRAINT "bank_balance_anchors_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches_credit_transaction_id_fkey" FOREIGN KEY ("credit_transaction_id") REFERENCES public."bank_transactions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches_debit_transaction_id_fkey" FOREIGN KEY ("debit_transaction_id") REFERENCES public."bank_transactions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_transfer_matches" ADD CONSTRAINT "bank_transfer_matches_rejection_actor_user_id_fkey" FOREIGN KEY ("rejection_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories_supersede_actor_user_id_fkey" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."accounting_categories" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES public."accounting_categories" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries_corrects_entry_id_fkey" FOREIGN KEY ("corrects_entry_id") REFERENCES public."cashbook_entries" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries_discard_actor_user_id_fkey" FOREIGN KEY ("discard_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES public."accounting_periods" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."cashbook_entries" ADD CONSTRAINT "cashbook_entries_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts_decision_item_id_fkey" FOREIGN KEY ("decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts_legacy_decision_id_fkey" FOREIGN KEY ("legacy_decision_id") REFERENCES public."legacy_payment_decisions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipts" ADD CONSTRAINT "dues_receipts_rejection_actor_user_id_fkey" FOREIGN KEY ("rejection_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES public."dues_receipts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals_refund_event_id_fkey" FOREIGN KEY ("refund_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_receipt_reversals" ADD CONSTRAINT "dues_receipt_reversals_rejection_actor_user_id_fkey" FOREIGN KEY ("rejection_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES public."dues_receipts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups_rejection_actor_user_id_fkey" FOREIGN KEY ("rejection_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_payment_groups" ADD CONSTRAINT "dues_payment_groups_roster_batch_id_fkey" FOREIGN KEY ("roster_batch_id") REFERENCES public."accounting_import_batches" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_decision_actor_user_id_fkey" FOREIGN KEY ("decision_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_decision_item_id_fkey" FOREIGN KEY ("decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES public."dues_payment_groups" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_match_candidate_id_fkey" FOREIGN KEY ("match_candidate_id") REFERENCES public."member_match_candidates" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_match_case_id_fkey" FOREIGN KEY ("match_case_id") REFERENCES public."member_match_cases" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_source_row_version_id_fkey" FOREIGN KEY ("source_row_version_id") REFERENCES public."accounting_import_row_versions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_supersede_actor_user_id_fkey" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_group_members" ADD CONSTRAINT "dues_group_members_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."dues_group_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES public."member_assessments" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_decision_item_id_fkey" FOREIGN KEY ("decision_item_id") REFERENCES public."source_decision_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_funding_event_id_fkey" FOREIGN KEY ("funding_event_id") REFERENCES public."economic_events" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_group_member_id_fkey" FOREIGN KEY ("group_member_id") REFERENCES public."dues_group_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_legacy_decision_id_fkey" FOREIGN KEY ("legacy_decision_id") REFERENCES public."legacy_payment_decisions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_member_id_fkey" FOREIGN KEY ("member_id") REFERENCES public."association_members" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES public."dues_receipts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_receipt_reversal_id_fkey" FOREIGN KEY ("receipt_reversal_id") REFERENCES public."dues_receipt_reversals" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_rejection_actor_user_id_fkey" FOREIGN KEY ("rejection_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."dues_allocations" ADD CONSTRAINT "dues_allocations_reverses_allocation_id_fkey" FOREIGN KEY ("reverses_allocation_id") REFERENCES public."dues_allocations" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES public."bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_anchor_id_fkey" FOREIGN KEY ("anchor_id") REFERENCES public."bank_balance_anchors" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_approval_actor_user_id_fkey" FOREIGN KEY ("approval_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_ending_transaction_id_fkey" FOREIGN KEY ("ending_transaction_id") REFERENCES public."bank_transactions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES public."accounting_periods" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_rejection_actor_user_id_fkey" FOREIGN KEY ("rejection_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliations" ADD CONSTRAINT "bank_reconciliations_supersedes_reconciliation_id_fkey" FOREIGN KEY ("supersedes_reconciliation_id") REFERENCES public."bank_reconciliations" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_bank_transaction_id_fkey" FOREIGN KEY ("bank_transaction_id") REFERENCES public."bank_transactions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_reconciliation_id_fkey" FOREIGN KEY ("reconciliation_id") REFERENCES public."bank_reconciliations" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_items" ADD CONSTRAINT "bank_reconciliation_items_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_binding_actor_user_id_fkey" FOREIGN KEY ("binding_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_from_item_id_fkey" FOREIGN KEY ("from_item_id") REFERENCES public."bank_reconciliation_items" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_recorded_actor_user_id_fkey" FOREIGN KEY ("recorded_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_resolution_actor_user_id_fkey" FOREIGN KEY ("resolution_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_resolved_by_transa_e112473818" FOREIGN KEY ("resolved_by_transaction_id") REFERENCES public."bank_transactions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_supersede_actor_user_id_fkey" FOREIGN KEY ("supersede_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."bank_reconciliation_carryforwards" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_target_account_id_fkey" FOREIGN KEY ("target_account_id") REFERENCES public."bank_accounts" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_target_period_id_fkey" FOREIGN KEY ("target_period_id") REFERENCES public."accounting_periods" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."bank_reconciliation_carryforwards" ADD CONSTRAINT "bank_reconciliation_carryforwards_to_reconciliation_id_fkey" FOREIGN KEY ("to_reconciliation_id") REFERENCES public."bank_reconciliations" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."accounting_audit_events" ADD CONSTRAINT "accounting_audit_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
CREATE INDEX "accounting_audit_events__actor_user_id__idx" ON public."accounting_audit_events" USING btree ("actor_user_id");
CREATE INDEX "accounting_categories__approval_actor_user_id__idx" ON public."accounting_categories" USING btree ("approval_actor_user_id");
CREATE INDEX "accounting_categories__recorded_actor_user_id__idx" ON public."accounting_categories" USING btree ("recorded_actor_user_id");
CREATE INDEX "accounting_categories__supersede_actor_user_id__idx" ON public."accounting_categories" USING btree ("supersede_actor_user_id");
CREATE INDEX "accounting_categories__supersedes_id__idx" ON public."accounting_categories" USING btree ("supersedes_id");
CREATE INDEX "accounting_import_batch_rows__batch_id__idx" ON public."accounting_import_batch_rows" USING btree ("batch_id");
CREATE INDEX "accounting_import_batch_rows__coordinate_id__idx" ON public."accounting_import_batch_rows" USING btree ("coordinate_id");
CREATE INDEX "accounting_import_batch_rows__recorded_actor_user_id__idx" ON public."accounting_import_batch_rows" USING btree ("recorded_actor_user_id");
CREATE INDEX "accounting_import_batch_rows__row_version_id__idx" ON public."accounting_import_batch_rows" USING btree ("row_version_id");
CREATE INDEX "accounting_import_batches__apply_actor_user_id__idx" ON public."accounting_import_batches" USING btree ("apply_actor_user_id");
CREATE INDEX "accounting_import_batches__failure_actor_user_id__idx" ON public."accounting_import_batches" USING btree ("failure_actor_user_id");
CREATE INDEX "accounting_import_batches__preview_actor_user_id__idx" ON public."accounting_import_batches" USING btree ("preview_actor_user_id");
CREATE INDEX "accounting_import_batches__source_release_id__idx" ON public."accounting_import_batches" USING btree ("source_release_id");
CREATE INDEX "accounting_import_coordinates__logical_source_id__idx" ON public."accounting_import_coordinates" USING btree ("logical_source_id");
CREATE INDEX "accounting_import_coordinates__recorded_actor_user_id__idx" ON public."accounting_import_coordinates" USING btree ("recorded_actor_user_id");
CREATE INDEX "accounting_import_row_versions__batch_id__idx" ON public."accounting_import_row_versions" USING btree ("batch_id");
CREATE INDEX "accounting_import_row_versions__coordinate_id__idx" ON public."accounting_import_row_versions" USING btree ("coordinate_id");
CREATE INDEX "accounting_import_row_versions__recorded_actor_user_id__idx" ON public."accounting_import_row_versions" USING btree ("recorded_actor_user_id");
CREATE INDEX "accounting_import_row_versions__supersedes_id__idx" ON public."accounting_import_row_versions" USING btree ("supersedes_id");
CREATE INDEX "accounting_logical_sources__recorded_actor_user_id__idx" ON public."accounting_logical_sources" USING btree ("recorded_actor_user_id");
CREATE INDEX "accounting_periods__boundary_evidence_row_version_id__idx" ON public."accounting_periods" USING btree ("boundary_evidence_row_version_id");
CREATE INDEX "accounting_periods__boundary_source_row_version_id__idx" ON public."accounting_periods" USING btree ("boundary_source_row_version_id");
CREATE INDEX "accounting_periods__decision_item_id__idx" ON public."accounting_periods" USING btree ("decision_item_id");
CREATE INDEX "accounting_periods__recorded_actor_user_id__idx" ON public."accounting_periods" USING btree ("recorded_actor_user_id");
CREATE INDEX "accounting_source_releases__logical_source_id__idx" ON public."accounting_source_releases" USING btree ("logical_source_id");
CREATE INDEX "accounting_source_releases__recorded_actor_user_id__idx" ON public."accounting_source_releases" USING btree ("recorded_actor_user_id");
CREATE INDEX "association_members__alumni_record_id__idx" ON public."association_members" USING btree ("alumni_record_id");
CREATE INDEX "association_members__recorded_actor_user_id__idx" ON public."association_members" USING btree ("recorded_actor_user_id");
CREATE INDEX "association_members__user_id__idx" ON public."association_members" USING btree ("user_id");
CREATE INDEX "bank_accounts__recorded_actor_user_id__idx" ON public."bank_accounts" USING btree ("recorded_actor_user_id");
CREATE INDEX "bank_balance_anchors__account_id__idx" ON public."bank_balance_anchors" USING btree ("account_id");
CREATE INDEX "bank_balance_anchors__recorded_actor_user_id__idx" ON public."bank_balance_anchors" USING btree ("recorded_actor_user_id");
CREATE INDEX "bank_balance_anchors__source_row_version_id__idx" ON public."bank_balance_anchors" USING btree ("source_row_version_id");
CREATE INDEX "bank_reconciliation_carryforwards__binding_actor_user_id__idx" ON public."bank_reconciliation_carryforwards" USING btree ("binding_actor_user_id");
CREATE INDEX "bank_reconciliation_carryforwards__from_item_id__idx" ON public."bank_reconciliation_carryforwards" USING btree ("from_item_id");
CREATE INDEX "bank_reconciliation_carryforwards__recorded_actor_user_id__idx" ON public."bank_reconciliation_carryforwards" USING btree ("recorded_actor_user_id");
CREATE INDEX "bank_reconciliation_carryforwards__resolution_actor__bfeb2d5a88" ON public."bank_reconciliation_carryforwards" USING btree ("resolution_actor_user_id");
CREATE INDEX "bank_reconciliation_carryforwards__resolved_by_trans_260f5fdb76" ON public."bank_reconciliation_carryforwards" USING btree ("resolved_by_transaction_id");
CREATE INDEX "bank_reconciliation_carryforwards__supersede_actor_user_id__idx" ON public."bank_reconciliation_carryforwards" USING btree ("supersede_actor_user_id");
CREATE INDEX "bank_reconciliation_carryforwards__supersedes_id__idx" ON public."bank_reconciliation_carryforwards" USING btree ("supersedes_id");
CREATE INDEX "bank_reconciliation_carryforwards__target_account_id__idx" ON public."bank_reconciliation_carryforwards" USING btree ("target_account_id");
CREATE INDEX "bank_reconciliation_carryforwards__target_period_id__idx" ON public."bank_reconciliation_carryforwards" USING btree ("target_period_id");
CREATE INDEX "bank_reconciliation_carryforwards__to_reconciliation_id__idx" ON public."bank_reconciliation_carryforwards" USING btree ("to_reconciliation_id");
CREATE INDEX "bank_reconciliation_items__bank_transaction_id__idx" ON public."bank_reconciliation_items" USING btree ("bank_transaction_id");
CREATE INDEX "bank_reconciliation_items__reconciliation_id__idx" ON public."bank_reconciliation_items" USING btree ("reconciliation_id");
CREATE INDEX "bank_reconciliation_items__recorded_actor_user_id__idx" ON public."bank_reconciliation_items" USING btree ("recorded_actor_user_id");
CREATE INDEX "bank_reconciliations__account_id__idx" ON public."bank_reconciliations" USING btree ("account_id");
CREATE INDEX "bank_reconciliations__anchor_id__idx" ON public."bank_reconciliations" USING btree ("anchor_id");
CREATE INDEX "bank_reconciliations__approval_actor_user_id__idx" ON public."bank_reconciliations" USING btree ("approval_actor_user_id");
CREATE INDEX "bank_reconciliations__ending_transaction_id__idx" ON public."bank_reconciliations" USING btree ("ending_transaction_id");
CREATE INDEX "bank_reconciliations__period_id__idx" ON public."bank_reconciliations" USING btree ("period_id");
CREATE INDEX "bank_reconciliations__recorded_actor_user_id__idx" ON public."bank_reconciliations" USING btree ("recorded_actor_user_id");
CREATE INDEX "bank_reconciliations__rejection_actor_user_id__idx" ON public."bank_reconciliations" USING btree ("rejection_actor_user_id");
CREATE INDEX "bank_reconciliations__supersedes_reconciliation_id__idx" ON public."bank_reconciliations" USING btree ("supersedes_reconciliation_id");
CREATE INDEX "bank_source_account_mappings__account_id__idx" ON public."bank_source_account_mappings" USING btree ("account_id");
CREATE INDEX "bank_source_account_mappings__logical_source_id__idx" ON public."bank_source_account_mappings" USING btree ("logical_source_id");
CREATE INDEX "bank_source_account_mappings__recorded_actor_user_id__idx" ON public."bank_source_account_mappings" USING btree ("recorded_actor_user_id");
CREATE INDEX "bank_transactions__account_id__idx" ON public."bank_transactions" USING btree ("account_id");
CREATE INDEX "bank_transactions__event_id__idx" ON public."bank_transactions" USING btree ("event_id");
CREATE INDEX "bank_transactions__recorded_actor_user_id__idx" ON public."bank_transactions" USING btree ("recorded_actor_user_id");
CREATE INDEX "bank_transactions__source_row_version_id__idx" ON public."bank_transactions" USING btree ("source_row_version_id");
CREATE INDEX "bank_transfer_matches__approval_actor_user_id__idx" ON public."bank_transfer_matches" USING btree ("approval_actor_user_id");
CREATE INDEX "bank_transfer_matches__credit_transaction_id__idx" ON public."bank_transfer_matches" USING btree ("credit_transaction_id");
CREATE INDEX "bank_transfer_matches__debit_transaction_id__idx" ON public."bank_transfer_matches" USING btree ("debit_transaction_id");
CREATE INDEX "bank_transfer_matches__recorded_actor_user_id__idx" ON public."bank_transfer_matches" USING btree ("recorded_actor_user_id");
CREATE INDEX "bank_transfer_matches__rejection_actor_user_id__idx" ON public."bank_transfer_matches" USING btree ("rejection_actor_user_id");
CREATE INDEX "business_operation_entities__operation_uid__idx" ON public."business_operation_entities" USING btree ("operation_uid");
CREATE INDEX "business_operation_receipts__actor_target_user_id__idx" ON public."business_operation_receipts" USING btree ("actor_target_user_id");
CREATE INDEX "business_operation_receipts__actor_user_id__idx" ON public."business_operation_receipts" USING btree ("actor_user_id");
CREATE INDEX "cashbook_entries__approval_actor_user_id__idx" ON public."cashbook_entries" USING btree ("approval_actor_user_id");
CREATE INDEX "cashbook_entries__category_id__idx" ON public."cashbook_entries" USING btree ("category_id");
CREATE INDEX "cashbook_entries__corrects_entry_id__idx" ON public."cashbook_entries" USING btree ("corrects_entry_id");
CREATE INDEX "cashbook_entries__discard_actor_user_id__idx" ON public."cashbook_entries" USING btree ("discard_actor_user_id");
CREATE INDEX "cashbook_entries__event_id__idx" ON public."cashbook_entries" USING btree ("event_id");
CREATE INDEX "cashbook_entries__period_id__idx" ON public."cashbook_entries" USING btree ("period_id");
CREATE INDEX "cashbook_entries__recorded_actor_user_id__idx" ON public."cashbook_entries" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_allocations__approval_actor_user_id__idx" ON public."dues_allocations" USING btree ("approval_actor_user_id");
CREATE INDEX "dues_allocations__assessment_id__idx" ON public."dues_allocations" USING btree ("assessment_id");
CREATE INDEX "dues_allocations__decision_item_id__idx" ON public."dues_allocations" USING btree ("decision_item_id");
CREATE INDEX "dues_allocations__funding_event_id__idx" ON public."dues_allocations" USING btree ("funding_event_id");
CREATE INDEX "dues_allocations__group_member_id__idx" ON public."dues_allocations" USING btree ("group_member_id");
CREATE INDEX "dues_allocations__legacy_decision_id__idx" ON public."dues_allocations" USING btree ("legacy_decision_id");
CREATE INDEX "dues_allocations__member_id__idx" ON public."dues_allocations" USING btree ("member_id");
CREATE INDEX "dues_allocations__receipt_id__idx" ON public."dues_allocations" USING btree ("receipt_id");
CREATE INDEX "dues_allocations__receipt_reversal_id__idx" ON public."dues_allocations" USING btree ("receipt_reversal_id");
CREATE INDEX "dues_allocations__recorded_actor_user_id__idx" ON public."dues_allocations" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_allocations__rejection_actor_user_id__idx" ON public."dues_allocations" USING btree ("rejection_actor_user_id");
CREATE INDEX "dues_allocations__reverses_allocation_id__idx" ON public."dues_allocations" USING btree ("reverses_allocation_id");
CREATE INDEX "dues_group_members__decision_actor_user_id__idx" ON public."dues_group_members" USING btree ("decision_actor_user_id");
CREATE INDEX "dues_group_members__decision_item_id__idx" ON public."dues_group_members" USING btree ("decision_item_id");
CREATE INDEX "dues_group_members__group_id__idx" ON public."dues_group_members" USING btree ("group_id");
CREATE INDEX "dues_group_members__match_candidate_id__idx" ON public."dues_group_members" USING btree ("match_candidate_id");
CREATE INDEX "dues_group_members__match_case_id__idx" ON public."dues_group_members" USING btree ("match_case_id");
CREATE INDEX "dues_group_members__member_id__idx" ON public."dues_group_members" USING btree ("member_id");
CREATE INDEX "dues_group_members__recorded_actor_user_id__idx" ON public."dues_group_members" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_group_members__source_row_version_id__idx" ON public."dues_group_members" USING btree ("source_row_version_id");
CREATE INDEX "dues_group_members__supersede_actor_user_id__idx" ON public."dues_group_members" USING btree ("supersede_actor_user_id");
CREATE INDEX "dues_group_members__supersedes_id__idx" ON public."dues_group_members" USING btree ("supersedes_id");
CREATE INDEX "dues_payment_groups__approval_actor_user_id__idx" ON public."dues_payment_groups" USING btree ("approval_actor_user_id");
CREATE INDEX "dues_payment_groups__receipt_id__idx" ON public."dues_payment_groups" USING btree ("receipt_id");
CREATE INDEX "dues_payment_groups__recorded_actor_user_id__idx" ON public."dues_payment_groups" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_payment_groups__rejection_actor_user_id__idx" ON public."dues_payment_groups" USING btree ("rejection_actor_user_id");
CREATE INDEX "dues_payment_groups__roster_batch_id__idx" ON public."dues_payment_groups" USING btree ("roster_batch_id");
CREATE INDEX "dues_pledges__mapping_id__idx" ON public."dues_pledges" USING btree ("mapping_id");
CREATE INDEX "dues_pledges__member_id__idx" ON public."dues_pledges" USING btree ("member_id");
CREATE INDEX "dues_pledges__policy_id__idx" ON public."dues_pledges" USING btree ("policy_id");
CREATE INDEX "dues_pledges__recorded_actor_user_id__idx" ON public."dues_pledges" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_pledges__supersedes_id__idx" ON public."dues_pledges" USING btree ("supersedes_id");
CREATE INDEX "dues_pledges__tier_history_id__idx" ON public."dues_pledges" USING btree ("tier_history_id");
CREATE INDEX "dues_policies__approval_actor_user_id__idx" ON public."dues_policies" USING btree ("approval_actor_user_id");
CREATE INDEX "dues_policies__recorded_actor_user_id__idx" ON public."dues_policies" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_policies__source_logical_id__idx" ON public."dues_policies" USING btree ("source_logical_id");
CREATE INDEX "dues_policies__source_row_version_id__idx" ON public."dues_policies" USING btree ("source_row_version_id");
CREATE INDEX "dues_policies__supersede_actor_user_id__idx" ON public."dues_policies" USING btree ("supersede_actor_user_id");
CREATE INDEX "dues_policies__supersedes_id__idx" ON public."dues_policies" USING btree ("supersedes_id");
CREATE INDEX "dues_position_tier_mappings__approval_actor_user_id__idx" ON public."dues_position_tier_mappings" USING btree ("approval_actor_user_id");
CREATE INDEX "dues_position_tier_mappings__policy_id__idx" ON public."dues_position_tier_mappings" USING btree ("policy_id");
CREATE INDEX "dues_position_tier_mappings__recorded_actor_user_id__idx" ON public."dues_position_tier_mappings" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_position_tier_mappings__source_logical_id__idx" ON public."dues_position_tier_mappings" USING btree ("source_logical_id");
CREATE INDEX "dues_position_tier_mappings__source_row_version_id__idx" ON public."dues_position_tier_mappings" USING btree ("source_row_version_id");
CREATE INDEX "dues_position_tier_mappings__supersede_actor_user_id__idx" ON public."dues_position_tier_mappings" USING btree ("supersede_actor_user_id");
CREATE INDEX "dues_position_tier_mappings__supersedes_id__idx" ON public."dues_position_tier_mappings" USING btree ("supersedes_id");
CREATE INDEX "dues_receipt_reversals__approval_actor_user_id__idx" ON public."dues_receipt_reversals" USING btree ("approval_actor_user_id");
CREATE INDEX "dues_receipt_reversals__receipt_id__idx" ON public."dues_receipt_reversals" USING btree ("receipt_id");
CREATE INDEX "dues_receipt_reversals__recorded_actor_user_id__idx" ON public."dues_receipt_reversals" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_receipt_reversals__refund_event_id__idx" ON public."dues_receipt_reversals" USING btree ("refund_event_id");
CREATE INDEX "dues_receipt_reversals__rejection_actor_user_id__idx" ON public."dues_receipt_reversals" USING btree ("rejection_actor_user_id");
CREATE INDEX "dues_receipts__approval_actor_user_id__idx" ON public."dues_receipts" USING btree ("approval_actor_user_id");
CREATE INDEX "dues_receipts__decision_item_id__idx" ON public."dues_receipts" USING btree ("decision_item_id");
CREATE INDEX "dues_receipts__event_id__idx" ON public."dues_receipts" USING btree ("event_id");
CREATE INDEX "dues_receipts__legacy_decision_id__idx" ON public."dues_receipts" USING btree ("legacy_decision_id");
CREATE INDEX "dues_receipts__recorded_actor_user_id__idx" ON public."dues_receipts" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_receipts__rejection_actor_user_id__idx" ON public."dues_receipts" USING btree ("rejection_actor_user_id");
CREATE INDEX "dues_status_snapshots__member_id__idx" ON public."dues_status_snapshots" USING btree ("member_id");
CREATE INDEX "dues_status_snapshots__pledge_id__idx" ON public."dues_status_snapshots" USING btree ("pledge_id");
CREATE INDEX "dues_status_snapshots__policy_id__idx" ON public."dues_status_snapshots" USING btree ("policy_id");
CREATE INDEX "dues_status_snapshots__recorded_actor_user_id__idx" ON public."dues_status_snapshots" USING btree ("recorded_actor_user_id");
CREATE INDEX "dues_status_snapshots__supersedes_id__idx" ON public."dues_status_snapshots" USING btree ("supersedes_id");
CREATE INDEX "dues_status_snapshots__tier_history_id__idx" ON public."dues_status_snapshots" USING btree ("tier_history_id");
CREATE INDEX "economic_event_authority_decisions__decision_actor_user_id__idx" ON public."economic_event_authority_decisions" USING btree ("decision_actor_user_id");
CREATE INDEX "economic_event_authority_decisions__event_id__idx" ON public."economic_event_authority_decisions" USING btree ("event_id");
CREATE INDEX "economic_event_authority_decisions__selected_provenance_id__idx" ON public."economic_event_authority_decisions" USING btree ("selected_provenance_id");
CREATE INDEX "economic_event_authority_decisions__supersedes_id__idx" ON public."economic_event_authority_decisions" USING btree ("supersedes_id");
CREATE INDEX "economic_event_canonicalizations__canonical_event_id__idx" ON public."economic_event_canonicalizations" USING btree ("canonical_event_id");
CREATE INDEX "economic_event_canonicalizations__decision_actor_user_id__idx" ON public."economic_event_canonicalizations" USING btree ("decision_actor_user_id");
CREATE INDEX "economic_event_canonicalizations__duplicate_event_id__idx" ON public."economic_event_canonicalizations" USING btree ("duplicate_event_id");
CREATE INDEX "economic_event_claims__claim_actor_user_id__idx" ON public."economic_event_claims" USING btree ("claim_actor_user_id");
CREATE INDEX "economic_event_claims__coordinate_id__idx" ON public."economic_event_claims" USING btree ("coordinate_id");
CREATE INDEX "economic_event_claims__decision_actor_user_id__idx" ON public."economic_event_claims" USING btree ("decision_actor_user_id");
CREATE INDEX "economic_event_claims__event_id__idx" ON public."economic_event_claims" USING btree ("event_id");
CREATE INDEX "economic_event_claims__event_party_id__idx" ON public."economic_event_claims" USING btree ("event_party_id");
CREATE INDEX "economic_event_claims__member_id__idx" ON public."economic_event_claims" USING btree ("member_id");
CREATE INDEX "economic_event_claims__source_row_version_id__idx" ON public."economic_event_claims" USING btree ("source_row_version_id");
CREATE INDEX "economic_event_claims__supersede_actor_user_id__idx" ON public."economic_event_claims" USING btree ("supersede_actor_user_id");
CREATE INDEX "economic_event_claims__supersedes_id__idx" ON public."economic_event_claims" USING btree ("supersedes_id");
CREATE INDEX "economic_event_collisions__canonicalization_id__idx" ON public."economic_event_collisions" USING btree ("canonicalization_id");
CREATE INDEX "economic_event_collisions__higher_event_id__idx" ON public."economic_event_collisions" USING btree ("higher_event_id");
CREATE INDEX "economic_event_collisions__lower_event_id__idx" ON public."economic_event_collisions" USING btree ("lower_event_id");
CREATE INDEX "economic_event_collisions__recorded_actor_user_id__idx" ON public."economic_event_collisions" USING btree ("recorded_actor_user_id");
CREATE INDEX "economic_event_collisions__supersedes_id__idx" ON public."economic_event_collisions" USING btree ("supersedes_id");
CREATE INDEX "economic_event_parties__recorded_actor_user_id__idx" ON public."economic_event_parties" USING btree ("recorded_actor_user_id");
CREATE INDEX "economic_event_party_aliases__decision_item_id__idx" ON public."economic_event_party_aliases" USING btree ("decision_item_id");
CREATE INDEX "economic_event_party_aliases__party_id__idx" ON public."economic_event_party_aliases" USING btree ("party_id");
CREATE INDEX "economic_event_party_aliases__recorded_actor_user_id__idx" ON public."economic_event_party_aliases" USING btree ("recorded_actor_user_id");
CREATE INDEX "economic_event_party_aliases__source_row_version_id__idx" ON public."economic_event_party_aliases" USING btree ("source_row_version_id");
CREATE INDEX "economic_event_provenance__event_id__idx" ON public."economic_event_provenance" USING btree ("event_id");
CREATE INDEX "economic_event_provenance__recorded_actor_user_id__idx" ON public."economic_event_provenance" USING btree ("recorded_actor_user_id");
CREATE INDEX "economic_event_provenance__source_row_version_id__idx" ON public."economic_event_provenance" USING btree ("source_row_version_id");
CREATE INDEX "economic_events__approval_actor_user_id__idx" ON public."economic_events" USING btree ("approval_actor_user_id");
CREATE INDEX "economic_events__recorded_actor_user_id__idx" ON public."economic_events" USING btree ("recorded_actor_user_id");
CREATE INDEX "economic_events__rejection_actor_user_id__idx" ON public."economic_events" USING btree ("rejection_actor_user_id");
CREATE INDEX "economic_events__reverses_event_id__idx" ON public."economic_events" USING btree ("reverses_event_id");
CREATE INDEX "legacy_cutover_states__recorded_actor_user_id__idx" ON public."legacy_cutover_states" USING btree ("recorded_actor_user_id");
CREATE INDEX "legacy_cutover_states__supersedes_id__idx" ON public."legacy_cutover_states" USING btree ("supersedes_id");
CREATE INDEX "legacy_payment_decisions__candidate_event_id__idx" ON public."legacy_payment_decisions" USING btree ("candidate_event_id");
CREATE INDEX "legacy_payment_decisions__created_event_id__idx" ON public."legacy_payment_decisions" USING btree ("created_event_id");
CREATE INDEX "legacy_payment_decisions__decision_actor_user_id__idx" ON public."legacy_payment_decisions" USING btree ("decision_actor_user_id");
CREATE INDEX "legacy_payment_decisions__legacy_payment_id__idx" ON public."legacy_payment_decisions" USING btree ("legacy_payment_id");
CREATE INDEX "legacy_payment_decisions__member_id__idx" ON public."legacy_payment_decisions" USING btree ("member_id");
CREATE INDEX "legacy_payment_decisions__preview_batch_id__idx" ON public."legacy_payment_decisions" USING btree ("preview_batch_id");
CREATE INDEX "legacy_payment_decisions__supersedes_id__idx" ON public."legacy_payment_decisions" USING btree ("supersedes_id");
CREATE INDEX "member_activity_events__activity_actor_user_id__idx" ON public."member_activity_events" USING btree ("activity_actor_user_id");
CREATE INDEX "member_activity_events__member_id__idx" ON public."member_activity_events" USING btree ("member_id");
CREATE INDEX "member_activity_events__mutation_history_id__idx" ON public."member_activity_events" USING btree ("mutation_history_id");
CREATE INDEX "member_assessments__approval_actor_user_id__idx" ON public."member_assessments" USING btree ("approval_actor_user_id");
CREATE INDEX "member_assessments__member_id__idx" ON public."member_assessments" USING btree ("member_id");
CREATE INDEX "member_assessments__recorded_actor_user_id__idx" ON public."member_assessments" USING btree ("recorded_actor_user_id");
CREATE INDEX "member_assessments__reversal_actor_user_id__idx" ON public."member_assessments" USING btree ("reversal_actor_user_id");
CREATE INDEX "member_assessments__supersede_actor_user_id__idx" ON public."member_assessments" USING btree ("supersede_actor_user_id");
CREATE INDEX "member_assessments__supersedes_id__idx" ON public."member_assessments" USING btree ("supersedes_id");
CREATE INDEX "member_dues_tier_history__basis_assignment_id__idx" ON public."member_dues_tier_history" USING btree ("basis_assignment_id");
CREATE INDEX "member_dues_tier_history__derived_actor_user_id__idx" ON public."member_dues_tier_history" USING btree ("derived_actor_user_id");
CREATE INDEX "member_dues_tier_history__mapping_id__idx" ON public."member_dues_tier_history" USING btree ("mapping_id");
CREATE INDEX "member_dues_tier_history__member_id__idx" ON public."member_dues_tier_history" USING btree ("member_id");
CREATE INDEX "member_dues_tier_history__policy_id__idx" ON public."member_dues_tier_history" USING btree ("policy_id");
CREATE INDEX "member_dues_tier_history__supersedes_id__idx" ON public."member_dues_tier_history" USING btree ("supersedes_id");
CREATE INDEX "member_identity_link_history__decision_actor_user_id__idx" ON public."member_identity_link_history" USING btree ("decision_actor_user_id");
CREATE INDEX "member_identity_link_history__member_id__idx" ON public."member_identity_link_history" USING btree ("member_id");
CREATE INDEX "member_identity_link_history__supersedes_id__idx" ON public."member_identity_link_history" USING btree ("supersedes_id");
CREATE INDEX "member_match_candidates__decision_actor_user_id__idx" ON public."member_match_candidates" USING btree ("decision_actor_user_id");
CREATE INDEX "member_match_candidates__decision_item_id__idx" ON public."member_match_candidates" USING btree ("decision_item_id");
CREATE INDEX "member_match_candidates__member_id__idx" ON public."member_match_candidates" USING btree ("member_id");
CREATE INDEX "member_match_candidates__recorded_actor_user_id__idx" ON public."member_match_candidates" USING btree ("recorded_actor_user_id");
CREATE INDEX "member_match_candidates__root_case_id__idx" ON public."member_match_candidates" USING btree ("root_case_id");
CREATE INDEX "member_match_cases__decision_actor_user_id__idx" ON public."member_match_cases" USING btree ("decision_actor_user_id");
CREATE INDEX "member_match_cases__decision_item_id__idx" ON public."member_match_cases" USING btree ("decision_item_id");
CREATE INDEX "member_match_cases__recorded_actor_user_id__idx" ON public."member_match_cases" USING btree ("recorded_actor_user_id");
CREATE INDEX "member_match_cases__source_row_version_id__idx" ON public."member_match_cases" USING btree ("source_row_version_id");
CREATE INDEX "member_match_cases__supersede_actor_user_id__idx" ON public."member_match_cases" USING btree ("supersede_actor_user_id");
CREATE INDEX "member_match_cases__supersedes_id__idx" ON public."member_match_cases" USING btree ("supersedes_id");
CREATE INDEX "member_position_assignments__decision_item_id__idx" ON public."member_position_assignments" USING btree ("decision_item_id");
CREATE INDEX "member_position_assignments__match_candidate_id__idx" ON public."member_position_assignments" USING btree ("match_candidate_id");
CREATE INDEX "member_position_assignments__match_case_id__idx" ON public."member_position_assignments" USING btree ("match_case_id");
CREATE INDEX "member_position_assignments__member_id__idx" ON public."member_position_assignments" USING btree ("member_id");
CREATE INDEX "member_position_assignments__recorded_actor_user_id__idx" ON public."member_position_assignments" USING btree ("recorded_actor_user_id");
CREATE INDEX "member_position_assignments__source_row_version_id__idx" ON public."member_position_assignments" USING btree ("source_row_version_id");
CREATE INDEX "member_position_assignments__supersedes_id__idx" ON public."member_position_assignments" USING btree ("supersedes_id");
CREATE INDEX "mutable_entity_action_history__accounting_period_id__idx" ON public."mutable_entity_action_history" USING btree ("accounting_period_id");
CREATE INDEX "mutable_entity_action_history__association_member_id__idx" ON public."mutable_entity_action_history" USING btree ("association_member_id");
CREATE INDEX "mutable_entity_action_history__mutation_actor_user_id__idx" ON public."mutable_entity_action_history" USING btree ("mutation_actor_user_id");
CREATE INDEX "source_decision_items__coordinate_id__idx" ON public."source_decision_items" USING btree ("coordinate_id");
CREATE INDEX "source_decision_items__decision_set_id__idx" ON public."source_decision_items" USING btree ("decision_set_id");
CREATE INDEX "source_decision_items__recorded_actor_user_id__idx" ON public."source_decision_items" USING btree ("recorded_actor_user_id");
CREATE INDEX "source_decision_items__source_row_version_id__idx" ON public."source_decision_items" USING btree ("source_row_version_id");
CREATE INDEX "source_decision_sets__approval_actor_user_id__idx" ON public."source_decision_sets" USING btree ("approval_actor_user_id");
CREATE INDEX "source_decision_sets__batch_id__idx" ON public."source_decision_sets" USING btree ("batch_id");
CREATE INDEX "source_decision_sets__preview_actor_user_id__idx" ON public."source_decision_sets" USING btree ("preview_actor_user_id");
CREATE INDEX "source_decision_sets__rejection_actor_user_id__idx" ON public."source_decision_sets" USING btree ("rejection_actor_user_id");
CREATE INDEX "source_decision_sets__supersede_actor_user_id__idx" ON public."source_decision_sets" USING btree ("supersede_actor_user_id");
CREATE INDEX "source_row_classification_decisions__coordinate_id__idx" ON public."source_row_classification_decisions" USING btree ("coordinate_id");
CREATE INDEX "source_row_classification_decisions__decision_actor__b3437c7ec6" ON public."source_row_classification_decisions" USING btree ("decision_actor_user_id");
CREATE INDEX "source_row_classification_decisions__decision_item_id__idx" ON public."source_row_classification_decisions" USING btree ("decision_item_id");
CREATE INDEX "source_row_classification_decisions__event_party_id__idx" ON public."source_row_classification_decisions" USING btree ("event_party_id");
CREATE INDEX "source_row_classification_decisions__member_id__idx" ON public."source_row_classification_decisions" USING btree ("member_id");
CREATE INDEX "source_row_classification_decisions__member_match_ca_a6754f23db" ON public."source_row_classification_decisions" USING btree ("member_match_candidate_id");
CREATE INDEX "source_row_classification_decisions__member_match_case_id__idx" ON public."source_row_classification_decisions" USING btree ("member_match_case_id");
CREATE INDEX "source_row_classification_decisions__member_match_de_8a54b2b5d8" ON public."source_row_classification_decisions" USING btree ("member_match_decision_item_id");
CREATE INDEX "source_row_classification_decisions__refund_receipt_id__idx" ON public."source_row_classification_decisions" USING btree ("refund_receipt_id");
CREATE INDEX "source_row_classification_decisions__resolve_actor_user_id__idx" ON public."source_row_classification_decisions" USING btree ("resolve_actor_user_id");
CREATE INDEX "source_row_classification_decisions__reverses_event_id__idx" ON public."source_row_classification_decisions" USING btree ("reverses_event_id");
CREATE INDEX "source_row_classification_decisions__source_row_version_id__idx" ON public."source_row_classification_decisions" USING btree ("source_row_version_id");
CREATE INDEX "source_row_classification_decisions__supersede_actor_f540f957d5" ON public."source_row_classification_decisions" USING btree ("supersede_actor_user_id");
CREATE INDEX "source_row_classification_decisions__supersedes_id__idx" ON public."source_row_classification_decisions" USING btree ("supersedes_id");
