# Todo 9 brownfield identity anchor contract

Todo 9 is a definition and read-only preview boundary. It does not materialize or apply sequence 20, execute DDL/backfill, create `development-admin-approved.json`, or create association/history tables.

## Exact anchors and normalization

- `users.user_uid` is `uuid NOT NULL DEFAULT gen_random_uuid()` with a unique constraint.
- User and pending-registration canonical email is generated from `lower(btrim(email))`. PostgreSQL's default `btrim(text)` removes only leading/trailing U+0020 space, so the shared TypeScript normalizer does the same and deliberately preserves tabs, newlines, and NBSP. A non-null source consisting only of U+0020 spaces is terminal `pre_anchor_blocking`.
- User phone and alumni mobile share the manifest's built-in-only `CANONICAL_PHONE` generated expression. Blank/NULL becomes NULL; every invalid nonblank value blocks before DDL, so NULL cannot bypass validation.
- `pending_registrations.status` targets `text NOT NULL DEFAULT 'pending'` with the exact `pending|approved|rejected` domain. Existing NULL or unknown status is not normalized and blocks terminally.
- Current pending Kakao and canonical-email duplicates, all canonical user identity duplicates, alumni mobile duplicates, and duplicate non-null alumni matches select no winner and block terminally. No source value is rewritten, merged, or deleted.

The TypeScript normalizers and SQL projection are generated from the same canonical contracts. Differential email fixtures cover ordinary U+0020 spaces, tabs, newlines, NBSP, mixed space/tab edges, blank spaces, and NULL on both `users.email` and `pending_registrations.email`; phone fixtures cover `+82 10`, punctuation, blank, NULL, invalid nonblank, and canonical duplicates.

## Exact-link preview

The Todo 12 input preview reads only an existing non-null `alumni_database.matched_user_id` whose referenced `users.id` exists. Output is sorted by alumni row ID and contains only numeric row IDs, the literal source `alumni_database.matched_user_id`, and `fk_backed=true`. Reruns over the same input are byte-stable.

Any identity blocker empties the complete preview; partial backfill is forbidden. Names, email, phone, mobile, or any inferred winner never create a link. A same-name-only fixture therefore produces zero links.

## Execution boundary

The Development preflight begins `BEGIN TRANSACTION READ ONLY`, is rejected by a generated-query write-keyword guard if it contains DDL/DML, emits blocker codes/row IDs/counts plus exact numeric link IDs, and ends with `ROLLBACK`. Sequence 15/20 materialization remains Todo 16; application and the actor receipt remain Todo 17.

The existing alumni FK physical/pinned contract remains `ON DELETE NO ACTION ON UPDATE NO ACTION`. The post-main authority reconciliation makes the manifest registry projection identical, so Todo 16 must preserve those exact actions during materialization.
