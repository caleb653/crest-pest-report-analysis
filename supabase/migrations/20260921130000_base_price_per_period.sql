-- The recurring price covers a BILLING PERIOD, never a visit (Caleb, 2026-09-21).
--
-- "if someone is monthly billing but visits every 2 weeks they only are charged
--  the recurring price once per month even tho they get 2 visits"
--
-- per_visit could only ever over-bill: where the visit rhythm and the billing
-- rhythm coincide it gives the same answer as per_period, and where they differ
-- it multiplies the recurring charge by the number of visits. The column stays
-- (dropping it would rewrite history) but nothing may select it any more.

UPDATE public.portal_billing_settings
   SET base_price_basis = 'per_period'
 WHERE base_price_basis <> 'per_period';

ALTER TABLE public.portal_billing_settings
  ALTER COLUMN base_price_basis SET DEFAULT 'per_period';

COMMENT ON COLUMN public.portal_billing_settings.base_price_basis IS
  'per_period: the recurring price covers every visit in the billing period, however many there are. per_visit is retained for old rows only and is no longer selectable.';
