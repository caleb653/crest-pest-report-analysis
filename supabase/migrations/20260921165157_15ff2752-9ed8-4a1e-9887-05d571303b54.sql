CREATE OR REPLACE FUNCTION public.portal_invoice_void(p_invoice uuid, p_actor text DEFAULT 'admin'::text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.portal_services s
     SET invoiced_at = NULL
   WHERE s.id IN (SELECT l.service_id FROM public.portal_invoice_lines l
                   WHERE l.invoice_id = p_invoice AND l.service_id IS NOT NULL);

  UPDATE public.portal_invoices
     SET status = 'void', voided_at = now(), edit_unlocked_until = NULL
   WHERE id = p_invoice;

  INSERT INTO public.portal_invoice_events (invoice_id, event, actor)
  VALUES (p_invoice, 'voided', p_actor);
END $$;

CREATE OR REPLACE FUNCTION public.portal_invoice_delete(p_invoice uuid, p_actor text DEFAULT 'admin'::text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.portal_services s
     SET invoiced_at = NULL
   WHERE s.id IN (SELECT l.service_id FROM public.portal_invoice_lines l
                   WHERE l.invoice_id = p_invoice AND l.service_id IS NOT NULL);

  DELETE FROM public.portal_invoice_lines    WHERE invoice_id = p_invoice;
  DELETE FROM public.portal_invoice_payments WHERE invoice_id = p_invoice;
  DELETE FROM public.portal_invoice_sends    WHERE invoice_id = p_invoice;
  DELETE FROM public.portal_invoice_revisions WHERE invoice_id = p_invoice;
  DELETE FROM public.portal_invoice_events   WHERE invoice_id = p_invoice;
  DELETE FROM public.portal_invoices         WHERE id = p_invoice;
END $$;

GRANT EXECUTE ON FUNCTION public.portal_invoice_void(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.portal_invoice_delete(uuid, text) TO anon, authenticated, service_role;