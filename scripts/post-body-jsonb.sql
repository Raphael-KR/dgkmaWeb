-- Run only from the explicit development migration, after converting the locked TEXT rows.
DO $$ BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION 'Development database required';
  END IF;
END $$;

ALTER TABLE public.posts ALTER COLUMN content TYPE jsonb USING content::jsonb;
ALTER TABLE public.posts ADD CONSTRAINT posts_content_document_check
  CHECK ((jsonb_typeof(content) = 'object' AND content->>'type' = 'doc'
    AND jsonb_typeof(content->'content') = 'array') IS TRUE);
