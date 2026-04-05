ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS customer_key_areas jsonb DEFAULT NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS customer_preferences jsonb DEFAULT NULL;