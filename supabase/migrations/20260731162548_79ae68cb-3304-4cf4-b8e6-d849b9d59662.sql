ALTER TABLE public.fieldroutes_write_queue
  DROP CONSTRAINT IF EXISTS fieldroutes_write_queue_status_check;
ALTER TABLE public.fieldroutes_write_queue
  ADD CONSTRAINT fieldroutes_write_queue_status_check
  CHECK (status IN ('pending', 'auto', 'processing', 'committed', 'failed', 'rejected'));