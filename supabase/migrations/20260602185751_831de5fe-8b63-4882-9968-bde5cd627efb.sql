ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS fieldroutes_customer_id text;

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS fieldroutes_appointment_id text;

CREATE INDEX IF NOT EXISTS reports_fieldroutes_customer_id_idx
  ON public.reports (fieldroutes_customer_id)
  WHERE fieldroutes_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS reports_fieldroutes_appointment_id_key
  ON public.reports (fieldroutes_appointment_id);

CREATE TABLE IF NOT EXISTS public.fieldroutes_write_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity text NOT NULL,
  action text NOT NULL,
  endpoint text NOT NULL,
  payload jsonb NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'committed', 'failed', 'rejected')),
  requested_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by text,
  decided_at timestamptz,
  result jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.fieldroutes_write_queue TO service_role;

CREATE INDEX IF NOT EXISTS fieldroutes_write_queue_status_idx
  ON public.fieldroutes_write_queue (status, requested_at DESC);

CREATE INDEX IF NOT EXISTS fieldroutes_write_queue_created_at_idx
  ON public.fieldroutes_write_queue (created_at DESC);

ALTER TABLE public.fieldroutes_write_queue ENABLE ROW LEVEL SECURITY;