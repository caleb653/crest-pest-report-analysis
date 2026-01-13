-- Add column to track if report was sent to customer (making it read-only for customers)
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS sent_to_customer_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS customer_email TEXT DEFAULT NULL;