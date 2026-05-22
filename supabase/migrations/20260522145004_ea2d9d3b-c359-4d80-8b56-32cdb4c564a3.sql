CREATE TABLE IF NOT EXISTS public.scheduling_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  staff_name    text,
  payload       jsonb,
  success       boolean NOT NULL,
  error_code    text,
  ip_address    text,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scheduling_audit_log_created_at_idx
  ON public.scheduling_audit_log (created_at DESC);

CREATE INDEX IF NOT EXISTS scheduling_audit_log_staff_name_idx
  ON public.scheduling_audit_log (staff_name, created_at DESC);

ALTER TABLE public.scheduling_audit_log ENABLE ROW LEVEL SECURITY;