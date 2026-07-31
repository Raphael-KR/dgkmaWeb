# Existing-domain exception contract

Todo 6 defines and verifies the pre-DDL contract only. It does not materialize or apply sequence 15 or sequence 20, rewrite source rows, or authorize a Production operation. Todo 16 owns artifact materialization and Todo 17 owns Development application.

## Predicate identity versus persisted exception code

The frozen manifest field `sequence_15_rule_registry.rules[].rule_code` is a legacy-named physical predicate key. Application and generated SQL project it as `predicate_id`; it is never persisted as `schema_data_exceptions.rule_code`. The persisted field and audit projection accept only the corresponding uppercase `exception_code` below.

Every row has `sequence15_status=open`. A `pre_anchor_blocking` observation yields `sequence20_outcome=block_before_ddl`. A `legacy_not_valid` observation yields `sequence20_outcome=add_not_valid_only`: sequence 20 may add the four payment checks as `NOT VALID`, never validate them while violations remain, and never rewrite source rows.

| predicate_id | exception_code | class |
| --- | --- | --- |
| `users.email_canonical_nonblank` | `USERS_EMAIL_CANONICAL_BLANK` | `pre_anchor_blocking` |
| `users.email_canonical_unique` | `USERS_EMAIL_CANONICAL_DUPLICATE` | `pre_anchor_blocking` |
| `users.phone_canonical_source_valid` | `USERS_PHONE_CANONICAL_INVALID` | `pre_anchor_blocking` |
| `users.phone_canonical_unique` | `USERS_PHONE_CANONICAL_DUPLICATE` | `pre_anchor_blocking` |
| `users.birthday_type_domain` | `USERS_BIRTHDAY_TYPE_UNKNOWN` | `pre_anchor_blocking` |
| `categories.badge_variant_domain` | `CATEGORIES_BADGE_VARIANT_UNKNOWN` | `pre_anchor_blocking` |
| `categories.sort_order_nonnegative` | `CATEGORIES_SORT_ORDER_NEGATIVE` | `pre_anchor_blocking` |
| `alumni_database.mobile_canonical_source_valid` | `ALUMNI_MOBILE_CANONICAL_INVALID` | `pre_anchor_blocking` |
| `alumni_database.mobile_canonical_unique` | `ALUMNI_MOBILE_CANONICAL_DUPLICATE` | `pre_anchor_blocking` |
| `alumni_database.matched_user_id_unique` | `ALUMNI_MATCHED_USER_DUPLICATE` | `pre_anchor_blocking` |
| `community_events.legacy_obituary_fk` | `COMMUNITY_EVENT_LEGACY_OBITUARY_ORPHAN` | `pre_anchor_blocking` |
| `community_events.event_type_domain` | `COMMUNITY_EVENT_TYPE_UNKNOWN` | `pre_anchor_blocking` |
| `community_events.status_domain` | `COMMUNITY_EVENT_STATUS_UNKNOWN` | `pre_anchor_blocking` |
| `event_parse_rate_limits.request_count_nonnegative` | `EVENT_PARSE_REQUEST_COUNT_NEGATIVE` | `pre_anchor_blocking` |
| `event_parse_rate_limits.updated_after_window_start` | `EVENT_PARSE_UPDATED_BEFORE_WINDOW` | `pre_anchor_blocking` |
| `pending_registrations.email_canonical_nonblank` | `PENDING_EMAIL_BLANK` | `pre_anchor_blocking` |
| `pending_registrations.pending_kakao_id_unique` | `PENDING_KAKAO_DUPLICATE` | `pre_anchor_blocking` |
| `pending_registrations.pending_email_canonical_unique` | `PENDING_EMAIL_CANONICAL_DUPLICATE` | `pre_anchor_blocking` |
| `pending_registrations.status_null` | `PENDING_STATUS_NULL` | `pre_anchor_blocking` |
| `pending_registrations.status_domain` | `PENDING_STATUS_UNKNOWN` | `pre_anchor_blocking` |
| `kakao_oauth_states.expiry_after_start` | `KAKAO_OAUTH_EXPIRES_NOT_AFTER_START` | `pre_anchor_blocking` |
| `payments.amount_positive` | `PAYMENTS_AMOUNT_NONPOSITIVE` | `legacy_not_valid` |
| `payments.year_domain` | `PAYMENTS_YEAR_OUT_OF_RANGE` | `legacy_not_valid` |
| `payments.type_domain` | `PAYMENTS_TYPE_UNKNOWN` | `legacy_not_valid` |
| `payments.status_domain` | `PAYMENTS_STATUS_UNKNOWN` | `legacy_not_valid` |

The application contract and generated SQL registry must contain all 25 tuples exactly once. An omitted, extra, duplicate, unknown, altered-case, or unmapped predicate or exception code fails `unregistered_schema_exception_rule` before DDL.

## Development inventory

The Todo 6 verifier writes `*-development-inventory.sql`. Run those exact bytes only in the Replit Development workspace. The script opens `BEGIN TRANSACTION READ ONLY`, confirms database identity, computes all 25 raw-value counts and both class totals, and rolls back. Canonical email/phone/mobile values are projected in read-only CTEs because their future generated columns do not exist yet. The query returns counts and closed codes only; it returns no names, email addresses, phone numbers, or source rows.
