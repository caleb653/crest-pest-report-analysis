DELETE FROM reports
WHERE technician_name='Unassigned'
  AND notes LIKE 'Auto-created from FieldRoutes%'
  AND notes NOT LIKE '%(real-time webhook).%'
  AND customer_signature IS NULL
  AND sent_to_customer_at IS NULL;

DELETE FROM reports WHERE fieldroutes_appointment_id='99999';