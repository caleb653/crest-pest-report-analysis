-- Invoices are due one week after issue, not 30 days (Caleb, 2026-09-24).
--
-- Payment terms live per property in portal_billing_settings and are stamped
-- onto each invoice's due_date at insert. Three things have to move together:
-- the column default (new properties), the rows already at 30 (existing
-- properties), and the due date on invoices nobody has been sent yet.
-- Issued invoices keep the due date the customer was given.

ALTER TABLE public.portal_billing_settings
  ALTER COLUMN payment_terms_days SET DEFAULT 7;

UPDATE public.portal_billing_settings
   SET payment_terms_days = 7
 WHERE payment_terms_days = 30;

CREATE OR REPLACE FUNCTION public.portal_invoices_due_default()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_terms integer;
BEGIN
  IF NEW.due_date IS NULL THEN
    SELECT payment_terms_days INTO v_terms
      FROM public.portal_billing_settings WHERE property_id = NEW.property_id;
    NEW.due_date := NEW.issue_date + COALESCE(v_terms, 7);
  END IF;
  RETURN NEW;
END $$;

-- Drafts follow the new terms; anything already issued is left as sent.
UPDATE public.portal_invoices i
   SET due_date = i.issue_date + COALESCE(s.payment_terms_days, 7)
  FROM public.portal_billing_settings s
 WHERE s.property_id = i.property_id
   AND i.status IN ('draft', 'ready');
