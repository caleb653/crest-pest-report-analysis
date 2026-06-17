-- Enforce one upcoming (scheduled) visit per property by deleting duplicates.
-- Keep the visit with the earliest service_date (NULLs last), then earliest created_at.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY property_id
           ORDER BY service_date ASC NULLS LAST, created_at ASC
         ) AS rn
  FROM public.portal_services
  WHERE status = 'scheduled'
)
DELETE FROM public.portal_services
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);