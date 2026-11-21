CREATE TABLE public.dues_receipts (
    id uuid PRIMARY KEY,
    received_on date NOT NULL CHECK (isfinite(received_on)),
    amount integer NOT NULL CHECK (amount > 0),
    bank_amount integer NOT NULL CHECK (bank_amount >= amount),
    unallocated_year integer CHECK (unallocated_year BETWEEN 1000 AND 9999),
    source_rows jsonb NOT NULL CHECK (
        jsonb_typeof(source_rows) = 'array' AND jsonb_array_length(source_rows) > 0
    )
);

ALTER TABLE public.payments
    ADD COLUMN dues_receipt_id uuid REFERENCES public.dues_receipts (id),
    ADD COLUMN dues_allocation_key uuid,
    ADD CONSTRAINT payments_dues_allocation_unique UNIQUE (dues_receipt_id, dues_allocation_key),
    ADD CONSTRAINT payments_dues_allocation_check CHECK (
        (dues_receipt_id IS NULL AND dues_allocation_key IS NULL AND status <> 'ledger_staged')
        OR (dues_receipt_id IS NOT NULL AND dues_allocation_key IS NOT NULL
            AND status = 'ledger_staged' AND type = '연회비'
            AND amount > 0 AND year BETWEEN 1000 AND 9999)
    );

-- Keep the accounting totals and remove the name-bearing fields for the specific
-- allocation whose member connection was cleared. A group can contain other members.
CREATE FUNCTION public.redact_dues_source_labels(entries jsonb, cleared_keys uuid[])
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $function$
    SELECT jsonb_agg(
        CASE WHEN (s.entry->>'allocationKey')::uuid = ANY (cleared_keys)
             THEN s.entry || '{"label":"연결 해제","memberLabel":"연결 해제"}'::jsonb
             ELSE s.entry END ORDER BY s.ord
    )
    FROM jsonb_array_elements(entries) WITH ORDINALITY AS s(entry, ord)
$function$;

CREATE FUNCTION public.clear_dues_allocation_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
    UPDATE public.dues_receipts
       SET source_rows = public.redact_dues_source_labels(source_rows, ARRAY[OLD.dues_allocation_key])
     WHERE id = OLD.dues_receipt_id;
    RETURN NULL;
END
$function$;

CREATE TRIGGER payments_clear_dues_source_labels
AFTER UPDATE OF user_id ON public.payments
FOR EACH ROW WHEN (OLD.dues_receipt_id IS NOT NULL AND OLD.user_id IS NOT NULL AND NEW.user_id IS NULL)
EXECUTE FUNCTION public.clear_dues_allocation_identity();
