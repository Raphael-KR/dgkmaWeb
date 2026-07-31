# Existing relationship and identity preflight contract

Todo 7 defines the preflight and locked-recheck contract for existing relationship and identity gaps. It does not materialize or apply sequence 20, alter Development or Production, or rewrite source rows. The canonical manifest remains `docs/database-manifest.yaml` at SHA-256 `ea8f0d484b99cf93ffb51f11681e5f62e4474f5bbac1735286f1173c0132e785`.

## Exact constraints

- `alumni_database.matched_user_id` remains nullable and keeps its existing FK to `users(id)` with `ON DELETE NO ACTION ON UPDATE NO ACTION`, exactly as recorded by the pinned baseline and the manifest's existing-table alteration fragment. A partial UNIQUE over non-NULL `matched_user_id` makes the relationship one user to at most one alumni row. The manifest-owned btree access path is `alumni_database__matched_user_id__idx`.
- `community_events.legacy_obituary_id` remains nullable and receives an FK to `obituaries(id)` with `ON DELETE SET NULL ON UPDATE RESTRICT`. The pinned baseline's existing `community_events_legacy_obituary_id_unique` supplies the left-prefix FK access path. Deleting a legacy obituary clears only the link and preserves the complete canonical community-event row.
- Pending-registration uniqueness applies only while `status='pending'`: exact `kakao_id` and canonical `lower(btrim(email))` are independently unique. Approved or rejected history does not occupy either partial key. Blank email remains a separate pre-anchor blocker.

All FK actions are explicit. No identity row is automatically selected as a winner, merged, deleted, or rewritten by this task.

The canonical manifest currently has an internal representation discrepancy that Todo 7 does not rewrite: its top-level generated `foreign_keys` projection normalizes the existing alumni FK's update action to `RESTRICT`, while the authoritative existing-table alteration fragment and pinned physical baseline say `NO ACTION`. Todo 7 preserves the existing physical action and treats the alteration fragment as the exact brownfield contract. The new community-event FK is unaffected and remains explicitly `SET NULL/RESTRICT`.

The pinned baseline is commit `0e299abce9509456de0e8bfe224cb7ef392228d8`, path `docs/database-schema.md`, git blob `ff62cdec5c87794c8888d1d0c758cbdef7958d93`, SHA-256 `6d6fc85bc51ebf00213c76a29a299f28bc619074e1d95e1c621b50cb9dac9778`. Its exact relevant facts are frozen in `server/fixtures/database-architecture/task-7/pinned-baseline.json` so the test remains deterministic in Replit's shallow workspace without fetching or replacing Git history.

## Sequence boundary

Sequence 15 later appends one open `schema_data_exceptions` root per deterministic conflict group, using sorted source primary-key arrays, row digests, and the exact uppercase blocker code. Receipts expose codes, counts, and row IDs, not raw Kakao IDs or email values.

Sequence 20 later takes `SHARE ROW EXCLUSIVE` locks on `alumni_database`, `community_events`, `obituaries`, and `pending_registrations`, then repeats the exact same query returned by the shared blocker-query builder. Any open or newly observed blocker stops before DDL. A zero result permits Todo 16 to materialize the approved uniqueness/FK definitions; Todo 17 alone may apply them. Todo 7 records this lock-and-query SQL contract but emits no sequence-20 migration artifact.

## Verification

`developmentRelationshipPreflightSql()` is the only live query owned here. It runs inside `BEGIN TRANSACTION READ ONLY` and ends with `ROLLBACK`; it reports deterministic blocker codes, sorted row IDs, and group sizes. It contains no DDL or DML. The conflict fixture covers alumni duplicates, a legacy-obituary orphan, pending Kakao duplicates, canonical-email duplicates, and a blank pending email. The deletion fixture proves `SET NULL` changes no other community-event field.
