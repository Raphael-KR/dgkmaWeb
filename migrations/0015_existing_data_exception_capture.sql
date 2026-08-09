ALTER TABLE public.users ADD COLUMN IF NOT EXISTS user_uid uuid DEFAULT gen_random_uuid();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS email_canonical text GENERATED ALWAYS AS (lower(btrim(email))) STORED;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS phone_canonical text GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(phone_number,''), '[^0-9]', '', 'g'), '')) STORED;
ALTER TABLE public.alumni_database ADD COLUMN IF NOT EXISTS mobile_canonical text GENERATED ALWAYS AS (NULLIF(regexp_replace(COALESCE(mobile,''), '[^0-9]', '', 'g'), '')) STORED;
ALTER TABLE public.pending_registrations ADD COLUMN IF NOT EXISTS email_canonical text GENERATED ALWAYS AS (lower(btrim(email))) STORED;
CREATE TABLE public."schema_data_exceptions" (
  "detected_at" timestamptz NOT NULL,
  "effective_at" timestamptz NOT NULL,
  "exception_class" text NOT NULL,
  "exception_uid" uuid NOT NULL,
  "id" bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  "recorded_at" timestamptz DEFAULT clock_timestamp() NOT NULL,
  "resolution_code" text,
  "resolved_actor_at" timestamptz,
  "resolved_actor_authorization_version" char(64),
  "resolved_actor_correlation_uid" uuid,
  "resolved_actor_name_snapshot" text,
  "resolved_actor_scope" text,
  "resolved_actor_uid_snapshot" uuid,
  "resolved_actor_user_id" integer,
  "resolved_at" timestamptz,
  "row_digest" char(64) NOT NULL,
  "row_key" text NOT NULL,
  "rule_code" text NOT NULL,
  "status" text NOT NULL,
  "supersedes_id" bigint,
  "table_name" text NOT NULL,
  "version" integer NOT NULL,
  "waive_actor_at" timestamptz,
  "waive_actor_authorization_version" char(64),
  "waive_actor_correlation_uid" uuid,
  "waive_actor_name_snapshot" text,
  "waive_actor_scope" text,
  "waive_actor_uid_snapshot" uuid,
  "waive_actor_user_id" integer
);
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions_pkey" PRIMARY KEY ("id");
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions__exception_uid_version__key" UNIQUE ("exception_uid", "version");
CREATE UNIQUE INDEX "schema_data_exceptions__supersedes_id__key" ON public."schema_data_exceptions" ("supersedes_id") WHERE supersedes_id IS NOT NULL;
CREATE UNIQUE INDEX "schema_data_exceptions__table_name_row_key_rule_code_8b860524fe" ON public."schema_data_exceptions" ("table_name", "row_key", "rule_code", "row_digest") WHERE version=1;
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions__resolved_actor_authorization_fb229d4032" CHECK (resolved_actor_authorization_version IS NULL OR resolved_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions__resolved_actor_completeness__check" CHECK ((resolved_actor_correlation_uid IS NULL AND resolved_actor_uid_snapshot IS NULL AND resolved_actor_name_snapshot IS NULL AND resolved_actor_scope IS NULL AND resolved_actor_authorization_version IS NULL AND resolved_actor_at IS NULL) OR (resolved_actor_correlation_uid IS NOT NULL AND resolved_actor_uid_snapshot IS NOT NULL AND resolved_actor_name_snapshot IS NOT NULL AND resolved_actor_scope IS NOT NULL AND resolved_actor_authorization_version IS NOT NULL AND resolved_actor_at IS NOT NULL));
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions__resolved_actor_scope__check" CHECK (resolved_actor_scope IS NULL OR resolved_actor_scope IN ('migration_admin'));
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions__version__check" CHECK (version >= 1);
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions__waive_actor_authorization_ve_5fcee71db6" CHECK (waive_actor_authorization_version IS NULL OR waive_actor_authorization_version ~ '^[0-9a-f]{64}$');
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions__waive_actor_completeness__check" CHECK ((waive_actor_correlation_uid IS NULL AND waive_actor_uid_snapshot IS NULL AND waive_actor_name_snapshot IS NULL AND waive_actor_scope IS NULL AND waive_actor_authorization_version IS NULL AND waive_actor_at IS NULL) OR (waive_actor_correlation_uid IS NOT NULL AND waive_actor_uid_snapshot IS NOT NULL AND waive_actor_name_snapshot IS NOT NULL AND waive_actor_scope IS NOT NULL AND waive_actor_authorization_version IS NOT NULL AND waive_actor_at IS NOT NULL));
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions__waive_actor_scope__check" CHECK (waive_actor_scope IS NULL OR waive_actor_scope IN ('migration_admin'));
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions_resolved_actor_user_id_fkey" FOREIGN KEY ("resolved_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES public."schema_data_exceptions" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE public."schema_data_exceptions" ADD CONSTRAINT "schema_data_exceptions_waive_actor_user_id_fkey" FOREIGN KEY ("waive_actor_user_id") REFERENCES public."users" ("id") ON DELETE SET NULL ON UPDATE RESTRICT;
CREATE INDEX "schema_data_exceptions__resolved_actor_user_id__idx" ON public."schema_data_exceptions" USING btree ("resolved_actor_user_id");
CREATE INDEX "schema_data_exceptions__supersedes_id__idx" ON public."schema_data_exceptions" USING btree ("supersedes_id");
CREATE INDEX "schema_data_exceptions__waive_actor_user_id__idx" ON public."schema_data_exceptions" USING btree ("waive_actor_user_id");
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'users', encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'users.email_canonical_nonblank', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."users" AS "users" WHERE email IS NOT NULL AND btrim(email) = '';
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'users', encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'users.email_canonical_unique', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."users" AS "users" WHERE email_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users duplicate WHERE duplicate.email_canonical = users.email_canonical AND duplicate.id <> users.id);
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'users', encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'users.phone_canonical_source_valid', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."users" AS "users" WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '' AND phone_canonical IS NULL;
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'users', encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'users.phone_canonical_unique', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."users" AS "users" WHERE phone_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM users duplicate WHERE duplicate.phone_canonical = users.phone_canonical AND duplicate.id <> users.id);
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'users', encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'users.birthday_type_domain', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("users")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."users" AS "users" WHERE birthday_type IS NOT NULL AND birthday_type NOT IN ('SOLAR','LUNAR');
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'categories', encode(sha256(convert_to(row_to_json("categories")::text, 'UTF8')), 'hex'), 'categories.badge_variant_domain', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("categories")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."categories" AS "categories" WHERE badge_variant NOT IN ('default','secondary','destructive','outline');
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'categories', encode(sha256(convert_to(row_to_json("categories")::text, 'UTF8')), 'hex'), 'categories.sort_order_nonnegative', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("categories")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."categories" AS "categories" WHERE sort_order < 0;
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'alumni_database', encode(sha256(convert_to(row_to_json("alumni_database")::text, 'UTF8')), 'hex'), 'alumni_database.mobile_canonical_source_valid', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("alumni_database")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."alumni_database" AS "alumni_database" WHERE mobile IS NOT NULL AND btrim(mobile) <> '' AND mobile_canonical IS NULL;
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'alumni_database', encode(sha256(convert_to(row_to_json("alumni_database")::text, 'UTF8')), 'hex'), 'alumni_database.mobile_canonical_unique', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("alumni_database")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."alumni_database" AS "alumni_database" WHERE mobile_canonical IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE duplicate.mobile_canonical = alumni_database.mobile_canonical AND duplicate.id <> alumni_database.id);
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'alumni_database', encode(sha256(convert_to(row_to_json("alumni_database")::text, 'UTF8')), 'hex'), 'alumni_database.matched_user_id_unique', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("alumni_database")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."alumni_database" AS "alumni_database" WHERE matched_user_id IS NOT NULL AND EXISTS (SELECT 1 FROM alumni_database duplicate WHERE duplicate.matched_user_id = alumni_database.matched_user_id AND duplicate.id <> alumni_database.id);
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'community_events', encode(sha256(convert_to(row_to_json("community_events")::text, 'UTF8')), 'hex'), 'community_events.legacy_obituary_fk', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("community_events")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."community_events" AS "community_events" WHERE legacy_obituary_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM obituaries WHERE obituaries.id = community_events.legacy_obituary_id);
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'community_events', encode(sha256(convert_to(row_to_json("community_events")::text, 'UTF8')), 'hex'), 'community_events.event_type_domain', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("community_events")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."community_events" AS "community_events" WHERE event_type NOT IN ('obituary','wedding','opening','other');
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'community_events', encode(sha256(convert_to(row_to_json("community_events")::text, 'UTF8')), 'hex'), 'community_events.status_domain', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("community_events")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."community_events" AS "community_events" WHERE status NOT IN ('draft','published');
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'event_parse_rate_limits', encode(sha256(convert_to(row_to_json("event_parse_rate_limits")::text, 'UTF8')), 'hex'), 'event_parse_rate_limits.request_count_nonnegative', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("event_parse_rate_limits")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."event_parse_rate_limits" AS "event_parse_rate_limits" WHERE request_count < 0;
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'event_parse_rate_limits', encode(sha256(convert_to(row_to_json("event_parse_rate_limits")::text, 'UTF8')), 'hex'), 'event_parse_rate_limits.updated_after_window_start', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("event_parse_rate_limits")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."event_parse_rate_limits" AS "event_parse_rate_limits" WHERE updated_at < window_started_at;
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'pending_registrations', encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'pending_registrations.email_canonical_nonblank', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."pending_registrations" AS "pending_registrations" WHERE btrim(email) = '';
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'pending_registrations', encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'pending_registrations.pending_kakao_id_unique', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."pending_registrations" AS "pending_registrations" WHERE status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.kakao_id = pending_registrations.kakao_id AND duplicate.id <> pending_registrations.id);
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'pending_registrations', encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'pending_registrations.pending_email_canonical_unique', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."pending_registrations" AS "pending_registrations" WHERE status = 'pending' AND EXISTS (SELECT 1 FROM pending_registrations duplicate WHERE duplicate.status = 'pending' AND duplicate.email_canonical = pending_registrations.email_canonical AND duplicate.id <> pending_registrations.id);
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'pending_registrations', encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'pending_registrations.status_null', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."pending_registrations" AS "pending_registrations" WHERE status IS NULL;
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'pending_registrations', encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'pending_registrations.status_domain', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("pending_registrations")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."pending_registrations" AS "pending_registrations" WHERE status IS NOT NULL AND status NOT IN ('pending','approved','rejected');
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'kakao_oauth_states', encode(sha256(convert_to(row_to_json("kakao_oauth_states")::text, 'UTF8')), 'hex'), 'kakao_oauth_states.expiry_after_start', 'pre_anchor_blocking',
       encode(sha256(convert_to(row_to_json("kakao_oauth_states")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."kakao_oauth_states" AS "kakao_oauth_states" WHERE expires_at <= started_at;
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'payments', encode(sha256(convert_to(row_to_json("payments")::text, 'UTF8')), 'hex'), 'payments.amount_positive', 'legacy_not_valid',
       encode(sha256(convert_to(row_to_json("payments")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."payments" AS "payments" WHERE amount <= 0;
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'payments', encode(sha256(convert_to(row_to_json("payments")::text, 'UTF8')), 'hex'), 'payments.year_domain', 'legacy_not_valid',
       encode(sha256(convert_to(row_to_json("payments")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."payments" AS "payments" WHERE year NOT BETWEEN 2024 AND 2100;
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'payments', encode(sha256(convert_to(row_to_json("payments")::text, 'UTF8')), 'hex'), 'payments.type_domain', 'legacy_not_valid',
       encode(sha256(convert_to(row_to_json("payments")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."payments" AS "payments" WHERE type NOT IN ('연회비','기타');
INSERT INTO public.schema_data_exceptions
  (exception_uid, version, table_name, row_key, rule_code, exception_class, row_digest, status, detected_at, effective_at)
SELECT gen_random_uuid(), 1, 'payments', encode(sha256(convert_to(row_to_json("payments")::text, 'UTF8')), 'hex'), 'payments.status_domain', 'legacy_not_valid',
       encode(sha256(convert_to(row_to_json("payments")::text, 'UTF8')), 'hex'), 'open', clock_timestamp(), clock_timestamp()
FROM public."payments" AS "payments" WHERE status NOT IN ('pending','completed','failed');
