-- Invoices stay editable forever, behind the admin password (Caleb, 2026-09-20).
--
-- The earlier design froze an invoice the moment it was sent. Caleb wants them
-- editable indefinitely instead. The protection therefore moves from "you may
-- not" to "you may, deliberately, and it is all written down":
--   * an admin unlocks the invoice (password in the UI) which stamps a window
--   * edits inside that window are allowed
--   * every change to an already-sent invoice snapshots the previous version
--     into portal_invoice_revisions first, so what the customer was sent is
--     always recoverable
-- Without an unlock, a sent invoice still refuses to change -- so nothing can
-- drift by accident, only on purpose.

ALTER TABLE public.portal_invoices
  ADD COLUMN IF NOT EXISTS edit_unlocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS edit_unlocked_by    text,
  ADD COLUMN IF NOT EXISTS revision            integer NOT NULL DEFAULT 1,
  -- free-form numbers the customer's AP department needs on the invoice:
  -- [{"label":"PO #","value":"4471"},{"label":"Vendor #","value":"CR-12"}]
  ADD COLUMN IF NOT EXISTS reference_numbers   jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.portal_invoices.reference_numbers IS
  'Optional labelled numbers printed at the top of the invoice. Never required.';

CREATE TABLE IF NOT EXISTS public.portal_invoice_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.portal_invoices(id) ON DELETE CASCADE,
  revision    integer NOT NULL,
  snapshot    jsonb NOT NULL,      -- the invoice header + lines as they stood
  changed_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_invoice_revisions_invoice_idx
  ON public.portal_invoice_revisions (invoice_id, revision DESC);

ALTER TABLE public.portal_invoice_revisions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portal_invoice_revisions_all ON public.portal_invoice_revisions;
CREATE POLICY portal_invoice_revisions_all ON public.portal_invoice_revisions
  FOR ALL USING (true) WITH CHECK (true);

-- Snapshot the current state of an invoice before it is changed.
CREATE OR REPLACE FUNCTION public.portal_invoice_snapshot(p_invoice uuid, p_actor text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_rev integer;
BEGIN
  SELECT revision INTO v_rev FROM public.portal_invoices WHERE id = p_invoice;

  INSERT INTO public.portal_invoice_revisions (invoice_id, revision, snapshot, changed_by)
  SELECT p_invoice, v_rev,
         jsonb_build_object(
           'invoice', to_jsonb(i) - 'edit_unlocked_until' - 'edit_unlocked_by',
           'lines',   COALESCE((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.sort_order)
                                  FROM public.portal_invoice_lines l
                                 WHERE l.invoice_id = p_invoice), '[]'::jsonb)
         ),
         p_actor
    FROM public.portal_invoices i WHERE i.id = p_invoice;
END $$;

-- Replaces the hard freeze: a sent invoice may be edited while unlocked.
CREATE OR REPLACE FUNCTION public.portal_invoices_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_locked boolean; v_material boolean;
BEGIN
  v_material :=
       NEW.subtotal       IS DISTINCT FROM OLD.subtotal
    OR NEW.total          IS DISTINCT FROM OLD.total
    OR NEW.tax_rate       IS DISTINCT FROM OLD.tax_rate
    OR NEW.tax_amount     IS DISTINCT FROM OLD.tax_amount
    OR NEW.period_start   IS DISTINCT FROM OLD.period_start
    OR NEW.period_end     IS DISTINCT FROM OLD.period_end
    OR NEW.issue_date     IS DISTINCT FROM OLD.issue_date
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
    OR NEW.property_id    IS DISTINCT FROM OLD.property_id;

  IF OLD.status IN ('sent','paid','partial','void') AND v_material THEN
    v_locked := OLD.edit_unlocked_until IS NULL OR OLD.edit_unlocked_until < now();
    IF v_locked THEN
      RAISE EXCEPTION
        'Invoice % has already been sent. Unlock it with the admin password before editing.',
        OLD.invoice_number;
    END IF;
    PERFORM public.portal_invoice_snapshot(OLD.id, COALESCE(OLD.edit_unlocked_by, 'admin'));
    NEW.revision := OLD.revision + 1;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END $$;

-- Same for the lines: frozen unless the parent invoice is unlocked.
CREATE OR REPLACE FUNCTION public.portal_invoice_lines_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text; v_until timestamptz; v_id uuid;
BEGIN
  v_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT status, edit_unlocked_until INTO v_status, v_until
    FROM public.portal_invoices WHERE id = v_id;

  IF v_status IN ('sent','paid','partial','void') THEN
    IF v_until IS NULL OR v_until < now() THEN
      RAISE EXCEPTION 'This invoice has been sent. Unlock it with the admin password before editing its lines.';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

-- Unlock / relock. The password itself is checked in the app, alongside every
-- other 18444 gate; this records WHO opened the invoice and WHEN.
CREATE OR REPLACE FUNCTION public.portal_invoice_unlock(
  p_invoice uuid,
  p_actor   text DEFAULT 'admin',
  p_minutes integer DEFAULT 20
) RETURNS timestamptz LANGUAGE plpgsql AS $$
DECLARE v_until timestamptz;
BEGIN
  v_until := now() + make_interval(mins => GREATEST(1, LEAST(p_minutes, 120)));
  UPDATE public.portal_invoices
     SET edit_unlocked_until = v_until, edit_unlocked_by = p_actor
   WHERE id = p_invoice;

  INSERT INTO public.portal_invoice_events (invoice_id, event, actor, detail)
  VALUES (p_invoice, 'unlocked', p_actor, jsonb_build_object('until', v_until));

  RETURN v_until;
END $$;

CREATE OR REPLACE FUNCTION public.portal_invoice_relock(p_invoice uuid, p_actor text DEFAULT 'admin')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.portal_invoices SET edit_unlocked_until = NULL WHERE id = p_invoice;
  INSERT INTO public.portal_invoice_events (invoice_id, event, actor)
  VALUES (p_invoice, 'relocked', p_actor);
END $$;
