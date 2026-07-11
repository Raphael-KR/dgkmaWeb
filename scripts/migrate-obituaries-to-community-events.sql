INSERT INTO community_events (
  legacy_obituary_id, event_type, status, title, event_date, location,
  related_member_name, contact_number, account_info, source_urls, details,
  author_id, published_at, created_at, updated_at
)
SELECT
  id,
  'obituary',
  'published',
  title,
  date_of_death,
  funeral_home,
  NULL,
  contact_number,
  bank_account,
  ARRAY[]::text[],
  jsonb_strip_nulls(jsonb_build_object(
    'deceasedName', deceased_name,
    'legacyDateOfDeath', date_of_death,
    'legacyRelationship', deceased_relation,
    'funeralHome', funeral_home,
    'accountInfo', bank_account,
    'familyContact', contact_number,
    'burialPlace', jangji,
    'chiefMourner', chief_mourner
  )),
  author_id,
  created_at,
  created_at,
  created_at
FROM obituaries
ON CONFLICT (legacy_obituary_id) DO NOTHING;
