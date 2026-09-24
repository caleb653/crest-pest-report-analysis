-- Invoices are due upon receipt by default (Caleb, 2026-09-24).
--
-- Payment terms live per property in portal_billing_settings (days after the
-- issue date; 0 = upon receipt) and are stamped onto each invoice's due_date
-- at insert. Terms can then be changed per invoice from the invoice card.
-- Three things move together: the column default (new properties), the rows
-- still on the old 30 / 7-day defaults (existing properties), and the due
-- date on invoices nobody has been sent yet. Issued invoices keep the due
-- date the customer was given. Safe to run more than once.

ALTER TABLE public.portal_billing_settings
  ALTER COLUMN payment_terms_days SET DEFAULT 0;

UPDATE public.portal_billing_settings
   SET payment_terms_days = 0
 WHERE payment_terms_days IN (7, 30);

CREATE OR REPLACE FUNCTION public.portal_invoices_due_default()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_terms integer;
BEGIN
  IF NEW.due_date IS NULL THEN
    SELECT payment_terms_days INTO v_terms
      FROM public.portal_billing_settings WHERE property_id = NEW.property_id;
    NEW.due_date := NEW.issue_date + COALESCE(v_terms, 0);
  END IF;
  RETURN NEW;
END $$;

-- Drafts follow the new terms; anything already issued is left as sent.
UPDATE public.portal_invoices i
   SET due_date = i.issue_date + COALESCE(s.payment_terms_days, 0)
  FROM public.portal_billing_settings s
 WHERE s.property_id = i.property_id
   AND i.status IN ('draft', 'ready');
