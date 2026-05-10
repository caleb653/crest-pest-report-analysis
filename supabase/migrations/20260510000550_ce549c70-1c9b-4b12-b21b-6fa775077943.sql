ALTER TABLE public.portal_services
  ADD COLUMN IF NOT EXISTS office_notes text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;