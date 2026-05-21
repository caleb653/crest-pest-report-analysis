-- Audit log for the scheduling edge functions (scheduling-find-slot,
-- scheduling-review). These functions are no longer gated behind an
-- admin_sessions check — any staff member signed in through PinGate can
-- invoke them. The defense against bulk customer-table exfiltration is
-- this audit trail: every call records who initiated it, what they asked
-- for, and whether the upstream succeeded.
--
-- Only service_role (the edge functions) writes to this table. Admins
-- query it directly via the Supabase dashboard.

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
