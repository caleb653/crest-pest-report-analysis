-- Portal billing: invoices assembled and sent from the Crest app, with the
-- units treated on every visit carried as line-level backup.
--
-- Design rules baked into the schema (not left to the UI):
--   * money is numeric(12,2) — never float, never cents-as-int surprises
--   * invoice numbers come from a sequence: no duplicates, no UI-side races
--   * a SENT invoice is immutable; corrections are a new revision or a credit
--   * invoice totals are recomputed by trigger from the lines, so the header
--     can never drift away from what the customer actually sees
--   * every state change is written to an audit table

-- ---------------------------------------------------------------- settings --
CREATE TABLE IF NOT EXISTS public.portal_billing_settings (
  property_id        uuid PRIMARY KEY REFERENCES public.portal_properties(id) ON DELETE CASCADE,

  -- 'per_service' = invoice each completed visit; 'cadence' = roll a period up
  billing_mode       text NOT NULL DEFAULT 'per_service'
                       CHECK (billing_mode IN ('per_service','cadence','manual')),

  -- cadence config (ignored when billing_mode <> 'cadence')
  cadence            text CHECK (cadence IN ('4_weeks','monthly','quarterly')),
  cadence_anchor     date,                  -- first period start, drives 4-week math
  send_days          integer[],             -- monthly/quarterly: days of month to send on
  send_dates         date[],                -- explicit override dates, always honoured

  -- 'test'  = every send goes ONLY to the internal test recipients, subject
  --           prefixed [TEST], customer never receives it. This is the default
  --           and a property stays here until Caleb flips it by hand.
  -- 'live'  = the invoice_to / invoice_cc recipients receive it.
  send_mode          text NOT NULL DEFAULT 'test' CHECK (send_mode IN ('test','live')),

  -- Every send is a human clicking Send. auto_send is stored but NOT yet acted
  -- on by anything: no scheduler reads it. The cadence only decides when an
  -- invoice becomes DUE and shows up on the to-send list.
  auto_send          boolean NOT NULL DEFAULT false,

  -- Visit frequency and BILLING cadence are different things: a property can be
  -- serviced weekly and billed monthly. 'cadence' above is the billing rhythm.
  -- This says how to read the plan's base_service_price when building lines:
  --   per_visit  = charge it once for every completed visit in the period
  --   per_period = charge it once per invoice, however many visits happened
  base_price_basis   text NOT NULL DEFAULT 'per_period'
                       CHECK (base_price_basis IN ('per_visit','per_period')),

  payment_terms_days integer NOT NULL DEFAULT 30,
  tax_rate           numeric(7,5) NOT NULL DEFAULT 0,
  default_po_number  text,
  invoice_to         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{name,email}]
  invoice_cc         jsonb NOT NULL DEFAULT '[]'::jsonb,
  footer_note        text,

  next_send_date     date,                  -- computed; drives the "due to send" list only
  last_sent_period   daterange,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- invoices --
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

  -- FieldRoutes is NEVER written to from here. The invoice is built and sent by
  -- the Crest app; the front desk keys the matching numbers into FR so AR ties,
  -- then we reconcile against fieldroutes_stg.tickets and record the result.
  fieldroutes_status    text NOT NULL DEFAULT 'pending'
                          CHECK (fieldroutes_status IN ('pending','matched','mismatch','not_required')),
  fieldroutes_ticket_id text,          -- filled in once we find/confirm the FR ticket
  fieldroutes_matched_at timestamptz,
  fieldroutes_variance  numeric(12,2), -- app total minus FR ticket total, when they disagree
  front_desk_note       text,          -- what the office still needs to key into FR

  customer_note       text,     -- prints on the invoice
  internal_note       text,     -- never prints

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

-- One open draft per property+period: stops double-billing a 4-week window.
CREATE UNIQUE INDEX IF NOT EXISTS portal_invoices_open_period_idx
  ON public.portal_invoices (property_id, period_start, period_end)
  WHERE status IN ('draft','ready') AND period_start IS NOT NULL;

-- ------------------------------------------------------------------- lines --
CREATE TABLE IF NOT EXISTS public.portal_invoice_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    uuid NOT NULL REFERENCES public.portal_invoices(id) ON DELETE CASCADE,
  sort_order    integer NOT NULL DEFAULT 0,

  line_type     text NOT NULL DEFAULT 'custom'
                  CHECK (line_type IN ('base','units','ad_hoc','credit','discount','custom')),
  service_id    uuid REFERENCES public.portal_services(id) ON DELETE SET NULL,

  description   text NOT NULL,
  detail        text,                                    -- second line, e.g. "Units 104, 210, 318"
  service_date  date,
  quantity      numeric(12,3) NOT NULL DEFAULT 1,
  unit_price    numeric(12,2) NOT NULL DEFAULT 0,
  amount        numeric(12,2) GENERATED ALWAYS AS (ROUND(quantity * unit_price, 2)) STORED,
  taxable       boolean NOT NULL DEFAULT true,

  -- frozen copy of the treated units behind this line, so a later edit to the
  -- service can never change what an already-sent invoice claimed
  units_snapshot jsonb,

  -- Recurring service already exists in FieldRoutes as a subscription and bills
  -- itself, so the office has nothing to key for a 'base' line. Everything else
  -- -- added units, one-off services, credits -- has to be entered by hand so AR
  -- ties. NULL = use that default rule; set explicitly to override per line.
  fr_entry_required boolean,

  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS portal_invoice_lines_invoice_idx ON public.portal_invoice_lines (invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS portal_invoice_lines_service_idx ON public.portal_invoice_lines (service_id) WHERE service_id IS NOT NULL;

-- ---------------------------------------------------------------- payments --
CREATE TABLE IF NOT EXISTS public.portal_invoice_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     uuid NOT NULL REFERENCES public.portal_invoices(id) ON DELETE CASCADE,
  amount         numeric(12,2) NOT NULL,
  paid_on        date NOT NULL DEFAULT CURRENT_DATE,
  method         text,        -- 'fieldroutes','check','ach','card','credit'
  reference      text,        -- FR payment id / check number
  source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','fieldroutes_sync')),
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_invoice_payments_invoice_idx ON public.portal_invoice_payments (invoice_id);

-- ------------------------------------------------------------------- sends --
-- Every attempt to email an invoice, test or live. Test sends are expected to
-- happen several times before the real one, so they must NOT touch the invoice
-- status -- only a LIVE send does that.
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

-- Belt and braces against the duplicate Caleb is worried about: at most ONE
-- successful live send per invoice. A second one has to be an explicit resend
-- that voids and supersedes, not an accident.
CREATE UNIQUE INDEX IF NOT EXISTS portal_invoice_sends_one_live_idx
  ON public.portal_invoice_sends (invoice_id)
  WHERE mode = 'live' AND ok;

-- ------------------------------------------------------------------- audit --
CREATE TABLE IF NOT EXISTS public.portal_invoice_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  uuid NOT NULL REFERENCES public.portal_invoices(id) ON DELETE CASCADE,
  event       text NOT NULL,          -- created|edited|ready|sent|resent|paid|voided|pushed_to_fr
  actor       text,
  detail      jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS portal_invoice_events_invoice_idx ON public.portal_invoice_events (invoice_id, created_at DESC);

-- ------------------------------------------------- per-service billing type --
-- Ad-hoc / one-off visits need their own billing decision, and PMs asked to be
-- able to put a PO on an UPCOMING service before we ever invoice it.
ALTER TABLE public.portal_services
  ADD COLUMN IF NOT EXISTS billing_type   text
    CHECK (billing_type IN ('plan','billable','no_charge','warranty','quoted')),
  ADD COLUMN IF NOT EXISTS billing_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS po_number      text,
  ADD COLUMN IF NOT EXISTS invoiced_at    timestamptz;

COMMENT ON COLUMN public.portal_services.billing_type IS
  'plan = covered by the recurring plan; billable = charge billing_amount; no_charge/warranty = show on the invoice at $0; quoted = awaiting a price.';
COMMENT ON COLUMN public.portal_services.invoiced_at IS
  'Set when a line for this service lands on a SENT invoice — stops a visit being billed twice.';

CREATE INDEX IF NOT EXISTS portal_services_uninvoiced_idx
  ON public.portal_services (property_id, service_date)
  WHERE invoiced_at IS NULL AND status = 'completed';

-- ------------------------------------------------------- totals + immutability --
CREATE OR REPLACE FUNCTION public.portal_invoice_recalc(p_invoice uuid)
RETURNS void LANGUAGE plpgsql AS $$
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
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.portal_invoice_recalc(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS portal_invoice_lines_recalc ON public.portal_invoice_lines;
CREATE TRIGGER portal_invoice_lines_recalc
  AFTER INSERT OR UPDATE OR DELETE ON public.portal_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.portal_invoice_lines_touch();

-- A sent invoice is a document the customer is holding. Nothing may silently
-- change under it: only payment/status/void/FR-push fields stay writable.
CREATE OR REPLACE FUNCTION public.portal_invoices_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('sent','paid','partial','void') THEN
    IF NEW.subtotal     IS DISTINCT FROM OLD.subtotal
    OR NEW.total        IS DISTINCT FROM OLD.total
    OR NEW.tax_rate     IS DISTINCT FROM OLD.tax_rate
    OR NEW.tax_amount   IS DISTINCT FROM OLD.tax_amount
    OR NEW.period_start IS DISTINCT FROM OLD.period_start
    OR NEW.period_end   IS DISTINCT FROM OLD.period_end
    OR NEW.issue_date   IS DISTINCT FROM OLD.issue_date
    OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
    OR NEW.property_id  IS DISTINCT FROM OLD.property_id THEN
      RAISE EXCEPTION
        'Invoice % is % and cannot be edited. Void it and issue a revision, or add a credit line to a new invoice.',
        OLD.invoice_number, OLD.status;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS portal_invoices_guard_trg ON public.portal_invoices;
CREATE TRIGGER portal_invoices_guard_trg
  BEFORE UPDATE ON public.portal_invoices
  FOR EACH ROW EXECUTE FUNCTION public.portal_invoices_guard();

-- Lines of a sent invoice are frozen too.
CREATE OR REPLACE FUNCTION public.portal_invoice_lines_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.portal_invoices
   WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_status IN ('sent','paid','partial','void') THEN
    RAISE EXCEPTION 'Cannot change lines on a % invoice.', v_status;
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS portal_invoice_lines_guard_trg ON public.portal_invoice_lines;
CREATE TRIGGER portal_invoice_lines_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.portal_invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.portal_invoice_lines_guard();

-- Payments roll up into amount_paid / status automatically.
CREATE OR REPLACE FUNCTION public.portal_invoice_payments_apply()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_id uuid; v_paid numeric(12,2); v_total numeric(12,2); v_status text;
BEGIN
  v_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT COALESCE(SUM(amount),0) INTO v_paid FROM public.portal_invoice_payments WHERE invoice_id = v_id;
  SELECT total, status INTO v_total, v_status FROM public.portal_invoices WHERE id = v_id;

  UPDATE public.portal_invoices
     SET amount_paid = v_paid,
         status = CASE
           WHEN v_status = 'void' THEN 'void'
           -- payments removed: fall back to where the invoice was before, never
           -- leave it stuck on 'paid' after an admin un-marks it
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

-- ------------------------------------------------------------------- RLS --
ALTER TABLE public.portal_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoices         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoice_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoice_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portal_invoice_sends    ENABLE ROW LEVEL SECURITY;

-- Matches the open-RLS convention the rest of the portal tables use today;
-- tighten alongside them when portal auth is tightened.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['portal_billing_settings','portal_invoices','portal_invoice_lines',
                           'portal_invoice_payments','portal_invoice_events','portal_invoice_sends'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I_all ON public.%I', t, t);
    EXECUTE format('CREATE POLICY %I_all ON public.%I FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;

-- -------------------------------------------------------- invoice numbering --
-- Numbers come from the sequence, formatted CR-<year>-<n>. Generated in the DB
-- so two people clicking "Create invoice" at once can never collide.
CREATE OR REPLACE FUNCTION public.portal_next_invoice_number()
RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT 'CR-' || TO_CHAR(CURRENT_DATE,'YYYY') || '-' ||
         LPAD(nextval('public.portal_invoice_number_seq')::text, 5, '0');
$$;

ALTER TABLE public.portal_invoices
  ALTER COLUMN invoice_number SET DEFAULT public.portal_next_invoice_number();

-- Changing the tax rate on a draft must re-run the tax maths.
CREATE OR REPLACE FUNCTION public.portal_invoices_tax_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
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

-- Due date follows the property's payment terms unless set by hand.
CREATE OR REPLACE FUNCTION public.portal_invoices_due_default()
RETURNS trigger LANGUAGE plpgsql AS $$
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

-- ------------------------------------------------------- front desk to-do --
-- The one job FieldRoutes still has in this flow: carry the same numbers we
-- billed, so AR ties. Nothing writes to FR automatically -- this view is the
-- office's checklist of what to key in by hand.
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

  -- What the office actually has to key in: everything FieldRoutes does not
  -- already bill itself. Recurring 'base' lines are excluded -- those come from
  -- the FR subscription and should already tie.
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

COMMENT ON VIEW public.portal_front_desk_billing_tasks IS
  'Invoices the Crest app has sent that FieldRoutes has not been updated to match yet. Office keys these in; nothing here writes to FieldRoutes.';


-- --------------------------------------------------- admin: mark paid/unpaid --
-- The admin side just needs a toggle. Marking paid records a real payment for
-- the outstanding balance (so the audit trail and amount_paid stay honest);
-- un-marking removes only the manually recorded payments, never anything that
-- came from a FieldRoutes sync.
CREATE OR REPLACE FUNCTION public.portal_invoice_set_paid(
  p_invoice   uuid,
  p_paid      boolean,
  p_actor     text DEFAULT NULL,
  p_method    text DEFAULT 'manual',
  p_reference text DEFAULT NULL,
  p_paid_on   date DEFAULT NULL
) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_total numeric(12,2); v_paid numeric(12,2); v_status text;
BEGIN
  SELECT total, amount_paid, status INTO v_total, v_paid, v_status
    FROM public.portal_invoices WHERE id = p_invoice FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice % not found', p_invoice; END IF;
  IF v_status = 'void' THEN RAISE EXCEPTION 'Invoice is void; it cannot be marked paid.'; END IF;

  IF p_paid THEN
    IF v_total - v_paid <= 0 THEN RETURN v_status; END IF;   -- already settled, no-op
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

COMMENT ON FUNCTION public.portal_invoice_set_paid IS
  'Admin paid/unpaid toggle. Payments synced from FieldRoutes (source=fieldroutes_sync) are never removed by un-marking.';
