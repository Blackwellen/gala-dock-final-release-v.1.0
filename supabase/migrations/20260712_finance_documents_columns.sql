-- =============================================================================
-- Finance section — R2 document-generation follow-up.
-- Idempotent: ADD COLUMN IF NOT EXISTS.
-- payroll_exports.storage_key and event_expense_payments.remittance_storage_key
-- already exist from 20260712_finance_section_rebuild.sql; this file adds the
-- one column that was missing for deposit payment receipts.
-- =============================================================================

ALTER TABLE public.event_deposit_payments
  ADD COLUMN IF NOT EXISTS receipt_storage_key text;
