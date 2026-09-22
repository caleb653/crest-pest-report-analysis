-- Customer-facing billing portal (Caleb, 2026-09-21).
--
-- A billing portal is a portal_links row of a new type: the admin picks which
-- properties appear on it (assigned_property_ids), and the customer opens
-- /billing/<token> to see those properties as tiles with every issued invoice,
-- paid vs outstanding, and the units behind each line. Only the admin side can
-- change which properties are on it -- the page itself is read-only.
--
-- The original CHECK only allowed master/sub; 'tenant' is already used in code,
-- so the constraint is rebuilt with the full set rather than assumed.

ALTER TABLE public.portal_links
  DROP CONSTRAINT IF EXISTS portal_links_link_type_check;

ALTER TABLE public.portal_links
  ADD CONSTRAINT portal_links_link_type_check
  CHECK (link_type IN ('master','sub','tenant','billing'));

CREATE INDEX IF NOT EXISTS portal_links_billing_idx
  ON public.portal_links (link_type) WHERE link_type = 'billing';
