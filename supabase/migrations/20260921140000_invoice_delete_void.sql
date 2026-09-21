-- Deleting and voiding invoices (Caleb, 2026-09-21).
--
-- Two different situations, deliberately not the same button:
--   * a DRAFT was never seen by anyone -> delete it outright
--   * a SENT invoice is a document the customer is holding -> VOID keeps the
--     record and the number; deleting it destroys evidence, so it is possible
--     but gated behind the admin password in the UI
--
-- Either way the visits on it must be released. A visit stamped invoiced_at by
-- an invoice that no longer exists would never appear as billable again -- it
-- would silently vanish from billing forever.

/** Clear invoiced_at for visits on this invoice that aren't billed anywhere else. */
CREATE OR REPLACE FUNCTION public.portal_invoice_release_visits(p_invoice uuid)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE v_count integer;
BEGIN
  WITH mine AS (
    SELECT DISTINCT l.service_id
      FROM public.portal_invoice_lines l
     WHERE l.invoice_id = p_invoice AND l.service_id IS NOT NULL
  ),
  still_billed AS (
    SELECT DISTINCT l.service_id
      FROM public.portal_invoice_lines l
      JOIN public.portal_invoices i ON i.id = l.invoice_id
     WHERE l.invoice_id <> p_invoice
       AND l.service_id IN (SELECT service_id FROM mine)
       AND i.status IN ('sent','paid','partial')
  )
  UPDATE public.portal_services s
     SET invoiced_at = NULL
   WHERE s.id IN (SELECT service_id FROM mine)
     AND s.id NOT IN (SELECT service_id FROM still_billed);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

/** Void an invoice: the record and its number stay, nothing is destroyed. */
CREATE OR REPLACE FUNCTION public.portal_invoice_void(
  p_invoice uuid,
  p_reason  text DEFAULT NULL,
  p_actor   text DEFAULT 'admin'
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.portal_invoices
     SET status = 'void', voided_at = now(), void_reason = p_reason
   WHERE id = p_invoice;

  PERFORM public.portal_invoice_release_visits(p_invoice);

  INSERT INTO public.portal_invoice_events (invoice_id, event, actor, detail)
  VALUES (p_invoice, 'voided', p_actor, jsonb_build_object('reason', p_reason));
END $$;

/**
 * Delete an invoice for good.
 *
 * The line guard refuses to touch the lines of a sent invoice, and deleting the
 * header cascades into them -- so the invoice is unlocked first, otherwise a
 * sent invoice could never be deleted at all.
 */
CREATE OR REPLACE FUNCTION public.portal_invoice_delete(
  p_invoice uuid,
  p_actor   text DEFAULT 'admin'
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_number text; v_status text; v_released integer;
BEGIN
  SELECT invoice_number, status INTO v_number, v_status
    FROM public.portal_invoices WHERE id = p_invoice;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice not found.'; END IF;

  v_released := public.portal_invoice_release_visits(p_invoice);

  UPDATE public.portal_invoices
     SET edit_unlocked_until = now() + interval '1 minute', edit_unlocked_by = p_actor
   WHERE id = p_invoice;

  DELETE FROM public.portal_invoices WHERE id = p_invoice;

  RAISE NOTICE 'Deleted invoice % (was %), released % visit(s).', v_number, v_status, v_released;
END $$;

COMMENT ON FUNCTION public.portal_invoice_delete IS
  'Permanently removes an invoice and releases its visits back to billable. Prefer portal_invoice_void for anything already sent.';
