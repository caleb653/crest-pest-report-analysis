ALTER TABLE public.portal_links
  DROP CONSTRAINT IF EXISTS portal_links_link_type_check;

ALTER TABLE public.portal_links
  ADD CONSTRAINT portal_links_link_type_check
  CHECK (link_type IN ('master','sub','tenant','billing'));

CREATE INDEX IF NOT EXISTS portal_links_billing_idx
  ON public.portal_links (link_type) WHERE link_type = 'billing';