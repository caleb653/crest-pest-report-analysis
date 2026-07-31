-- Paced auto-writes to FieldRoutes (Caleb 2026-07-30): FieldRoutes tolerates
-- ~50 writes/minute, so instead of firing route pushes back-to-back we queue
-- them as pre-approved 'auto' rows and a worker commits ONE write every 30
-- seconds. The pacing is enforced from data (time since the last auto
-- commit), so extra worker invocations can never exceed the rate.

ALTER TABLE public.fieldroutes_write_queue
  DROP CONSTRAINT IF EXISTS fieldroutes_write_queue_status_check;
ALTER TABLE public.fieldroutes_write_queue
  ADD CONSTRAINT fieldroutes_write_queue_status_check
  CHECK (status IN ('pending', 'auto', 'processing', 'committed', 'failed', 'rejected'));

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Fire the drain worker every minute (each invocation commits at most 2
-- writes, 30s apart). The Authorization bearer is the project's PUBLIC anon
-- key — the worker does no caller-controlled work and paces from data, so
-- early/extra invocations are harmless.
SELECT cron.schedule(
  'fieldroutes-queue-worker-minutely',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://dbalmswufjanxswboxxp.supabase.co/functions/v1/fieldroutes-queue-worker',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRiYWxtc3d1Zmphbnhzd2JveHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMxNjg0OTMsImV4cCI6MjA3ODc0NDQ5M30.vfy8hKz5eFBTAnb3JvBOZm9hVd3BTisraViu7E9LKeM"}'::jsonb,
    body := '{"source": "pg_cron"}'::jsonb
  );
  $$
);
