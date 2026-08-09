CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public."accounting_categories" ADD CONSTRAINT "accounting_categories__range_valid__check" CHECK (active_to IS NULL OR active_from < active_to);
ALTER TABLE public."accounting_import_batches" ADD CONSTRAINT "accounting_import_batches__range_valid__check" CHECK (coverage_through IS NULL OR coverage_from < coverage_through);
ALTER TABLE public."accounting_logical_sources" ADD CONSTRAINT "accounting_logical_sources__range_valid__check" CHECK (valid_to IS NULL OR valid_from < valid_to);
ALTER TABLE public."bank_accounts" ADD CONSTRAINT "bank_accounts__range_valid__check" CHECK (active_to IS NULL OR active_from < active_to);
ALTER TABLE public."member_dues_tier_history" ADD CONSTRAINT "member_dues_tier_history__range_valid__check" CHECK (obligation_to IS NULL OR obligation_from < obligation_to);
ALTER TABLE public."member_position_assignments" ADD CONSTRAINT "member_position_assignments__range_valid__check" CHECK (effective_to IS NULL OR effective_from < effective_to);
