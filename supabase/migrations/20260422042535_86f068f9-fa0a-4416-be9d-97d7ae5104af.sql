-- Add tenant communication & right-to-treat fields to work order requests
ALTER TABLE public.portal_requests
  ADD COLUMN IF NOT EXISTS occupancy_status text,
  ADD COLUMN IF NOT EXISTS tenant_email text,
  ADD COLUMN IF NOT EXISTS prep_sheet_id uuid,
  ADD COLUMN IF NOT EXISTS right_to_treat_requested boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS right_to_treat_signature text,
  ADD COLUMN IF NOT EXISTS right_to_treat_signed_at timestamptz,
  ADD COLUMN IF NOT EXISTS right_to_treat_signer_name text,
  ADD COLUMN IF NOT EXISTS right_to_treat_token text UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  ADD COLUMN IF NOT EXISTS tenant_email_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_portal_requests_rtt_token ON public.portal_requests(right_to_treat_token);