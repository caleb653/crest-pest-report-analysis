-- How treated units appear on an invoice (Caleb, 2026-09-21).
--
-- Some properties want to see what each unit cost; others just want one price
-- for the day with the units listed as proof of work. Both need the unit list
-- either way -- the choice is only whether money is attached to each unit.
--
--   summary  = one line for the visit: (units over) x (per-unit price),
--              units listed underneath with no individual prices  [default]
--   itemized = one line per unit over the plan, each priced on its own
--   flat     = one line for the visit at a price set by hand, units listed
--              underneath with no per-unit maths at all

ALTER TABLE public.portal_billing_settings
  ADD COLUMN IF NOT EXISTS unit_line_style text NOT NULL DEFAULT 'summary'
    CHECK (unit_line_style IN ('summary','itemized','flat'));

COMMENT ON COLUMN public.portal_billing_settings.unit_line_style IS
  'summary = qty x per-unit price on one line; itemized = a priced line per unit; flat = one price for the day, units listed only.';
