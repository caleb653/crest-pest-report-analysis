-- Recurring bills and one-time bills are different things (Caleb, 2026-09-20).
--
-- A cadence invoice covers a billing period and sweeps up every visit in it.
-- A one-time bill is a deliberate, standalone charge: a one-off treatment, a
-- callback, something with no service attached at all. Keeping them apart means
-- a one-off can never be mistaken for "this period's invoice" -- and the
-- one-open-draft-per-period rule only applies to the cadence kind.

ALTER TABLE public.portal_invoices
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cadence'
    CHECK (kind IN ('cadence','one_time'));

COMMENT ON COLUMN public.portal_invoices.kind IS
  'cadence = covers a billing period; one_time = a standalone bill with no cycle.';

-- Existing rows with no period were never cycle invoices.
UPDATE public.portal_invoices SET kind = 'one_time'
 WHERE period_start IS NULL AND kind = 'cadence';

-- The "one open draft per period" guard is a CADENCE rule. Several one-time
-- bills may legitimately be open at once.
DROP INDEX IF EXISTS public.portal_invoices_open_period_idx;
CREATE UNIQUE INDEX IF NOT EXISTS portal_invoices_open_period_idx
  ON public.portal_invoices (property_id, period_start, period_end)
  WHERE status IN ('draft','ready') AND period_start IS NOT NULL AND kind = 'cadence';
