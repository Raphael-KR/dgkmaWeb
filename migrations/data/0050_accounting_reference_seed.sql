INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '73f14b07-62dc-5643-b56e-533d4415f5aa'::uuid,'LEDGER_FINAL_2022_2025','LEDGER_FINAL_2022_2025','managed_document',
         'registry:LEDGER_FINAL_2022_2025','Asia/Seoul','supporting_evidence',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '256fcd87-840f-537d-8204-6a5f7ee3947e'::uuid,'LEDGER_DUES_POLICY_2024_2025','LEDGER_DUES_POLICY_2024_2025','managed_document',
         'registry:LEDGER_DUES_POLICY_2024_2025','Asia/Seoul','supporting_evidence',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT 'fabdbcad-1fee-500a-80dd-68405befcaea'::uuid,'BANK_TOSS_2026','BANK_TOSS_2026','bank_export',
         'registry:BANK_TOSS_2026','Asia/Seoul','supporting_evidence',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT 'cdcfb582-f1e9-5bf3-91d4-eb1b8271e7c6'::uuid,'BANK_IBK_2026','BANK_IBK_2026','bank_export',
         'registry:BANK_IBK_2026','Asia/Seoul','supporting_evidence',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '26a45b1a-fc67-5b1e-aca4-6391dc296bf1'::uuid,'GROUP_FOREIGN_FACULTY_2025','GROUP_FOREIGN_FACULTY_2025','managed_document',
         'registry:GROUP_FOREIGN_FACULTY_2025','Asia/Seoul','supporting_evidence',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '5a47bd83-4d99-59bf-8525-7d0f4667ec75'::uuid,'MEMBERSHIP_INTEGRATED_ADDRESS_BOOK','MEMBERSHIP_INTEGRATED_ADDRESS_BOOK','managed_document',
         'registry:MEMBERSHIP_INTEGRATED_ADDRESS_BOOK','Asia/Seoul','member_identity',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT 'c620bd76-e7ee-5746-a523-5d1468039817'::uuid,'AGM36_PERIOD_BOUNDARY','AGM36_PERIOD_BOUNDARY','managed_document',
         'registry:AGM36_PERIOD_BOUNDARY','Asia/Seoul','supporting_evidence',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '75dd7485-9c2b-51a9-845f-e7baa6ba8dc1'::uuid,'NOTION_ORGANIZATION_ROLE_HISTORY','NOTION_ORGANIZATION_ROLE_HISTORY','notion',
         'registry:NOTION_ORGANIZATION_ROLE_HISTORY','Asia/Seoul','organization_role',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '6dc3cdbe-11b4-538e-b703-ae48ddc6c7db'::uuid,'NOTION_DUES_REGULATION_DRAFT','NOTION_DUES_REGULATION_DRAFT','notion',
         'registry:NOTION_DUES_REGULATION_DRAFT','Asia/Seoul','supporting_evidence',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '6b3099c2-5015-5852-b5af-ab1787bda029'::uuid,'LEGACY_PAYMENTS','LEGACY_PAYMENTS','legacy_database',
         'registry:LEGACY_PAYMENTS','Asia/Seoul','supporting_evidence',10,'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'DUES_INCOME',1,'회비수입','income','dues_credit',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'OTHER_INCOME',1,'기타수입','income','none',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'DUES_REFUND',1,'회비환급','expense','dues_refund',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'GENERAL_EXPENSE',1,'기타지출','expense','none',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'INTERNAL_TRANSFER_IN',1,'내부이체입금','transfer','none',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'INTERNAL_TRANSFER_OUT',1,'내부이체출금','transfer','none',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'24f92edb2297487903310ee4acbec72a63401037eb5ff5f7b4de8e6a9539000a'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
