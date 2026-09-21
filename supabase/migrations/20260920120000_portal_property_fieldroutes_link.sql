-- Link every portal property to its FieldRoutes customer.
--
-- Why: billing, the units-treated invoice backup and the FR ticket/AR cross-check
-- all need a property -> FR customer join key. `portal_clients` already carries a
-- fieldroutes_customer_id, but a client owns many properties and FieldRoutes bills
-- per property, so the id has to live on the property row.

ALTER TABLE public.portal_properties
  ADD COLUMN IF NOT EXISTS fieldroutes_customer_id text;

COMMENT ON COLUMN public.portal_properties.fieldroutes_customer_id IS
  'FieldRoutes customerID for this property (FR bills per property, not per client).';

CREATE INDEX IF NOT EXISTS portal_properties_fieldroutes_customer_id_idx
  ON public.portal_properties (fieldroutes_customer_id)
  WHERE fieldroutes_customer_id IS NOT NULL;

-- Seed: apartment/HOA properties matched against fieldroutes_stg.customers_stg
-- by company name + street address (2026-09-20). Active FR accounts only.
UPDATE public.portal_properties SET fieldroutes_customer_id = '13590'
  WHERE id = '19a6f301-2a0c-4b9f-bbf2-8e8b8d13e59e' AND fieldroutes_customer_id IS NULL; -- El Sereno Apartments
UPDATE public.portal_properties SET fieldroutes_customer_id = '12649'
  WHERE id = '96e29290-7c56-4e0c-8682-01d1c3fed455' AND fieldroutes_customer_id IS NULL; -- Huntington Cove Apts
UPDATE public.portal_properties SET fieldroutes_customer_id = '12753'
  WHERE id = 'be5b0116-ecb4-4db9-80cd-ae0c0722f7d1' AND fieldroutes_customer_id IS NULL; -- Stonebrook Apartment Homes
UPDATE public.portal_properties SET fieldroutes_customer_id = '13670'
  WHERE id = 'ddb53bfb-694b-41c9-a837-e92283894f8e' AND fieldroutes_customer_id IS NULL; -- Villa Capri
