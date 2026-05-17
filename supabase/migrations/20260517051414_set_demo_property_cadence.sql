update portal_properties
set customer_preferences = jsonb_set(coalesce(customer_preferences,'{}'::jsonb), '{service_frequency}', '"weekly"')
where id in ('ac0fb4bb-d1bc-411a-b79d-a9a04ffe65ae','04d41555-4a02-4610-8e24-87f7f0ca5d2a');

update portal_properties
set customer_preferences = jsonb_set(coalesce(customer_preferences,'{}'::jsonb), '{service_frequency}', '"bi-weekly"')
where id in ('d551e949-e451-4e67-b6a7-3676c44d3cb0','418bfa09-8279-408a-b80e-f7fd4661de88');
