ALTER TABLE public.portal_services ADD COLUMN IF NOT EXISTS frequency_days integer;
ALTER TABLE public.portal_requests ADD COLUMN IF NOT EXISTS pest_type text;
ALTER TABLE public.portal_requests ADD COLUMN IF NOT EXISTS location_type text DEFAULT 'interior';
ALTER TABLE public.portal_requests ADD COLUMN IF NOT EXISTS preferred_date date;