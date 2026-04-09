ALTER TABLE public.portal_properties
ADD COLUMN equipment jsonb DEFAULT '[]'::jsonb,
ADD COLUMN customer_preferences jsonb DEFAULT '{}'::jsonb;