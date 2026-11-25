\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF current_database() <> 'neondb' THEN
    RAISE EXCEPTION 'Expected production database neondb, got %', current_database();
  END IF;
END
$guard$;

ALTER TABLE public.comments
  ADD COLUMN author_name text,
  ADD COLUMN parent_comment_id integer,
  ADD COLUMN import_source_id text,
  ADD CONSTRAINT comments_post_id_id_unique UNIQUE (post_id, id),
  ADD CONSTRAINT comments_import_origin_check CHECK (
    (import_source_id IS NULL AND author_name IS NULL AND parent_comment_id IS NULL)
    OR (import_source_id IS NOT NULL AND btrim(import_source_id) <> '' AND author_id IS NULL
      AND author_name IS NOT NULL AND btrim(author_name) <> ''
      AND parent_comment_id IS DISTINCT FROM id)
  );

ALTER TABLE public.comments
  ADD CONSTRAINT comments_same_post_parent_fk FOREIGN KEY (post_id, parent_comment_id)
    REFERENCES public.comments (post_id, id);

CREATE UNIQUE INDEX comments_import_source_unique
  ON public.comments (post_id, import_source_id)
  WHERE import_source_id IS NOT NULL;
ALTER TABLE public.comments DROP CONSTRAINT comments_attachment_check,
  ADD CONSTRAINT comments_attachment_check CHECK (attachment IS NULL OR (CASE jsonb_typeof(attachment)
    WHEN 'object' THEN jsonb_typeof(attachment->'objectPath') = 'string'
      AND jsonb_typeof(attachment->'name') = 'string' AND jsonb_typeof(attachment->'size') = 'number'
      AND jsonb_typeof(attachment->'contentType') = 'string'
    WHEN 'array' THEN author_id IS NULL AND import_source_id ~ '^post:[1-9][0-9]*/comment:[1-9][0-9]*(/reply:[1-9][0-9]*)?$'
      AND jsonb_array_length(attachment) > 0 AND attachment = jsonb_path_query_array(attachment,
        'strict $[*] ? (@.type() == "object" && @.objectPath.type() == "string" && @.objectPath like_regex "^/objects/band-imports/[0-9a-f-]{36}$" && @.name.type() == "string" && @.size.type() == "number" && @.size > 0 && @.contentType.type() == "string" && @.contentType like_regex "^(image/(jpeg|png|gif|webp)|video/mp4)$")', '{}', true)
    ELSE false END) IS TRUE);
ALTER TABLE public.posts ADD COLUMN author_affiliation text;
ALTER TABLE public.comments ADD COLUMN author_affiliation text;

COMMIT;
