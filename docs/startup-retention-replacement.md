# Todo 10 startup and retention replacement definitions

Todo 10 prepares pure, fail-closed definitions. It does not wire startup, change `server/index.ts`, remove its existing session-table/index DDL, materialize schema artifacts, execute retention, or access a database.

## Startup ledger readiness

Startup requires exact verified ledger rows for sequences `1,10,15,20,30,40,50,60`. Sequence 40 contains exactly one capability-selected temporal artifact. The latest required row is sequence 60 `database-security-v1`; artifact ID, materialized SHA, kind, manifest SHA, target fingerprint, capability variant, release state `verified`, and executor version `schema-ledger-v1` must match exactly. Missing, old, duplicate, unknown, drifted, unmaterialized, mixed-target, or mixed-variant input returns not-ready with zero emitted DDL and zero schema writes.

The replacement inventory query is SELECT-only inside `BEGIN TRANSACTION READ ONLY` and `ROLLBACK`. Todo 16 materializes artifacts and wires this verifier; Todo 17 performs migrated startup QA.

## Retention planning

One hourly job uses a deterministic advisory-lock namespace, at most 500 rows per batch, a five-second batch limit, and at most 10 batches:

- `session`: cursor `(expire,sid)`, delete only `expire<now()`.
- `kakao_oauth_states`: cursor `(expires_at,state_hash)`, delete only `expires_at<now()-24 hours`.
- `kakao_identity_terminations`: cursor `(terminated_at,identity_hash)`, delete only `terminated_at<now()-30 days`.
- rejected `pending_registrations`: cursor `(created_at,id)`, redact only `created_at<now()-30 days AND pii_redacted_at IS NULL`; absence of `ACCOUNTING_PII_HMAC_KEY_V1` blocks before any effect.

The pure planner returns selected stable keys without SQL or writes. It never targets actor, audit, source, or financial rows. Runtime application of deletion/redaction, HMAC payload construction, actor receipts, and audit rows remain later-todo work.

Retention metrics have the closed field set `table`, `cutoff`, `count`, `duration`, `outcome`. No identity, payload, secret, account, or raw source field is allowed.
