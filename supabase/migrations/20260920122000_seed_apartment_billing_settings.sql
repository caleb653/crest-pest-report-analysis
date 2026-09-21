-- Billing settings for the apartment accounts (Caleb, 2026-09-20).
--
-- Billing cadence is NOT the visit rhythm: Huntington Cove is serviced every 14
-- days and Stonebrook weekly, but they are billed monthly and every 4 weeks.
--
-- Every property starts in send_mode='test' -- invoices go only to the internal
-- test recipients until Caleb flips a property to 'live' by hand -- and
-- auto_send=false, because nothing sends without a person clicking Send.

INSERT INTO public.portal_billing_settings
  (property_id, billing_mode, cadence, base_price_basis, payment_terms_days, send_mode, auto_send)
VALUES
  -- Huntington Cove Apts (FR 12649) — visited every 14 days, billed monthly
  ('96e29290-7c56-4e0c-8682-01d1c3fed455', 'cadence', 'monthly', 'per_period', 30, 'test', false),
  -- El Sereno Apartments (FR 13590) — visited every 30 days, billed monthly
  ('19a6f301-2a0c-4b9f-bbf2-8e8b8d13e59e', 'cadence', 'monthly', 'per_period', 30, 'test', false),
  -- Stonebrook Apartment Homes (FR 12753) — visited weekly, billed every 4 weeks.
  -- cadence_anchor is deliberately NULL: the 4-week window cannot be guessed, and
  -- the builder refuses to open a period until someone sets the first period start.
  ('be5b0116-ecb4-4db9-80cd-ae0c0722f7d1', 'cadence', '4_weeks', 'per_period', 30, 'test', false),
  -- Villa Capri (FR 13670) — no recurring subscription, one-off work only
  ('ddb53bfb-694b-41c9-a837-e92283894f8e', 'per_service', NULL, 'per_period', 30, 'test', false)
ON CONFLICT (property_id) DO NOTHING;

-- A cadence property with no anchor can't produce a period. Make that a hard
-- rule rather than something the builder has to remember.
ALTER TABLE public.portal_billing_settings
  DROP CONSTRAINT IF EXISTS portal_billing_settings_cadence_needs_anchor;

CREATE OR REPLACE FUNCTION public.portal_billing_period_bounds(p_property uuid, p_asof date)
RETURNS daterange LANGUAGE plpgsql STABLE AS $$
DECLARE s public.portal_billing_settings%ROWTYPE; v_start date; v_periods integer;
BEGIN
  SELECT * INTO s FROM public.portal_billing_settings WHERE property_id = p_property;
  IF NOT FOUND OR s.billing_mode <> 'cadence' THEN RETURN NULL; END IF;

  IF s.cadence = 'monthly' THEN
    RETURN daterange(DATE_TRUNC('month', p_asof)::date,
                     (DATE_TRUNC('month', p_asof) + INTERVAL '1 month')::date, '[)');

  ELSIF s.cadence = 'quarterly' THEN
    RETURN daterange(DATE_TRUNC('quarter', p_asof)::date,
                     (DATE_TRUNC('quarter', p_asof) + INTERVAL '3 months')::date, '[)');

  ELSIF s.cadence = '4_weeks' THEN
    IF s.cadence_anchor IS NULL THEN
      RAISE EXCEPTION
        'Property % is billed every 4 weeks but has no cadence_anchor. Set the first period start before invoicing.',
        p_property;
    END IF;
    v_periods := FLOOR((p_asof - s.cadence_anchor) / 28.0);
    v_start   := s.cadence_anchor + (v_periods * 28);
    RETURN daterange(v_start, v_start + 28, '[)');
  END IF;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.portal_billing_period_bounds IS
  'The billing window a date falls in for a property. 4-week cadences raise rather than guess when no anchor is set.';
