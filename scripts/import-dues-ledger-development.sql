-- Run only after review, from the Replit development workspace.
-- psql -X -v bundle_sha256=<reviewed SHA-256> -f scripts/import-dues-ledger-development.sql < reviewed.json
-- stdin is the CLI's single compact JSON line. Hash the UTF-8 line WITHOUT its final newline.
\set ON_ERROR_STOP on
\set VERBOSITY terse
\set workspace ''
\set deployment ''
\set development_host ''
\set development_db ''
\set development_user ''
\getenv workspace REPL_ID
\getenv deployment REPLIT_DEPLOYMENT
\getenv development_host PGHOST
\getenv development_db PGDATABASE
\getenv development_user PGUSER

BEGIN;
SET LOCAL lock_timeout = '8s';
SET LOCAL DateStyle = 'ISO, YMD';
SET LOCAL search_path = pg_temp, pg_catalog;
SELECT current_database() = 'heliumdb'
   AND current_database() = :'development_db' AND current_user = :'development_user'
   AND :'workspace' = 'dc5e5541-525b-4ad6-b914-2d2db70cb4a9'
   AND :'deployment' <> '1' AND :'development_host' <> '' AND :'HOST' = :'development_host'
   AND pg_typeof((SELECT id FROM public.users LIMIT 0)) = 'uuid'::regtype AS development_target
\gset
\if :development_target
\else
DO $$ BEGIN RAISE EXCEPTION 'Replit development database required'; END $$;
\endif

CREATE TEMP TABLE ledger_file (document text NOT NULL) ON COMMIT DROP;
-- JSON cannot contain these unescaped control characters. The CSV reader therefore
-- preserves JSON quotes and backslashes and never interprets input as a psql command.
\copy pg_temp.ledger_file (document) FROM pstdin WITH (FORMAT csv, DELIMITER E'\x1f', QUOTE E'\x1e')
SELECT count(*) = 1
   AND bool_and(encode(sha256(convert_to(document, 'UTF8')), 'hex') = :'bundle_sha256'
                AND document IS JSON ARRAY WITH UNIQUE KEYS) AS reviewed_file
FROM pg_temp.ledger_file
\gset
\if :reviewed_file
\else
DO $$ BEGIN RAISE EXCEPTION 'Expected the reviewed single-line JSON bundle and its SHA-256'; END $$;
\endif

-- Validate amounts, source rows and identities before locking live tables.
CREATE TEMP TABLE ledger_receipt (
    id uuid PRIMARY KEY,
    received_on date NOT NULL CHECK (isfinite(received_on)),
    amount integer NOT NULL CHECK (amount > 0),
    bank_amount integer NOT NULL CHECK (bank_amount >= amount),
    unallocated_year integer CHECK (unallocated_year BETWEEN 1000 AND 9999),
    source_rows jsonb NOT NULL CHECK (jsonb_typeof(source_rows) = 'array' AND jsonb_array_length(source_rows) > 0),
    allocations jsonb NOT NULL CHECK (jsonb_typeof(allocations) = 'array')
) ON COMMIT DROP;
INSERT INTO ledger_receipt
SELECT r."receiptKey", r."receivedOn", r.amount, r."bankAmount", r."unallocatedYear", r."sourceRows", r.allocations
FROM pg_temp.ledger_file f
CROSS JOIN LATERAL jsonb_to_recordset(f.document::jsonb) AS r(
    "receiptKey" uuid, "receivedOn" date, amount integer, "bankAmount" integer, "unallocatedYear" integer,
    "sourceRows" jsonb, allocations jsonb
);

CREATE TEMP TABLE ledger_allocation (
    receipt_id uuid NOT NULL,
    allocation_key uuid NOT NULL,
    user_id uuid NOT NULL,
    year integer NOT NULL CHECK (year BETWEEN 1000 AND 9999),
    amount integer NOT NULL CHECK (amount > 0),
    PRIMARY KEY (receipt_id, allocation_key)
) ON COMMIT DROP;
INSERT INTO ledger_allocation
SELECT r.id, a."allocationKey", a."userId", a.year, a.amount
FROM pg_temp.ledger_receipt r
CROSS JOIN LATERAL jsonb_to_recordset(r.allocations) AS a(
    "allocationKey" uuid, "userId" uuid, year integer, amount integer
);

CREATE TEMP TABLE ledger_source ON COMMIT DROP AS
SELECT r.id AS receipt_id, s.row, (s.row->>'allocationKey')::uuid AS allocation_key,
       (s.row->>'amount')::integer AS amount, (s.row->>'year')::integer AS year
FROM pg_temp.ledger_receipt r CROSS JOIN LATERAL jsonb_array_elements(r.source_rows) AS s(row);
CREATE UNIQUE INDEX ON ledger_source (receipt_id, allocation_key) NULLS NOT DISTINCT;

DO $validate$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_temp.ledger_receipt) THEN
        RAISE EXCEPTION 'Full ledger bundle is empty';
    END IF;
    IF EXISTS (
        SELECT FROM pg_temp.ledger_file f, jsonb_array_elements(f.document::jsonb) AS r(item)
        WHERE r.item - ARRAY['receiptKey','receivedOn','amount','bankAmount','unallocatedYear','allocations','sourceRows'] <> '{}'::jsonb
           OR jsonb_typeof(r.item->'receiptKey') IS DISTINCT FROM 'string'
           OR jsonb_typeof(r.item->'receivedOn') IS DISTINCT FROM 'string'
           OR jsonb_typeof(r.item->'amount') IS DISTINCT FROM 'number'
           OR jsonb_typeof(r.item->'bankAmount') IS DISTINCT FROM 'number'
           OR (r.item->>'amount') !~ '^[1-9][0-9]*$'
           OR (r.item->>'bankAmount') !~ '^[1-9][0-9]*$'
           OR NOT (r.item ? 'unallocatedYear')
           OR jsonb_typeof(r.item->'unallocatedYear') NOT IN ('null','number')
           OR (r.item->>'unallocatedYear') !~ '^[1-9][0-9]{3}$'
           OR (r.item->>'receivedOn') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
    ) OR EXISTS (
        SELECT FROM pg_temp.ledger_receipt r, jsonb_array_elements(r.allocations) a(item)
        WHERE a.item - ARRAY['allocationKey','userId','amount','year'] <> '{}'::jsonb
           OR jsonb_typeof(a.item->'allocationKey') IS DISTINCT FROM 'string'
           OR jsonb_typeof(a.item->'userId') IS DISTINCT FROM 'string'
           OR jsonb_typeof(a.item->'amount') IS DISTINCT FROM 'number'
           OR jsonb_typeof(a.item->'year') IS DISTINCT FROM 'number'
           OR (a.item->>'amount') !~ '^[1-9][0-9]*$'
           OR (a.item->>'year') !~ '^[1-9][0-9]{3}$'
    ) THEN
        RAISE EXCEPTION 'Invalid receipt or allocation fields';
    END IF;
    IF EXISTS (
        SELECT FROM pg_temp.ledger_source s JOIN pg_temp.ledger_receipt r ON r.id = s.receipt_id
        WHERE NOT (s.row ?& ARRAY['occurredAt','direction','amount','balance','label',
                                   'category','memo','account','memberLabel','year','allocationKey'])
           OR s.row - ARRAY['occurredAt','direction','amount','balance','label',
                            'category','memo','account','memberLabel','year','allocationKey'] <> '{}'::jsonb
           OR EXISTS (SELECT FROM unnest(ARRAY['occurredAt','direction','label','category',
                                               'memo','account','memberLabel']) k
                      WHERE jsonb_typeof(s.row->k) <> 'string')
           OR jsonb_typeof(s.row->'balance') NOT IN ('null','number')
           OR (s.row->>'balance') !~ '^-?[0-9]+$'
           OR jsonb_typeof(s.row->'amount') <> 'number' OR jsonb_typeof(s.row->'year') <> 'number'
           OR s.amount <= 0 OR s.year NOT BETWEEN 1000 AND 9999
           OR s.row->>'direction' NOT IN ('수입', '분개') OR s.row->>'category' <> '회비수입'
           OR s.row->>'memo' <> (s.year::text || '년도 회비')
           OR btrim(s.row->>'label') = ''
           OR (r.unallocated_year IS NULL AND
               (jsonb_typeof(s.row->'allocationKey') IS DISTINCT FROM 'string'
                OR s.row->>'label' IN ('성명불상', '(성명불상)', '(성명불상) 정회원')))
           OR (r.unallocated_year IS NOT NULL AND jsonb_typeof(s.row->'allocationKey') IS DISTINCT FROM 'null')
           OR EXISTS (SELECT FROM unnest(ARRAY['label','memberLabel','account']) k
                      CROSS JOIN LATERAL (VALUES (convert_to(s.row->>k, 'UTF8'))) AS utf8(bytes)
                      WHERE length(utf8.bytes, 'UTF8') > 150
                         OR btrim(s.row->>k) <> s.row->>k
                         -- Match whole UTF-8 bytes for U+0000–001F and U+007F–009F.
                         -- SQL_ASCII classifies some bytes within Korean names as controls.
                         OR encode(utf8.bytes, 'hex') ~ '^(..)*([01].|7f|c2[89].)'
                         OR (s.row->>k) ~* '[@<>]|https?://|[0-9]([ -]?[0-9]){7}|^#(N/A|REF!|VALUE!|DIV/0!|NAME\?|NUM!|NULL!|ERROR!)')
           OR (s.row->>'occurredAt') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9][+]09:00)?$'
           OR left(s.row->>'occurredAt', 10) <> r.received_on::text
    ) THEN
        RAISE EXCEPTION 'Invalid accounting source row';
    END IF;
    IF EXISTS (
        SELECT FROM pg_temp.ledger_receipt r
        LEFT JOIN LATERAL (SELECT sum(a.amount) AS total FROM pg_temp.ledger_allocation a
                           WHERE a.receipt_id = r.id) sums ON true
        WHERE (r.unallocated_year IS NULL AND sums.total IS DISTINCT FROM r.amount::bigint)
           OR (r.unallocated_year IS NOT NULL AND
               (sums.total IS NOT NULL OR jsonb_array_length(r.source_rows) <> 1))
    ) OR EXISTS (
        SELECT FROM pg_temp.ledger_source s JOIN pg_temp.ledger_receipt r ON r.id = s.receipt_id
        LEFT JOIN pg_temp.ledger_allocation a
          ON (a.receipt_id, a.allocation_key) = (s.receipt_id, s.allocation_key)
        WHERE CASE WHEN r.unallocated_year IS NULL THEN
            (a.year, a.amount) IS DISTINCT FROM (s.year, s.amount)
        ELSE s.allocation_key IS NOT NULL
            OR (r.unallocated_year, r.amount) IS DISTINCT FROM (s.year, s.amount) END
    ) OR EXISTS (
        SELECT receipt_id, allocation_key FROM pg_temp.ledger_allocation
        EXCEPT SELECT receipt_id, allocation_key FROM pg_temp.ledger_source
    ) THEN
        RAISE EXCEPTION 'Receipt, source rows and allocations do not reconcile';
    END IF;
END
$validate$;

-- Lock members first, matching the withdrawal transaction's order. Table locks serialize
-- imports and existing payment writers before comparing the reviewed full snapshot.
DO $lock_members$
BEGIN
    PERFORM u.id FROM public.users u
    WHERE u.id IN (SELECT user_id FROM pg_temp.ledger_allocation)
    ORDER BY u.id FOR UPDATE OF u;
END
$lock_members$;
LOCK TABLE public.dues_receipts, public.payments IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP TABLE new_receipts ON COMMIT DROP AS
SELECT r.id FROM pg_temp.ledger_receipt r
WHERE NOT EXISTS (SELECT FROM public.dues_receipts d WHERE d.id = r.id);

-- Compare against the same redacted representation used at withdrawal. No old
-- name or member connection is written back when the source is supplied again.
UPDATE pg_temp.ledger_receipt r
SET source_rows = public.redact_dues_source_labels(r.source_rows, cleared.keys)
FROM (SELECT dues_receipt_id, array_agg(dues_allocation_key) AS keys
      FROM public.payments WHERE dues_receipt_id IS NOT NULL AND user_id IS NULL
      GROUP BY dues_receipt_id) cleared
WHERE r.id = cleared.dues_receipt_id;

DO $existing$
BEGIN
    IF EXISTS (
        SELECT FROM public.dues_receipts d LEFT JOIN pg_temp.ledger_receipt r ON r.id = d.id
        WHERE r.id IS NULL OR (d.received_on, d.amount, d.bank_amount, d.unallocated_year, d.source_rows)
            IS DISTINCT FROM (r.received_on, r.amount, r.bank_amount, r.unallocated_year, r.source_rows)
    ) THEN
        RAISE EXCEPTION 'An existing receipt changed or disappeared; review before importing';
    END IF;
    IF EXISTS (
        SELECT FROM pg_temp.ledger_allocation a JOIN pg_temp.new_receipts n ON n.id = a.receipt_id
        LEFT JOIN public.users u ON u.id = a.user_id
        WHERE u.id IS NULL OR u.alumni_status IN ('동문회 탈퇴자', '사망')
    ) THEN
        RAISE EXCEPTION 'A new allocation has no eligible roster identity';
    END IF;
    IF EXISTS (
        SELECT FROM public.payments p JOIN pg_temp.ledger_allocation a
          ON (p.user_id, p.year) = (a.user_id, a.year)
        JOIN pg_temp.new_receipts n ON n.id = a.receipt_id
        WHERE p.dues_receipt_id IS NULL AND p.type = '연회비' AND p.status = 'completed'
    ) THEN
        RAISE EXCEPTION 'Existing completed annual payment needs reconciliation';
    END IF;
END
$existing$;

INSERT INTO public.dues_receipts (id, received_on, amount, bank_amount, unallocated_year, source_rows)
SELECT r.id, r.received_on, r.amount, r.bank_amount, r.unallocated_year, r.source_rows
FROM pg_temp.ledger_receipt r JOIN pg_temp.new_receipts n ON n.id = r.id;
INSERT INTO public.payments (dues_receipt_id, dues_allocation_key, user_id, year, amount, type, status)
SELECT a.receipt_id, a.allocation_key, a.user_id, a.year, a.amount, '연회비', 'ledger_staged'
FROM pg_temp.ledger_allocation a JOIN pg_temp.new_receipts n ON n.id = a.receipt_id;

-- A cleared user link must remain cleared even if the original snapshot is replayed.
-- All keys, amounts and years must still match in both directions.
DO $stored$
BEGIN
    IF EXISTS (
        SELECT FROM pg_temp.ledger_allocation a FULL JOIN
          (SELECT * FROM public.payments WHERE dues_receipt_id IS NOT NULL) p
          ON (p.dues_receipt_id, p.dues_allocation_key) = (a.receipt_id, a.allocation_key)
        WHERE a.receipt_id IS NULL OR p.id IS NULL
           OR (p.amount, p.year) IS DISTINCT FROM (a.amount, a.year)
           OR (p.user_id IS NOT NULL AND p.user_id <> a.user_id)
    ) THEN
        RAISE EXCEPTION 'Stored allocations differ from the reviewed full snapshot';
    END IF;
END
$stored$;
SELECT (SELECT count(*) FROM pg_temp.new_receipts) AS added_receipts,
       (SELECT count(*) FROM public.dues_receipts) AS total_receipts,
       (SELECT count(*) FROM public.payments WHERE dues_receipt_id IS NOT NULL) AS total_allocations;
COMMIT;
