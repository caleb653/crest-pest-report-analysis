ALTER TABLE public.portal_properties
  ADD COLUMN IF NOT EXISTS fieldroutes_customer_id text;

COMMENT ON COLUMN public.portal_properties.fieldroutes_customer_id IS
  'FieldRoutes customerID for this property (FR bills per property, not per client).';

CREATE INDEX IF NOT EXISTS portal_properties_fieldroutes_customer_id_idx
  ON public.portal_properties (fieldroutes_customer_id)
  WHERE fieldroutes_customer_id IS NOT NULL;

UPDATE public.portal_properties SET fieldroutes_customer_id = '13590'
  WHERE id = '19a6f301-2a0c-4b9f-bbf2-8e8b8d13e59e' AND fieldroutes_customer_id IS NULL;
UPDATE public.portal_properties SET fieldroutes_customer_id = '12649'
  WHERE id = '96e29290-7c56-4e0c-8682-01d1c3fed455' AND fieldroutes_customer_id IS NULL;
UPDATE public.portal_properties SET fieldroutes_customer_id = '12753'
  WHERE id = 'be5b0116-ecb4-4db9-80cd-ae0c0722f7d1' AND fieldroutes_customer_id IS NULL;
UPDATE public.portal_properties SET fieldroutes_customer_id = '13670'
  WHERE id = 'ddb53bfb-694b-41c9-a837-e92283894f8e' AND fieldroutes_customer_id IS NULL;

-- ---------------------------------------------------------------- settings --
CREATE TABLE IF NOT EXISTS public.portal_billing_settings (
  property_id        uuid PRIMARY KEY REFERENCES public.portal_properties(id) ON DELETE CASCADE,
  billing_mode       text NOT NULL DEFAULT 'per_service'
                       CHECK (billing_mode IN ('per_service','cadence','manual')),
  cadence            text CHECK (cadence IN ('4_weeks','monthly','quarterly')),
  cadence_anchor     date,
  send_days          integer[],
  send_dates         date[],
  send_mode          text NOT NULL DEFAULT 'test' CHECK (send_mode IN ('test','live')),
  auto_send          boolean NOT NULL DEFAULT false,
  base_price_basis   text NOT NULL DEFAULT 'per_period'
                       CHECK (base_price_basis IN ('per_visit','per_period')),
  payment_terms_days integer NOT NULL DEFAULT 30,
  tax_rate           numeric(7,5) NOT NULL DEFAULT 0,
  default_po_number  text,
  invoice_to         jsonb NOT NULL DEFAULT '[]'::jsonb,
  invoice_cc         jsonb NOT NULL DEFAULT '[]'::jsonb,
  footer_note        text,
  next_send_date     date,
  last_sent_period   daterange,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS public.portal_invoice_number_seq START 1000;

CREATE TABLE IF NOT EXISTS public.portal_invoices (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id         uuid NOT NULL REFERENCES public.portal_properties(id) ON DELETE RESTRICT,
  client_id           uuid REFERENCES public.portal_clients(id) ON DELETE SET NULL,
  invoice_number      text NOT NULL UNIQUE,
  status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','ready','sent','paid','partial','void')),
  period_start        date,
  period_end          date,
  issue_date          date NOT NULL DEFAULT CURRENT_DATE,
  due_date            date,
  po_number           text,
  subtotal            numeric(12,2) NOT NULL DEFAULT 0,
  tax_rate            numeric(7,5)  NOT NULL DEFAULT 0,
  tax_amount          numeric(12,2) NOT NULL DEFAULT 0,
  total               numeric(12,2) NOT NULL DEFAULT 0,
  amount_paid         numeric(12,2) NOT NULL DEFAULT 0,
  balance             numeric(12,2) GENERATED ALWAYS AS (total - amount_paid) STORED,
  fieldroutes_status    text NOT NULL DEFAULT 'pending'
                          CHECK (fieldroutes_status IN ('pending','matched','mismatch','not_required')),
  fieldroutes_ticket_id text,
  fieldroutes_matched_at timestamptz,
  fieldroutes_variance  numeric(12,2),
  front_desk_note       text,
  customer_note       text,
  internal_note       text,
  pdf_path            text,
  sent_at             timestamptz,
  sent_to             jsonb,
  send_error          text,
  supersedes_id       uuid REFERENCES public.portal_invoices(id) ON DELETE SET NULL,
  voided_at           timestamptz,
  void_reason         text,
  created_by          text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_invoices_property_idx ON public.portal_invoices (property_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS portal_invoices_status_idx   ON public.portal_invoices (status) WHERE status IN ('draft','ready','sent','partial');

CREATE TABLE IF NOT EXISTS public.portal_invoice_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.portal_invoices(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,
  line_type     text NOT NULL DEFAULT 'custom'
                  CHECK (line_type IN ('base','units','ad_hoc','credit','discount','custom')),
  service_id    uuid REFERENCES public.portal_services(id) ON DELETE SET NULL,
  description   text NOT NULL,
  detail        text,
  service_date  date,
  quantity      numeric(12,3) NOT NULL DEFAULT 1,
  unit_price    numeric(12,2) NOT NULL DEFAULT 0,
  amount        numeric(12,2) GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED,
  taxable       boolean NOT NULL DEFAULT true,
  units_snapshot jsonb,
  fr_entry_required boolean,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_invoice_lines_invoice_idx ON public.portal_invoice_lines (invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS portal_invoice_lines_service_idx ON public.portal_invoice_lines (service_id) WHERE service_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.portal_invoice_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid NOT NULL REFERENCES public.portal_invoices(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL,
  paid_on        date NOT NULL DEFAULT CURRENT_DATE,
  method         text,
  reference      text,
  source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','fieldroutes_sync')),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_invoice_payments_invoice_idx ON public.portal_invoice_payments (invoice_id);

CREATE TABLE IF NOT EXISTS public.portal_invoice_sends (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.portal_invoices(id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('test','live')),
  to_emails   jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_emails   jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject     text,
  ok          boolean NOT NULL DEFAULT false,
  error       text,
  actor       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_invoice_sends_invoice_idx ON public.portal_invoice_sends (invoice_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS portal_invoice_sends_one_live_idx
  ON public.portal_invoice_sends (invoice_id)
  WHERE mode = 'live' AND ok;

CREATE TABLE IF NOT EXISTS public.portal_invoice_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.portal_invoices(id) ON DELETE CASCADE,
  event       text NOT NULL,
  actor       text,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_invoice_events_invoice_idx ON public.portal_invoice_events (invoice_id, created_at DESC);

ALTER TABLE public.portal_services
  ADD COLUMN IF NOT EXISTS billing_type   text
    CHECK (billing_type IN ('plan','billable','no_charge','warranty','quoted')),
  ADD COLUMN IF NOT EXISTS billing_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS po_number      text,
  ADD COLUMN IF NOT EXISTS invoiced_at    timestamptz;

CREATE INDEX IF NOT EXISTS portal_services_uninvoiced_idx
  ON public.portal_services (property_id, service_date)
  WHERE invoiced_at IS NULL AND status = 'completed';

CREATE OR REPLACE FUNCTION public.portal_invoice_recalc(p_invoice uuid)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_taxable numeric(12,2); v_sub numeric(12,2); v_rate numeric(7,5);
BEGIN
  SELECT COALESCE(SUM(amount),0), COALESCE(SUM(amount) FILTER (WHERE taxable),0)
    INTO v_sub, v_taxable
    FROM public.portal_invoice_lines WHERE invoice_id = p_invoice;

  SELECT tax_rate INTO v_rate FROM public.portal_invoices WHERE id = p_invoice;

  UPDATE public.portal_invoices
     SET subtotal   = v_sub,
         tax_amount = ROUND(v_taxable * COALESCE(v_rate,0), 2),
         total      = v_sub + ROUND(v_taxable * COALESCE(v_rate,0), 2),
         updated_at = now()
   WHERE id = p_invoice;
END $$;

CREATE OR REPLACE FUNCTION public.portal_invoice_lines_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  PERFORM public.portal_invoice_recalc(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS portal_invoice_lines_recalc ON public.portal_invoice_lines;
CREATE TRIGGER portal_invoice_lines_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.portal_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.portal_invoice_lines_touch();

CREATE OR REPLACE FUNCTION public.portal_invoice_payments_apply()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_id uuid; v_paid numeric(12,2); v_total numeric(12,2); v_status text;
BEGIN
  v_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.portal_invoice_payments WHERE invoice_id = v_id;
  SELECT total, status INTO v_total, v_status FROM public.portal_invoices WHERE id = v_id;

  UPDATE public.portal_invoices
     SET amount_paid = v_paid,
         status = CASE
           WHEN v_status = 'void' THEN 'void'
           WHEN v_paid <= 0 THEN CASE WHEN sent_at IS NOT NULL THEN 'sent' ELSE 'ready' END
           WHEN v_paid >= v_total THEN 'paid'
           ELSE 'partial' END
   WHERE id = v_id;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS portal_invoice_payments_apply_trg ON public.portal_invoice_payments;
CREATE TRIGGER portal_invoice_payments_apply_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.portal_invoice_payments
  FOR EACH ROW EXECUTE FUNCTION public.portal_invoice_payments_apply();

CREATE OR REPLACE FUNCTION public.portal_next_invoice_number()
RETURNS text LANGUAGE sql VOLATILE SET search_path = public AS $$
  SELECT 'CR-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' ||
         LPAD(nextval('public.portal_invoice_number_seq')::text, 5, '0');
$$;

ALTER TABLE public.portal_invoices
  ALTER COLUMN invoice_number SET DEFAULT public.portal_next_invoice_number();

CREATE OR REPLACE FUNCTION public.portal_invoices_tax_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tax_rate IS DISTINCT FROM OLD.tax_rate THEN
    PERFORM public.portal_invoice_recalc(NEW.id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS portal_invoices_tax_touch_trg ON public.portal_invoices;
CREATE TRIGGER portal_invoices_tax_touch_trg
  AFTER UPDATE OF tax_rate ON public.portal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.portal_invoices_tax_touch();

CREATE OR REPLACE FUNCTION public.portal_invoices_due_default()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_terms integer;
BEGIN
  IF NEW.due_date IS NULL THEN
    SELECT payment_terms_days INTO v_terms
      FROM public.portal_billing_settings WHERE property_id = NEW.property_id;
    NEW.due_date := NEW.issue_date + COALESCE(v_terms, 30);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS portal_invoices_due_default_trg ON public.portal_invoices;
CREATE TRIGGER portal_invoices_due_default_trg
  BEFORE INSERT ON public.portal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.portal_invoices_due_default();

CREATE OR REPLACE VIEW public.portal_front_desk_billing_tasks AS
SELECT
  i.id                    AS invoice_id,
  i.invoice_number,
  p.name                  AS property_name,
  p.fieldroutes_customer_id,
  i.period_start,
  i.period_end,
  i.issue_date,
  i.total                 AS crest_total,
  i.po_number,
  i.front_desk_note,
  i.fieldroutes_status,
  i.fieldroutes_variance,
  (SELECT COALESCE(SUM(l.quantity), 0)
     FROM public.portal_invoice_lines l
    WHERE l.invoice_id = i.id AND l.line_type = 'units')  AS units_over_billed,
  (SELECT COALESCE(SUM(l.amount), 0)
     FROM public.portal_invoice_lines l
    WHERE l.invoice_id = i.id
      AND COALESCE(l.fr_entry_required, l.line_type <> 'base'))  AS amount_to_key_into_fr,
  (SELECT string_agg(
            COALESCE(TO_CHAR(l.service_date,'MM/DD') || '  ', '') ||
            l.description || COALESCE(' — ' || l.detail, '') ||
            '  $' || TO_CHAR(l.amount,'FM999999990.00'),
            E'\n' ORDER BY l.sort_order)
     FROM public.portal_invoice_lines l
    WHERE l.invoice_id = i.id
      AND COALESCE(l.fr_entry_required, l.line_type <> 'base'))  AS lines_to_key_into_fr,
  (SELECT string_agg(l.description || COALESCE(' — ' || l.detail, ''), E'\n' ORDER BY l.sort_order)
     FROM public.portal_invoice_lines l
    WHERE l.invoice_id = i.id)                            AS line_summary
FROM public.portal_invoices i
JOIN public.portal_properties p ON p.id = i.property_id
WHERE i.status IN ('sent','paid','partial')
  AND i.fieldroutes_status = 'pending'
ORDER BY i.issue_date, p.name;

CREATE OR REPLACE FUNCTION public.portal_invoice_set_paid(
  p_invoice   uuid,
  p_paid      boolean,
  p_actor     text DEFAULT NULL,
  p_method    text DEFAULT 'manual',
  p_reference text DEFAULT NULL,
  p_paid_on   date DEFAULT NULL
) RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_total numeric(12,2); v_paid numeric(12,2); v_status text;
BEGIN
  SELECT total, amount_paid, status INTO v_total, v_paid, v_status
    FROM public.portal_invoices WHERE id = p_invoice FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice; END IF;
  IF v_status = 'void' THEN RAISE EXCEPTION 'Invoice is void; it cannot be marked paid.'; END IF;

  IF p_paid THEN
    IF v_total - v_paid <= 0 THEN RETURN v_status; END IF;
    INSERT INTO public.portal_invoice_payments (invoice_id, amount, paid_on, method, reference, source, note)
    VALUES (p_invoice, v_total - v_paid, COALESCE(p_paid_on, CURRENT_DATE), p_method, p_reference,
            'manual', 'Marked paid in the Crest app');
  ELSE
    DELETE FROM public.portal_invoice_payments
     WHERE invoice_id = p_invoice AND source = 'manual';
  END IF;

  INSERT INTO public.portal_invoice_events (invoice_id, event, actor, detail)
  VALUES (p_invoice, CASE WHEN p_paid THEN 'marked_paid' ELSE 'marked_unpaid' END, p_actor,
          jsonb_build_object('method', p_method, 'reference', p_reference));

  SELECT status INTO v_status FROM public.portal_invoices WHERE id = p_invoice;
  RETURN v_status;
END $$;

-- ------------------------------------------------------- seed settings ------
INSERT INTO public.portal_billing_settings
  (property_id, billing_mode, cadence, base_price_basis, payment_terms_days, send_mode, auto_send)
VALUES
  ('96e29290-7c56-4e0c-8682-01d1c3fed455', 'cadence', 'monthly', 'per_period', 30, 'test', false),
  ('19a6f301-2a0c-4b9f-bbf2-8e8b8d13e59e', 'cadence', 'monthly', 'per_period', 30, 'test', false),
  ('be5b0116-ecb4-4db9-80cd-ae0c0722f7d1', 'cadence', '4_weeks', 'per_period', 30, 'test', false),
  ('ddb53bfb-694b-41c9-a837-e92283894f8e', 'per_service', NULL, 'per_period', 30, 'test', false)
ON CONFLICT (property_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.portal_billing_period_bounds(p_property uuid, p_asof date)
RETURNS daterange LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE s public.portal_billing_settings%ROWTYPE; v_start date; v_periods integer;
BEGIN
  SELECT * INTO s FROM public.portal_billing_settings WHERE property_id = p_property;
  IF NOT FOUND OR s.billing_mode <> 'cadence' THEN RETURN NULL; END IF;

  IF s.cadence = 'monthly' THEN
    RETURN daterange(DATE_TRUNC('month', p_asof)::date,
                     (DATE_TRUNC('month', p_asof) + INTERVAL '1 month')::date, '[)');
  ELSIF s.cadence = 'quarterly' THEN
    RETURN daterange(DATE_TRUNC('quarter', p_asof)::date,
                     (DATE_TRUNC('quarter', p_asof) + INTERVAL '3 months')::date, '[)');
  ELSIF s.cadence = '4_weeks' THEN
    IF s.cadence_anchor IS NULL THEN
      RAISE EXCEPTION
        'Property % is billed every 4 weeks but has no cadence_anchor. Set the first period start before invoicing.',
        p_property;
    END IF;
    v_periods := FLOOR((p_asof - s.cadence_anchor) / 28.0);
    v_start   := s.cadence_anchor + (v_periods * 28);
    RETURN daterange(v_start, v_start + 28, '[)');
  END IF;

  RETURN NULL;
END $$;

-- -------------------------------------------------- edit unlock + revisions --
ALTER TABLE public.portal_invoices
  ADD COLUMN IF NOT EXISTS edit_unlocked_until timestamptz,
  ADD COLUMN IF NOT EXISTS edit_unlocked_by    text,
  ADD COLUMN IF NOT EXISTS revision            integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS reference_numbers   jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.portal_invoice_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.portal_invoices(id) ON DELETE CASCADE,
  revision    integer NOT NULL,
  snapshot    jsonb NOT NULL,
  changed_by  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_invoice_revisions_invoice_idx
  ON public.portal_invoice_revisions (invoice_id, revision DESC);

CREATE OR REPLACE FUNCTION public.portal_invoice_snapshot(p_invoice uuid, p_actor text)
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
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

CREATE OR REPLACE FUNCTION public.portal_invoices_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS portal_invoices_guard_trg ON public.portal_invoices;
CREATE TRIGGER portal_invoices_guard_trg
  BEFORE UPDATE ON public.portal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.portal_invoices_guard();

CREATE OR REPLACE FUNCTION public.portal_invoice_lines_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
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

DROP TRIGGER IF EXISTS portal_invoice_lines_guard_trg ON public.portal_invoice_lines;
CREATE TRIGGER portal_invoice_lines_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.portal_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.portal_invoice_lines_guard();

CREATE OR REPLACE FUNCTION public.portal_invoice_unlock(
  p_invoice uuid,
  p_actor   text DEFAULT 'admin',
  p_minutes integer DEFAULT 20
) RETURNS timestamptz LANGUAGE plpgsql SET search_path = public AS $$
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
RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.portal_invoices SET edit_unlocked_until = NULL WHERE id = p_invoice;
  INSERT INTO public.portal_invoice_events (invoice_id, event, actor)
  VALUES (p_invoice, 'relocked', p_actor);
END $$;

-- ------------------------------------------------------- billing contact ----
ALTER TABLE public.portal_billing_settings
  ADD COLUMN IF NOT EXISTS billing_contact_name  text,
  ADD COLUMN IF NOT EXISTS billing_contact_email text,
  ADD COLUMN IF NOT EXISTS crest_cc jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS test_recipients jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE OR REPLACE FUNCTION public.portal_invoice_mark_sent(
  p_invoice uuid,
  p_to      jsonb,
  p_actor   text DEFAULT 'admin'
) RETURNS void LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  UPDATE public.portal_invoices
     SET status  = CASE WHEN status IN ('draft','ready') THEN 'sent' ELSE status END,
         sent_at = COALESCE(sent_at, now()),
         sent_to = p_to,
         send_error = NULL
   WHERE id = p_invoice;

  UPDATE public.portal_services s
     SET invoiced_at = COALESCE(s.invoiced_at, now())
   WHERE s.id IN (
     SELECT l.service_id FROM public.portal_invoice_lines l
      WHERE l.invoice_id = p_invoice AND l.service_id IS NOT NULL
   );

  INSERT INTO public.portal_invoice_events (invoice_id, event, actor, detail)
  VALUES (p_invoice, 'sent', p_actor, jsonb_build_object('to', p_to));
END $$;

-- ------------------------------------------------------------- invoice kind --
ALTER TABLE public.portal_invoices
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'cadence'
    CHECK (kind IN ('cadence','one_time'));

UPDATE public.portal_invoices SET kind = 'one_time'
 WHERE period_start IS NULL AND kind = 'cadence';

CREATE UNIQUE INDEX IF NOT EXISTS portal_invoices_open_period_idx
  ON public.portal_invoices (property_id, period_start, period_end)
  WHERE status IN ('draft','ready') AND period_start IS NOT NULL AND kind = 'cadence';

-- ------------------------------------------------------------------ grants --
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_billing_settings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_invoices TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_invoice_lines TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_invoice_payments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_invoice_events TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_invoice_sends TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portal_invoice_revisions TO anon, authenticated;
GRANT SELECT ON public.portal_front_desk_billing_tasks TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.portal_invoice_number_seq TO anon, authenticated;
GRANT ALL ON public.portal_billing_settings TO service_role;
GRANT ALL ON public.portal_invoices TO service_role;
GRANT ALL ON public.portal_invoice_lines TO service_role;
GRANT ALL ON public.portal_invoice_payments TO service_role;
GRANT ALL ON public.portal_invoice_events TO service_role;
GRANT ALL ON public.portal_invoice_sends TO service_role;
GRANT ALL ON public.portal_invoice_revisions TO service_role;
GRANT ALL ON SEQUENCE public.portal_invoice_number_seq TO service_role;

ALTER TABLE public.portal_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoice_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoice_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoice_sends    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoice_revisions ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['portal_billing_settings','portal_invoices','portal_invoice_lines',
                           'portal_invoice_payments','portal_invoice_events','portal_invoice_sends',
                           'portal_invoice_revisions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_all ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_all ON public.%I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;