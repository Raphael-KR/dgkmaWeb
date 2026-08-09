INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '73f14b07-62dc-5643-b56e-533d4415f5aa'::uuid,'LEDGER_FINAL_2022_2025','2022–2025 결산장부','google_sheet',
         'spreadsheet:1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k','Asia/Seoul','economic_event',400,'a5d69859fefc54765b220b70d2f1de23100d73ac01aa09c71c2d66cde27645ca','active',DATE '2022-01-01',DATE '2026-01-01',
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '256fcd87-840f-537d-8204-6a5f7ee3947e'::uuid,'LEDGER_DUES_POLICY_2024_2025','2024–2025 회비규정','google_sheet',
         'spreadsheet:1aStEZeCSHIUqS4W81umlW8B3pMCJpx-u5Oe_IHcD49k;ranges:회비수입!O2:O7,회비수입!O9:O14','Asia/Seoul','policy',0,'491c9d93e1b14b777c0420e88a658953e5cc5bade1fd4839887deb434a06dd66','active',DATE '2024-01-01',DATE '2026-01-01',
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT 'fabdbcad-1fee-500a-80dd-68405befcaea'::uuid,'BANK_TOSS_2026','2026 토스 거래','bank_sheet',
         'spreadsheet:1d9C3cMd_0MomQtF5cfAk-9doVKRxsy8OKiO1MqvYqA0;sheet:토스뱅크(1/1~3/16)','Asia/Seoul','bank',300,'cac1e9cf6575ebc3373a22710623dc736b078ffeadb917daa07318662ce896ae','active',DATE '2026-01-01',DATE '2026-03-17',
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT 'cdcfb582-f1e9-5bf3-91d4-eb1b8271e7c6'::uuid,'BANK_IBK_2026','2026 기업 거래','bank_sheet',
         'spreadsheet:1d9C3cMd_0MomQtF5cfAk-9doVKRxsy8OKiO1MqvYqA0;sheet:기업은행(3/16~)','Asia/Seoul','bank',300,'7908e6fd881a34a517a674985a5f9a6965cf2074227a5888d8e19b113b733dbd','active',DATE '2026-03-16',NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '26a45b1a-fc67-5b1e-aca4-6391dc296bf1'::uuid,'GROUP_FOREIGN_FACULTY_2025','외래교수회 단체배분','google_sheet',
         'spreadsheet:1s8x9Oli94iD0Dwx1OYedmKbwSBRPkvcg3tjCML6iHPY','Asia/Seoul','allocation_evidence',0,'c57959c23da638a1663d35899dc8e151e98e72ef4ead82335b8d8b14ae0b06fd','active',DATE '2025-01-01',DATE '2026-03-01',
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '5a47bd83-4d99-59bf-8525-7d0f4667ec75'::uuid,'MEMBERSHIP_INTEGRATED_ADDRESS_BOOK','통합주소록 회원 편집 원본','google_sheet',
         'spreadsheet:1YBu0MtJ3lt2AB1-DB3-u7NP-TSgehKmGK3Ox4PJCzLw;sheet:876761083','Asia/Seoul','member_identity',0,'a219717d79af7b57aa9945896c825bfbf168962985fae44036cc30e7aceeb88a','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT 'c620bd76-e7ee-5746-a523-5d1468039817'::uuid,'AGM36_PERIOD_BOUNDARY','제36차 총회 폐회 경계','notion',
         'payload:docs/source-authority/22nd-officers.json#AGM36_CLOSE','Asia/Seoul','period_boundary',0,'c04bbff4ab2e1a8113cb46c6a171c57866d3e1aa6440d3618cc09def22623d36','active',DATE '2026-01-01',NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '75dd7485-9c2b-51a9-845f-e7baa6ba8dc1'::uuid,'NOTION_ORGANIZATION_ROLE_HISTORY','조직·직책 이력 편집 원본','notion',
         'data-source:dae9352c-122b-4902-bdb8-31328c35940f','Asia/Seoul','role_history',0,'9a5f40bc01ff43f650df7a13b25025771cbcd63c6873f9168f3382bfa1b52a98','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '6dc3cdbe-11b4-538e-b703-ae48ddc6c7db'::uuid,'NOTION_DUES_REGULATION_DRAFT','회비규정 미의결안','notion',
         'page:3aa2225d9c4d8188b661ce08b2cfed2f','Asia/Seoul','policy',0,'c53346369c89dd52574cb9b293d49d7fc0b4a5a77e1b1ec3e2b504ff3bad2199','active',NULL,NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_logical_sources
    (source_uid,source_code,display_name,source_kind,source_locator,source_timezone,authority_role,event_authority_rank,
     contract_fingerprint,status,valid_from,valid_to,recorded_actor_user_id,recorded_actor_uid_snapshot,
     recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
  SELECT '6b3099c2-5015-5852-b5af-ab1787bda029'::uuid,'LEGACY_PAYMENTS','기존 결제 호환 증거','legacy_table',
         'public.payments','batch-captured','compatibility',200,'77911ce9798449805d3d0d7f8811c33e617790c3709ef9a2ab55a082f37f908d','active',DATE '2024-01-01',NULL,
         id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
  FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_source_releases
  (release_uid,logical_source_id,adapter_code,adapter_version,normalized_schema_sha256,normalization_implementation_sha256,
   mapping_table_sha256,mapping_approval_receipt_sha256,released_at,status,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT gen_random_uuid(),source.id,'membership-integrated-address-book-v1','1.0.0','9c0d49b1d77abdfab2bacf60b6f28c348ccc274df44fe1085688a45d19ebe939',
        '81f59888b9cdb84adad3bdc724f02b10d7853f66e694604e612cabbd2a264c0b','d4ab36ea3cfb437cc0fa189496afdc26aceaad4274d4ea332232ce9c2a71538d',
        'f2cac4ee6656a9b666f74a2cf0c072e6e44a2ebb2439c7306405212058ddb516',TIMESTAMPTZ '2026-08-10T00:00:00Z','active',actor.id,
        actor.user_uid,actor.name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='MEMBERSHIP_INTEGRATED_ADDRESS_BOOK' ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_source_releases
  (release_uid,logical_source_id,adapter_code,adapter_version,normalized_schema_sha256,normalization_implementation_sha256,
   mapping_table_sha256,mapping_approval_receipt_sha256,released_at,status,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT gen_random_uuid(),source.id,'notion-organization-role-history-v1','1.0.0','5bc2dadd5275b089ba17d3d1ee27d24b5cfdb184b0ae2a1d490141994a6115e1',
        'cfffc5b2df43d7e5c60ad01e913440037167816958df3fd497c8a4f33fc61b0c','bfeacd9f85136f5c6a882f355d884a5179c3a1343df1759f081f486c74b924e5',
        '00360078e10faea5ef761dd0ec286a3fdadff529d9f563474614e0ea18c25d13',TIMESTAMPTZ '2026-08-10T00:00:00Z','active',actor.id,
        actor.user_uid,actor.name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='NOTION_ORGANIZATION_ROLE_HISTORY' ON CONFLICT DO NOTHING;
INSERT INTO public.bank_accounts
  (account_code,institution_code,masked_identifier,owner_kind,active_from,active_to,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'TOSS_OFFICER_2026','TOSS','미수집','reported_officer',DATE '2026-01-01',DATE '2026-03-17',
        id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.bank_accounts
  (account_code,institution_code,masked_identifier,owner_kind,active_from,active_to,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'IBK_ASSOCIATION_2026','IBK','미수집','association',DATE '2026-03-16',NULL,
        id,user_uid,name,'migration_admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.bank_source_account_mappings
  (logical_source_id,account_id,source_code_snapshot,account_code_snapshot,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT source.id,account.id,source.source_code,account.account_code,actor.id,actor.user_uid,actor.name,'migration_admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source JOIN public.bank_accounts account ON account.account_code='TOSS_OFFICER_2026'
 CROSS JOIN LATERAL (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='BANK_TOSS_2026' ON CONFLICT DO NOTHING;
INSERT INTO public.bank_source_account_mappings
  (logical_source_id,account_id,source_code_snapshot,account_code_snapshot,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT source.id,account.id,source.source_code,account.account_code,actor.id,actor.user_uid,actor.name,'migration_admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source JOIN public.bank_accounts account ON account.account_code='IBK_ASSOCIATION_2026'
 CROSS JOIN LATERAL (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='BANK_IBK_2026' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'president',500,100000,1200000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'senior_vice_president',400,50000,600000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'vice_president_auditor_chair',300,30000,400000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'director',200,10000,200000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'member',100,1000,20000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'president',500,100000,1200000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'senior_vice_president',400,50000,600000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'vice_president_auditor_chair',300,30000,400000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'director',200,10000,200000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'member',100,2000,50000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'president',500,100000,1200000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'senior_vice_president',400,50000,600000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'vice_president_auditor_chair',300,30000,400000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'director',200,10000,200000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'member',100,2000,50000,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_policies
  (dues_year,tier_code,priority,monthly_minimum,annual_minimum,due_day,reminder_day,status,source_logical_id,
   source_row_version_id,resolution_ref,effective_at,version,supersedes_id,recorded_actor_user_id,
   recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,recorded_actor_at,
   recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'honorary',0,0,0,10,11,'draft',source.id,
        NULL,NULL,TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'president','president',policy.id,500,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='president' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'senior_vice_president','senior_vice_president',policy.id,400,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='senior_vice_president' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'vice_president','vice_president_auditor_chair',policy.id,300,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='vice_president_auditor_chair' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'auditor','vice_president_auditor_chair',policy.id,300,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='vice_president_auditor_chair' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'general_affairs_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'planning_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'legal_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'external_cooperation_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'public_relations_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2024,'member','member',policy.id,100,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2024-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2024 AND policy.tier_code='member' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'president','president',policy.id,500,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='president' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'senior_vice_president','senior_vice_president',policy.id,400,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='senior_vice_president' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'vice_president','vice_president_auditor_chair',policy.id,300,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='vice_president_auditor_chair' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'auditor','vice_president_auditor_chair',policy.id,300,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='vice_president_auditor_chair' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'general_affairs_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'planning_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'legal_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'external_cooperation_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'public_relations_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2025,'member','member',policy.id,100,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2025-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2025 AND policy.tier_code='member' AND policy.version=1
 WHERE source.source_code='LEDGER_DUES_POLICY_2024_2025' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'president','president',policy.id,500,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='president' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'senior_vice_president','senior_vice_president',policy.id,400,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='senior_vice_president' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'vice_president','vice_president_auditor_chair',policy.id,300,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='vice_president_auditor_chair' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'auditor','vice_president_auditor_chair',policy.id,300,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='vice_president_auditor_chair' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'general_affairs_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'planning_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'legal_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'external_cooperation_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'public_relations_director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'director','director',policy.id,200,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='director' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'member','member',policy.id,100,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='member' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'general_assembly_chair','vice_president_auditor_chair',policy.id,300,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='vice_president_auditor_chair' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'member_kind:honorary','honorary',policy.id,0,true,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON policy.dues_year=2026 AND policy.tier_code='honorary' AND policy.version=1
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'busan_branch_president',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'busan_branch_vice_president',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'busan_branch_general_affairs',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'busan_branch_finance',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'class_1_captain',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'class_3_captain',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'class_7_captain',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'class_41_captain',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'class_41_vice_captain',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'class_42_captain',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.dues_position_tier_mappings
  (dues_year,position_code,tier_code,policy_id,priority,adds_obligation,status,source_logical_id,source_row_version_id,
   effective_at,version,supersedes_id,recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,
   recorded_actor_scope,recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 2026,'class_42_vice_captain',NULL,policy.id,0,false,'draft',source.id,NULL,
        TIMESTAMPTZ '2026-01-01T00:00:00+09:00',1,NULL,actor.id,actor.user_uid,actor.name,'admin',
        clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.accounting_logical_sources source CROSS JOIN LATERAL
      (SELECT id,user_uid,name FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1) actor
 LEFT JOIN public.dues_policies policy ON false
 WHERE source.source_code='NOTION_DUES_REGULATION_DRAFT' ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'DUES_INCOME',1,'회비수입','income','dues_credit',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'OTHER_INCOME',1,'기타수입','income','none',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'DUES_REFUND',1,'회비환급','expense','dues_refund',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'GENERAL_EXPENSE',1,'기타지출','expense','none',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'INTERNAL_TRANSFER_IN',1,'내부이체입금','transfer','none',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
INSERT INTO public.accounting_categories
  (category_code,version,display_name,report_section,dues_effect,active_from,active_to,status,effective_at,
   recorded_actor_user_id,recorded_actor_uid_snapshot,recorded_actor_name_snapshot,recorded_actor_scope,
   recorded_actor_at,recorded_actor_correlation_uid,recorded_actor_authorization_version)
 SELECT 'INTERNAL_TRANSFER_OUT',1,'내부이체출금','transfer','none',DATE '2022-01-01',NULL,'draft',
        TIMESTAMPTZ '2022-01-01 00:00:00+09',id,user_uid,name,'admin',clock_timestamp(),gen_random_uuid(),'986e515be4055393f13950844bb93dadd1ec1aa2b6484220506ded4f4ce6cef8'
 FROM public.users WHERE is_admin=true ORDER BY id LIMIT 1 ON CONFLICT DO NOTHING;
