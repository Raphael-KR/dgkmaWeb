-- psql -X -f scripts/member-status-development.sql  (preview)
-- Add -v apply=true only after approval to switch the development DB.
\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply false
\endif
BEGIN ISOLATION LEVEL REPEATABLE READ;
SET LOCAL lock_timeout = '8s';
DO $guard$
BEGIN
  IF current_database() <> 'heliumdb' OR pg_typeof((SELECT id FROM public.users LIMIT 0)) <> 'uuid'::regtype THEN
    RAISE EXCEPTION 'Development UUID database required';
  END IF;
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public'
             AND table_name='users' AND column_name='membership_history') THEN
    RAISE EXCEPTION 'Membership history already installed; do not replay';
  END IF;
END
$guard$;

\if :apply
  LOCK TABLE public.users, public.pending_registrations IN SHARE ROW EXCLUSIVE MODE;
\endif

-- An application can identify a roster row here only through its existing Kakao binding.
CREATE TEMP VIEW membership_baseline AS
WITH reviews AS (
  SELECT kakao_id, count(*) AS holds, min(status) AS review
  FROM public.pending_registrations
  WHERE status IN ('pending','rejected')
  GROUP BY kakao_id
), source AS (
  SELECT u.id, nullif(btrim(u.alumni_status), '') AS prior, u.alumni_group,
         u.is_verified IS TRUE AS verified, u.kakao_id, coalesce(r.holds,0) AS holds, r.review
  FROM public.users u LEFT JOIN reviews r ON r.kakao_id = u.kakao_id
)
SELECT id, prior,
  CASE
    WHEN holds > 1 OR (verified AND (kakao_id IS NULL OR holds > 0)) THEN NULL
    WHEN prior = '사망' THEN CASE WHEN NOT verified THEN '사망' END
    WHEN alumni_group = '본인사망' THEN NULL
    WHEN prior = '동문회 탈퇴자' THEN CASE WHEN NOT verified THEN prior END
    WHEN prior = '정회원' THEN CASE
      WHEN holds = 0 AND verified AND kakao_id IS NOT NULL THEN '가입 완료'
      WHEN holds = 0 AND NOT verified AND kakao_id IS NULL THEN '미가입'
    END
    WHEN prior IS NOT NULL AND prior NOT IN ('정상','미가입','가입 대기','가입 거부','가입 완료') THEN NULL
    WHEN verified THEN CASE WHEN prior IS NULL OR prior IN ('정상','가입 완료') THEN '가입 완료' END
    WHEN review = 'rejected' THEN CASE WHEN prior IS NULL OR prior IN ('정상','가입 거부') THEN '가입 거부' END
    WHEN review = 'pending' THEN CASE WHEN prior IS NULL OR prior IN ('정상','가입 대기') THEN '가입 대기' END
    WHEN prior IS NULL OR prior IN ('정상','미가입') THEN '미가입'
  END AS target
FROM source;

SELECT target AS proposed_status, count(*) AS members
FROM membership_baseline GROUP BY target ORDER BY target NULLS FIRST;
\if :apply
  DO $validate$
  BEGIN
    IF EXISTS (SELECT FROM membership_baseline WHERE target IS NULL) THEN
      RAISE EXCEPTION 'Unresolved roster or review state; resolve before applying';
    END IF;
  END
  $validate$;
  ALTER TABLE public.users ADD COLUMN membership_history jsonb NOT NULL DEFAULT '[]'::jsonb;
  UPDATE public.users u SET alumni_status = b.target FROM membership_baseline b
  WHERE b.id = u.id AND u.alumni_status IS DISTINCT FROM b.target;
  UPDATE public.users SET is_admin = false, kakao_sync_enabled = false WHERE alumni_status = '사망';
  \ir lib/member-status-contract.sql
  COMMIT;
\else
  ROLLBACK;
\endif
