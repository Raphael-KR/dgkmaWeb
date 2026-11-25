\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF current_database() <> 'heliumdb' THEN
    RAISE EXCEPTION 'Expected development database heliumdb, got %', current_database();
  END IF;
END
$guard$;

-- 기존 컬럼·제약이 있으면 중단하고 catalog를 대조한다. 기존 행은 갱신하지 않는다.
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
COMMIT;
