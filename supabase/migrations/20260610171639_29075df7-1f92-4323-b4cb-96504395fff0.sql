
-- =============================================================
-- 1. Portal Conditions (Active / Closed)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.portal_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.portal_properties(id) ON DELETE CASCADE,
  service_id uuid REFERENCES public.portal_services(id) ON DELETE SET NULL,
  identified_by text,
  location text NOT NULL DEFAULT '',
  condition text NOT NULL DEFAULT '',
  detail text,
  severity text NOT NULL DEFAULT 'Medium',
  action text,
  responsibility text NOT NULL DEFAULT 'Customer',
  status text NOT NULL DEFAULT 'active',
  photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  resolution_note text,
  resolution_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  identified_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_conditions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_conditions TO anon;
GRANT ALL ON public.portal_conditions TO service_role;

ALTER TABLE public.portal_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Conditions readable via portal link"
  ON public.portal_conditions FOR SELECT USING (true);
CREATE POLICY "Conditions insertable via portal link"
  ON public.portal_conditions FOR INSERT WITH CHECK (true);
CREATE POLICY "Conditions updatable via portal link"
  ON public.portal_conditions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Conditions deletable via portal link"
  ON public.portal_conditions FOR DELETE USING (true);

CREATE TRIGGER trg_portal_conditions_updated_at
  BEFORE UPDATE ON public.portal_conditions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_portal_conditions_property
  ON public.portal_conditions(property_id, status, identified_at DESC);

-- =============================================================
-- 2. Pest Sightings status workflow on portal_requests
-- =============================================================
ALTER TABLE public.portal_requests
  ADD COLUMN IF NOT EXISTS sighting_status text,
  ADD COLUMN IF NOT EXISTS crest_comments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Backfill sighting_status from existing status so the new tab works immediately.
UPDATE public.portal_requests
SET sighting_status = CASE
  WHEN response_notes IS NOT NULL AND length(trim(response_notes)) > 0 THEN 'closed'
  WHEN status = 'completed' THEN 'closed'
  WHEN status = 'scheduled' THEN 'in_progress'
  ELSE 'open'
END
WHERE sighting_status IS NULL;

-- =============================================================
-- 3. FieldRoutes auto-generate flag on portal_clients
-- =============================================================
ALTER TABLE public.portal_clients
  ADD COLUMN IF NOT EXISTS auto_generate_reports boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fieldroutes_customer_id text;
