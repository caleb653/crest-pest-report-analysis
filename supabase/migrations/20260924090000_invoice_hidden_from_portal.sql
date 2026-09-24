-- Hide an invoice from the customer-facing views (Caleb, 2026-09-24).
--
-- Some invoices are real (issued, numbered, maybe paid) but should not be on
-- the customer's billing portal or their property Billing tab — an internal
-- correction, a bill handled outside the portal, a duplicate that was paid
-- another way. Hiding is an admin-only flag; the record, its number and its
-- money are untouched, and the admin Billing tab still shows it (badged).
--
-- Deliberately NOT part of the sent-invoice guard: hiding is a presentation
-- choice, not an edit to what the customer was handed.

ALTER TABLE public.portal_invoices
  ADD COLUMN IF NOT EXISTS hidden_from_portal boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.portal_invoices.hidden_from_portal IS
  'true = never shown on the customer billing portal or the customer Billing tab; admins still see it.';
