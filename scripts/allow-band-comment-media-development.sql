\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $guard$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION 'Expected development database heliumdb';
  END IF;
END
$guard$;
ALTER TABLE public.comments DROP CONSTRAINT comments_attachment_check,
  ADD CONSTRAINT comments_attachment_check CHECK (attachment IS NULL OR (CASE jsonb_typeof(attachment)
    WHEN 'object' THEN jsonb_typeof(attachment->'objectPath') = 'string'
      AND jsonb_typeof(attachment->'name') = 'string' AND jsonb_typeof(attachment->'size') = 'number'
      AND jsonb_typeof(attachment->'contentType') = 'string'
    WHEN 'array' THEN author_id IS NULL AND import_source_id ~ '^post:[1-9][0-9]*/comment:[1-9][0-9]*(/reply:[1-9][0-9]*)?$'
      AND jsonb_array_length(attachment) > 0 AND attachment = jsonb_path_query_array(attachment,
        'strict $[*] ? (@.type() == "object" && @.objectPath.type() == "string" && @.objectPath like_regex "^/objects/band-imports/[0-9a-f-]{36}$" && @.name.type() == "string" && @.size.type() == "number" && @.size > 0 && @.contentType.type() == "string" && @.contentType like_regex "^(image/(jpeg|png|gif|webp)|video/mp4)$")', '{}', true)
    ELSE false END) IS TRUE);
COMMIT;
