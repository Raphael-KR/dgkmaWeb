CREATE TABLE IF NOT EXISTS public.schema_release_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  release_uid uuid NOT NULL,
  manifest_sha256 char(64) NOT NULL,
  target_fingerprint char(64) NOT NULL,
  requested_through_sequence_no integer NOT NULL,
  state text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  failed_sequence_no integer,
  failure_code text,
  legacy_feature_state text NOT NULL,
  executor_identity text NOT NULL,
  executor_version text NOT NULL,
  CONSTRAINT schema_release_runs__release_uid__key UNIQUE (release_uid),
  CONSTRAINT schema_release_runs__requested_through_sequence__check CHECK (requested_through_sequence_no IN (1,10,15,20,30,40,50,60,65)),
  CONSTRAINT schema_release_runs__state_domain__check CHECK (state IN ('preflight','applying','verified','failed','cutover','read_rollback')),
  CONSTRAINT schema_release_runs__feature_domain__check CHECK (legacy_feature_state IN ('legacy','shadow','new')),
  CONSTRAINT schema_release_runs__state_fields__check CHECK (
    (state IN ('preflight','applying') AND finished_at IS NULL AND failed_sequence_no IS NULL AND failure_code IS NULL)
    OR (state = 'verified' AND finished_at IS NOT NULL AND failed_sequence_no IS NULL AND failure_code IS NULL)
    OR (state = 'failed' AND finished_at IS NOT NULL AND failed_sequence_no IS NOT NULL AND failure_code IS NOT NULL)
    OR (state IN ('cutover','read_rollback') AND finished_at IS NOT NULL AND failed_sequence_no IS NULL AND failure_code IS NULL)
  ),
  CONSTRAINT schema_release_runs__feature_state__check CHECK (
    (state IN ('preflight','applying','verified','failed') AND legacy_feature_state IN ('legacy','shadow'))
    OR (state = 'cutover' AND legacy_feature_state = 'new')
    OR (state = 'read_rollback' AND legacy_feature_state = 'legacy')
  )
);

CREATE TABLE IF NOT EXISTS public.schema_capability_receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_kind text NOT NULL,
  target_fingerprint char(64) NOT NULL,
  parent_target_fingerprint char(64),
  disposable_run_uid uuid,
  preflight_run_uid uuid NOT NULL,
  probe_token char(12) NOT NULL,
  server_version_num integer NOT NULL,
  gen_random_uuid_available boolean NOT NULL,
  btree_gist_installed boolean NOT NULL,
  btree_gist_available boolean NOT NULL,
  btree_gist_create_privilege boolean NOT NULL,
  current_user_name text NOT NULL,
  current_user_oid oid NOT NULL,
  database_create_privilege boolean NOT NULL,
  public_schema_create_privilege boolean NOT NULL,
  table_create_privilege boolean NOT NULL,
  routine_create_privilege boolean NOT NULL,
  table_create_probe_passed boolean NOT NULL,
  routine_create_probe_passed boolean NOT NULL,
  observed_catalog_sha256 char(64) NOT NULL,
  observed_json jsonb NOT NULL,
  observed_at timestamptz NOT NULL,
  receipt_sha256 char(64) NOT NULL,
  CONSTRAINT schema_capability_receipts__target_kind__check CHECK (target_kind IN ('development','disposable-test')),
  CONSTRAINT schema_capability_receipts__probe_token__check CHECK (probe_token ~ '^[0-9a-f]{12}$'),
  CONSTRAINT schema_capability_receipts__server_version_num__check CHECK (server_version_num >= 150000),
  CONSTRAINT schema_capability_receipts__preflight_run_uid__key UNIQUE (preflight_run_uid),
  CONSTRAINT schema_capability_receipts__target_fingerprint_recei_bd9b185e8b UNIQUE (target_fingerprint, receipt_sha256),
  CONSTRAINT schema_capability_receipts__target_run__check CHECK (
    (target_kind = 'development' AND parent_target_fingerprint IS NULL AND disposable_run_uid IS NULL)
    OR (target_kind = 'disposable-test' AND parent_target_fingerprint IS NOT NULL AND disposable_run_uid IS NOT NULL)
  ),
  CONSTRAINT schema_capability_receipts__target_fingerprint_prefl_c3030b1718 UNIQUE (target_fingerprint, preflight_run_uid)
);

CREATE TABLE IF NOT EXISTS public.schema_change_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  artifact_id text NOT NULL,
  artifact_sha256 char(64) NOT NULL,
  artifact_kind text NOT NULL,
  sequence_no integer NOT NULL,
  manifest_sha256 char(64) NOT NULL,
  release_run_id bigint NOT NULL REFERENCES public.schema_release_runs(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  target_database text NOT NULL,
  target_fingerprint char(64) NOT NULL,
  capability_receipt_id bigint NOT NULL REFERENCES public.schema_capability_receipts(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  capability_variant text NOT NULL,
  applied_at timestamptz NOT NULL DEFAULT now(),
  executor_version text NOT NULL,
  CONSTRAINT schema_change_ledger__artifact_id__key UNIQUE (artifact_id),
  CONSTRAINT schema_change_ledger__sequence_no__key UNIQUE (sequence_no),
  CONSTRAINT schema_change_ledger__artifact_kind__check CHECK (artifact_kind IN ('manual','baseline','ordinary'))
);

CREATE INDEX IF NOT EXISTS schema_change_ledger__release_run_id__idx
  ON public.schema_change_ledger (release_run_id);
CREATE INDEX IF NOT EXISTS schema_change_ledger__capability_receipt_id__idx
  ON public.schema_change_ledger (capability_receipt_id);

WITH inserted_capability AS (
  INSERT INTO public.schema_capability_receipts (
    target_kind, target_fingerprint, parent_target_fingerprint, disposable_run_uid,
    preflight_run_uid, probe_token, server_version_num, gen_random_uuid_available,
    btree_gist_installed, btree_gist_available, btree_gist_create_privilege,
    current_user_name, current_user_oid, database_create_privilege,
    public_schema_create_privilege, table_create_privilege, routine_create_privilege,
    table_create_probe_passed, routine_create_probe_passed, observed_catalog_sha256,
    observed_json, observed_at, receipt_sha256
  ) VALUES (
    current_setting('dgkma.target_kind'),
    current_setting('dgkma.target_fingerprint'),
    NULLIF(current_setting('dgkma.parent_target_fingerprint', true), ''),
    NULLIF(current_setting('dgkma.disposable_run_uid', true), '')::uuid,
    current_setting('dgkma.preflight_run_uid')::uuid,
    current_setting('dgkma.probe_token'),
    current_setting('dgkma.server_version_num')::integer,
    current_setting('dgkma.gen_random_uuid_available')::boolean,
    current_setting('dgkma.btree_gist_installed')::boolean,
    current_setting('dgkma.btree_gist_available')::boolean,
    current_setting('dgkma.btree_gist_create_privilege')::boolean,
    current_setting('dgkma.current_user_name'),
    current_setting('dgkma.current_user_oid')::oid,
    current_setting('dgkma.database_create_privilege')::boolean,
    current_setting('dgkma.public_schema_create_privilege')::boolean,
    current_setting('dgkma.table_create_privilege')::boolean,
    current_setting('dgkma.routine_create_privilege')::boolean,
    current_setting('dgkma.table_create_probe_passed')::boolean,
    current_setting('dgkma.routine_create_probe_passed')::boolean,
    current_setting('dgkma.observed_catalog_sha256'),
    current_setting('dgkma.observed_json')::jsonb,
    current_setting('dgkma.observed_at')::timestamptz,
    current_setting('dgkma.capability_receipt_sha256')
  )
  RETURNING id
), inserted_release AS (
  INSERT INTO public.schema_release_runs (
    release_uid, manifest_sha256, target_fingerprint, requested_through_sequence_no,
    state, started_at, legacy_feature_state, executor_identity, executor_version
  ) VALUES (
    current_setting('dgkma.release_uid')::uuid,
    current_setting('dgkma.manifest_sha256'),
    current_setting('dgkma.target_fingerprint'),
    1,
    'applying',
    clock_timestamp(),
    'legacy',
    current_setting('dgkma.executor_identity'),
    current_setting('dgkma.executor_version')
  )
  RETURNING id
), inserted_ledger AS (
  INSERT INTO public.schema_change_ledger (
    artifact_id, artifact_sha256, artifact_kind, sequence_no, manifest_sha256,
    release_run_id, target_database, target_fingerprint, capability_receipt_id,
    capability_variant, executor_version
  )
  SELECT
    'schema-ledger-bootstrap-v1',
    current_setting('dgkma.artifact_sha256'),
    'manual',
    1,
    current_setting('dgkma.manifest_sha256'),
    inserted_release.id,
    current_database(),
    current_setting('dgkma.target_fingerprint'),
    inserted_capability.id,
    'bootstrap',
    current_setting('dgkma.executor_version')
  FROM inserted_release CROSS JOIN inserted_capability
  RETURNING release_run_id
)
SELECT release_run_id
FROM inserted_ledger;

UPDATE public.schema_release_runs
SET state = 'verified', finished_at = clock_timestamp()
WHERE release_uid = current_setting('dgkma.release_uid')::uuid
  AND state = 'applying';
