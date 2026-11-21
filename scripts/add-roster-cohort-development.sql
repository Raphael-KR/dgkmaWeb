-- Input: header + rows in the documented A:K order, UTF-8 CSV on standard input.
\set ON_ERROR_STOP on
BEGIN;
DO $guard$
BEGIN
  IF current_database() <> 'heliumdb' THEN RAISE EXCEPTION 'development database required'; END IF;
END $guard$;

CREATE TEMP TABLE new_alumni (
  id uuid PRIMARY KEY, department text, generation text NOT NULL CHECK (btrim(generation) <> ''),
  alumni_name text NOT NULL CHECK (btrim(alumni_name) <> ''), admission_date text,
  graduation_date text, alumni_mobile text, alumni_group text, alumni_status text,
  alumni_position text, alumni_memo text
) ON COMMIT DROP;
\copy new_alumni FROM pstdin WITH (FORMAT csv, HEADER MATCH, ENCODING 'UTF8')
LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE;
DO $validate$
BEGIN
  IF EXISTS (SELECT FROM new_alumni WHERE coalesce(nullif(btrim(alumni_status),''),'미가입')
       NOT IN ('미가입','정상','사망') OR (alumni_group = '본인사망' AND btrim(alumni_status) IS DISTINCT FROM '사망'))
    THEN RAISE EXCEPTION 'Unexpected initial cohort status'; END IF;
  IF NOT EXISTS (SELECT FROM new_alumni) OR EXISTS (
    SELECT FROM new_alumni JOIN users USING (id)
  ) THEN RAISE EXCEPTION 'empty batch or previously registered UUID'; END IF;

  IF EXISTS (
    WITH phones AS (
      SELECT true AS incoming, alumni_status, alumni_group, alumni_mobile FROM new_alumni
      UNION ALL
      SELECT false, alumni_status, alumni_group, alumni_mobile FROM public.users
    ), normalized AS (
      SELECT incoming, alumni_status, alumni_group,
        regexp_replace(regexp_replace(coalesce(alumni_mobile,''), '[^0-9]', '', 'g'), '^82(0)?', '0') AS phone
      FROM phones
    )
    SELECT FROM normalized
    WHERE incoming AND btrim(alumni_status) = '사망'
      AND (alumni_group IS DISTINCT FROM '본인사망' OR phone !~ '^0100000[0-9]{4}$')
    UNION ALL
    SELECT FROM normalized WHERE phone ~ '^0100000[0-9]{4}$'
    GROUP BY phone HAVING bool_or(incoming) AND count(*) > 1
  ) THEN RAISE EXCEPTION 'Check the deceased group and assigned roster placeholders'; END IF;
END $validate$;
SELECT count(*) AS new_alumni FROM new_alumni;
\if :{?apply}
\else
\set apply false
\endif
\if :apply
INSERT INTO users (id, name, department, generation, alumni_name, admission_date,
  graduation_date, alumni_mobile, alumni_group, alumni_status, alumni_position, alumni_memo)
SELECT id, alumni_name, department, generation, alumni_name, admission_date,
  graduation_date, alumni_mobile, alumni_group,
  CASE WHEN btrim(alumni_status)='사망' THEN '사망' ELSE '미가입' END, alumni_position, alumni_memo
FROM new_alumni;
COMMIT;
\else
ROLLBACK;
\endif
