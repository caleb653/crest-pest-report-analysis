-- Per-unit Right-to-Treat authorizations (Caleb, 2026-09-25).
--
-- Every unit shown at an apartment property gets a signable Right-to-Treat
-- form, keyed by the unit number as it appears on the visit. One row per
-- (property, unit); the unit number is normalised (trimmed, lower-cased) so
-- "12A", "12a " and "Unit 12A" resolve to the same authorization. A row can
-- be signed in the app (tech / PM hands the tablet to the resident) or by the
-- resident from a token link (/right-to-treat/<token>, same page the work
-- order authorizations use).

CREATE TABLE IF NOT EXISTS public.portal_unit_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.portal_properties(id) ON DELETE CASCADE,
  unit_number text NOT NULL,
  unit_key text NOT NULL,
  signer_name text,
  signer_email text,
  signature text,
  signed_at timestamptz,
  signed_via text,
  token text UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_id, unit_key)
);

CREATE INDEX IF NOT EXISTS portal_unit_authorizations_property_idx
  ON public.portal_unit_authorizations (property_id);
CREATE INDEX IF NOT EXISTS portal_unit_authorizations_token_idx
  ON public.portal_unit_authorizations (token);

ALTER TABLE public.portal_unit_authorizations ENABLE ROW LEVEL SECURITY;

-- Same open posture as portal_requests (the portals are token-gated, not
-- user-gated).
CREATE POLICY "Anyone can view unit authorizations" ON public.portal_unit_authorizations FOR SELECT USING (true);
CREATE POLICY "Anyone can insert unit authorizations" ON public.portal_unit_authorizations FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update unit authorizations" ON public.portal_unit_authorizations FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete unit authorizations" ON public.portal_unit_authorizations FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION public.portal_unit_authorizations_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS portal_unit_authorizations_touch ON public.portal_unit_authorizations;
CREATE TRIGGER portal_unit_authorizations_touch
  BEFORE UPDATE ON public.portal_unit_authorizations
  FOR EACH ROW EXECUTE FUNCTION public.portal_unit_authorizations_touch();
