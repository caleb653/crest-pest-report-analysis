-- Who an invoice goes to (Caleb, 2026-09-20).
--
-- The billing contact is deliberately separate from the property's main
-- contact: the person who books the service is usually not the person in AP
-- who pays the bill.

ALTER TABLE public.portal_billing_settings
  ADD COLUMN IF NOT EXISTS billing_contact_name  text,
  ADD COLUMN IF NOT EXISTS billing_contact_email text,
  -- Crest staff copied on every invoice for this property, e.g.
  -- ["office@crestpestcontrol.com","caleb@crestpestco.com"]
  ADD COLUMN IF NOT EXISTS crest_cc jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Where TEST sends go. Defaulted in the edge function when left empty.
  ADD COLUMN IF NOT EXISTS test_recipients jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.portal_billing_settings.billing_contact_email IS
  'The To: address for invoices. Separate from the property contact on purpose.';
COMMENT ON COLUMN public.portal_billing_settings.crest_cc IS
  'Crest staff addresses copied on every invoice sent for this property.';

-- Mark an invoice sent. Called by the edge function AFTER Resend accepts it, so
-- a failed send never leaves an invoice claiming it went out.
CREATE OR REPLACE FUNCTION public.portal_invoice_mark_sent(
  p_invoice uuid,
  p_to      jsonb,
  p_actor   text DEFAULT 'admin'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.portal_invoices
     SET status  = CASE WHEN status IN ('draft','ready') THEN 'sent' ELSE status END,
         sent_at = COALESCE(sent_at, now()),
         sent_to = p_to,
         send_error = NULL
   WHERE id = p_invoice;

  -- Stop these visits landing on a second invoice.
  UPDATE public.portal_services s
     SET invoiced_at = COALESCE(s.invoiced_at, now())
   WHERE s.id IN (
     SELECT l.service_id FROM public.portal_invoice_lines l
      WHERE l.invoice_id = p_invoice AND l.service_id IS NOT NULL
   );

  INSERT INTO public.portal_invoice_events (invoice_id, event, actor, detail)
  VALUES (p_invoice, 'sent', p_actor, jsonb_build_object('to', p_to));
END $$;
