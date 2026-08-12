-- FieldRoutes customer-portal login links, cached by customer (Caleb 2026-08-11).
--
-- The FieldRoutes customer API never exposes the FieldPortals {{loginLink}} —
-- the only places it ever appears are (a) a FieldRoutes Trigger webhook payload
-- and (b) a manual paste into a report. Until now each sighting was buried in
-- one report's customer_preferences JSONB, so selecting the same customer from
-- the FieldRoutes lookup later couldn't surface their portal link.
--
-- This table is the durable customer_id -> login_link cache. Fed by:
--   * fieldroutes-inspection-webhook (every trigger firing, even non-inspections)
--   * manual pastes on the report pages
-- Read by CustomerPicker / Customer Lookup so the portal link pops up the
-- moment a customer is selected.

CREATE TABLE IF NOT EXISTS public.fieldroutes_login_links (
  customer_id  text PRIMARY KEY,
  login_link   text NOT NULL,
  source       text,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fieldroutes_login_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view login links"   ON public.fieldroutes_login_links FOR SELECT USING (true);
CREATE POLICY "Anyone can insert login links" ON public.fieldroutes_login_links FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update login links" ON public.fieldroutes_login_links FOR UPDATE USING (true) WITH CHECK (true);

CREATE TRIGGER update_fieldroutes_login_links_updated_at
  BEFORE UPDATE ON public.fieldroutes_login_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed from every link already captured on a report (webhook-created drafts and
-- manual pastes), taking the most recently touched report per customer.
INSERT INTO public.fieldroutes_login_links (customer_id, login_link, source)
SELECT DISTINCT ON (fieldroutes_customer_id)
  fieldroutes_customer_id,
  customer_preferences->>'fieldroutes_login_link',
  'reports-seed'
FROM public.reports
WHERE fieldroutes_customer_id IS NOT NULL
  AND customer_preferences->>'fieldroutes_login_link' LIKE 'http%'
ORDER BY fieldroutes_customer_id, COALESCE(updated_at, created_at) DESC NULLS LAST
ON CONFLICT (customer_id) DO NOTHING;
