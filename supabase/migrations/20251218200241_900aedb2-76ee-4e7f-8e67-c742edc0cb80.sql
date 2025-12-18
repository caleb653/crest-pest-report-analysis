-- Add columns for signature and services (service type preferences)
ALTER TABLE public.reports 
ADD COLUMN IF NOT EXISTS customer_signature text,
ADD COLUMN IF NOT EXISTS services jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS service_date date,
ADD COLUMN IF NOT EXISTS license_number text,
ADD COLUMN IF NOT EXISTS target_pests jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS products_used jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS equipment jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS report_title text;