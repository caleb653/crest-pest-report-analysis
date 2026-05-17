
DELETE FROM portal_services
WHERE property_id IN (
  'd551e949-e451-4e67-b6a7-3676c44d3cb0',
  'ac0fb4bb-d1bc-411a-b79d-a9a04ffe65ae',
  '04d41555-4a02-4610-8e24-87f7f0ca5d2a',
  '418bfa09-8279-408a-b80e-f7fd4661de88'
) AND service_type = 'Follow-Up Visit';

DO $$
DECLARE
  prop_id UUID;
  gap_days INT;
  svc RECORD;
  followups JSONB;
BEGIN
  FOR prop_id, gap_days IN
    SELECT * FROM (VALUES
      ('418bfa09-8279-408a-b80e-f7fd4661de88'::uuid, 3),
      ('d551e949-e451-4e67-b6a7-3676c44d3cb0'::uuid, 5),
      ('04d41555-4a02-4610-8e24-87f7f0ca5d2a'::uuid, 6),
      ('ac0fb4bb-d1bc-411a-b79d-a9a04ffe65ae'::uuid, 8)
    ) v(pid, gd)
  LOOP
    FOR svc IN
      SELECT id, service_date, unit_details
      FROM portal_services
      WHERE property_id = prop_id
        AND status = 'completed'
        AND service_type <> 'Follow-Up Visit'
        AND service_date IS NOT NULL
      ORDER BY service_date
    LOOP
      SELECT jsonb_agg(
        jsonb_set(
          jsonb_set(
            jsonb_set(u, '{status}', '"Free and Clear"'::jsonb),
            '{follow_up_needed}', 'false'::jsonb
          ),
          '{notes}', '"Follow-up visit: targeted re-treatment, activity cleared."'::jsonb
        )
      )
      INTO followups
      FROM jsonb_array_elements(svc.unit_details) u
      WHERE COALESCE((u->>'follow_up_needed')::boolean, false) = true;

      IF followups IS NOT NULL AND jsonb_array_length(followups) > 0 THEN
        INSERT INTO portal_services (
          property_id, service_date, service_type, status, technician,
          summary, unit_details
        ) VALUES (
          prop_id,
          (svc.service_date + (gap_days || ' days')::interval)::date,
          'Follow-Up Visit',
          'completed',
          'Crest Tech',
          'Targeted follow-up to clear remaining activity from prior visit',
          followups
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;
