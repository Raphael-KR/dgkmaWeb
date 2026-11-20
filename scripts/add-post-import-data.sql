\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN IF current_database() <> 'heliumdb' THEN RAISE EXCEPTION 'Expected development heliumdb'; END IF; END $$;
ALTER TABLE posts ADD COLUMN import_data jsonb;
ALTER TABLE posts ADD CONSTRAINT posts_import_data_check CHECK (import_data IS NULL OR (
  jsonb_typeof(import_data) = 'object'
  AND import_data->'schemaVersion' = '1'::jsonb
  AND import_data->>'platform' IN ('daum-cafe','band')
  AND import_data->>'timePrecision' IN ('day','minute')
  AND (import_data - ARRAY['schemaVersion','platform','containerId','sourceId','boardPath','url','originalCreatedAt','timePrecision','importedAt']) = '{}'::jsonb
  AND jsonb_typeof(import_data->'platform') = 'string'
  AND length(btrim(import_data->>'platform')) BETWEEN 1 AND 500
  AND jsonb_typeof(import_data->'containerId') = 'string'
  AND length(btrim(import_data->>'containerId')) BETWEEN 1 AND 500
  AND jsonb_typeof(import_data->'sourceId') = 'string'
  AND length(btrim(import_data->>'sourceId')) BETWEEN 1 AND 500
  AND jsonb_typeof(import_data->'url') = 'string'
  AND length(btrim(import_data->>'url')) BETWEEN 1 AND 4096
  AND jsonb_typeof(import_data->'originalCreatedAt') = 'string'
  AND length(btrim(import_data->>'originalCreatedAt')) BETWEEN 1 AND 500
  AND jsonb_typeof(import_data->'timePrecision') = 'string'
  AND length(btrim(import_data->>'timePrecision')) BETWEEN 1 AND 500
  AND jsonb_typeof(import_data->'importedAt') = 'string'
  AND length(btrim(import_data->>'importedAt')) BETWEEN 1 AND 500
  AND jsonb_typeof(import_data->'boardPath') = 'array'
  AND jsonb_array_length(import_data->'boardPath') BETWEEN 1 AND 8
  AND NOT jsonb_path_exists(import_data, '$.boardPath[*] ? (@.type() != "string" || @ == "")')
  AND import_data->>'url' ~ '^https?://[^/@[:space:]]+(/[^[:space:]]*)?$'
  AND import_data->>'originalCreatedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
  AND (import_data->>'originalCreatedAt')::timestamptz IS NOT NULL
  AND import_data->>'importedAt' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}([.][0-9]+)?(Z|[+-][0-9]{2}:[0-9]{2})$'
  AND (import_data->>'importedAt')::timestamptz IS NOT NULL
) IS TRUE);
CREATE UNIQUE INDEX posts_import_source_unique ON posts ((import_data->>'platform'),(import_data->>'containerId'),(import_data->>'sourceId')) WHERE import_data IS NOT NULL;
COMMIT;
