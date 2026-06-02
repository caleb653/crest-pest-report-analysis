-- FieldRoutes write approval queue.
--
-- Every write the app wants to make to FieldRoutes is recorded here as a
-- PENDING row first. Nothing is ever sent to FieldRoutes automatically — an
-- admin must individually approve each row (one click per write) before it is
-- committed. This is the primary human-in-the-loop safety gate for write access.
--
-- Lifecycle:
--   pending    → just submitted, awaiting a human decision
--   processing → an admin clicked approve; the write is mid-flight (transient,
--                claimed atomically so two approvers can't double-write)
--   committed  → an admin approved it AND the FieldRoutes write succeeded
--   failed     → an admin approved it but the FieldRoutes write errored
--   rejected   → an admin declined it; never sent
--
-- Only service_role (the edge functions) reads/writes this table. The frontend
-- never touches it directly — it goes through the fieldroutes-queue-* edge
-- functions, which are gated by a valid admin session.

CREATE TABLE IF NOT EXISTS public.fieldroutes_write_queue (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity        text NOT NULL,                       -- 'note', 'appointment', ...
  action        text NOT NULL,                       -- 'create', 'update'
  endpoint      text NOT NULL,                        -- Cloud Run path, e.g. '/api/fr/note'
  payload       jsonb NOT NULL,                        -- exact body to send to Cloud Run
  summary       text,                                 -- human-readable one-liner for the UI
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'committed', 'failed', 'rejected')),
  requested_by  text,                                 -- admin who submitted
  requested_at  timestamptz NOT NULL DEFAULT now(),
  decided_by    text,                                 -- admin who approved/rejected
  decided_at    timestamptz,
  result        jsonb,                                -- FieldRoutes/Cloud Run response on commit
  error         text,                                 -- failure detail
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The approval UI lists pending first, newest first.
CREATE INDEX IF NOT EXISTS fieldroutes_write_queue_status_idx
  ON public.fieldroutes_write_queue (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS fieldroutes_write_queue_created_at_idx
  ON public.fieldroutes_write_queue (created_at DESC);

-- RLS on, no anon/authenticated policies: only service_role (edge functions)
-- can see or change rows. Locked down by default.
ALTER TABLE public.fieldroutes_write_queue ENABLE ROW LEVEL SECURITY;
