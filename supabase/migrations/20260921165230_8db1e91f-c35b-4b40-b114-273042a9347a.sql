ALTER TABLE public.portal_billing_settings
  ADD COLUMN IF NOT EXISTS unit_line_style text NOT NULL DEFAULT 'summary';