-- Link a Crest report to its FieldRoutes customer.
--
-- This is the keystone of the app<->FieldRoutes "merge": once a report carries
-- the FieldRoutes customer_id, every write we make about that customer (upload
-- the signed proposal, add the "Sales Report" tag, create an appointment, etc.)
-- can target the right record — and because the id is chosen from a picker of
-- existing customers, we don't create duplicates.
--
-- Stored as text to match customers_stg.customer_id (STRING in BigQuery / the
-- FieldRoutes sync). NULL = not yet linked.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS fieldroutes_customer_id text;

CREATE INDEX IF NOT EXISTS reports_fieldroutes_customer_id_idx
  ON public.reports (fieldroutes_customer_id)
  WHERE fieldroutes_customer_id IS NOT NULL;
