-- Link a report to the FieldRoutes appointment that spawned it, and guarantee
-- we never create two reports for the same inspection appointment.
--
-- Used by the inspection auto-create job: when a Pest/Rodent Inspection
-- appointment is scheduled in FieldRoutes, we auto-create one draft Initial
-- Pest Report carrying the customer's info. The unique index makes that
-- idempotent — re-running the sync can't duplicate.

ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS fieldroutes_appointment_id text;

-- Plain UNIQUE index: Postgres treats NULLs as distinct, so the many reports
-- without an appointment link stay valid, while non-null appointment ids are
-- unique. Non-partial so ON CONFLICT (fieldroutes_appointment_id) can infer it.
CREATE UNIQUE INDEX IF NOT EXISTS reports_fieldroutes_appointment_id_key
  ON public.reports (fieldroutes_appointment_id);
