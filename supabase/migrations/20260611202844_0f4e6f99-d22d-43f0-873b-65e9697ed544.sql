WITH past AS (
  SELECT property_id, btrim(x) AS f
  FROM (
    SELECT property_id, jsonb_array_elements(COALESCE(unit_details, '[]'::jsonb))->>'findings' AS x
    FROM public.portal_services WHERE status = 'completed'
    UNION ALL
    SELECT property_id, findings FROM public.portal_services WHERE status = 'completed'
  ) t
  WHERE btrim(COALESCE(x, '')) <> ''
),
cleaned AS (
  SELECT s.id,
    jsonb_agg(
      CASE WHEN EXISTS (
        SELECT 1 FROM past p
        WHERE p.property_id = s.property_id
          AND p.f = btrim(COALESCE(e.r->>'findings', ''))
      ) THEN jsonb_set(e.r, '{findings}', '""'::jsonb) ELSE e.r END
      ORDER BY e.ord
    ) AS rows
  FROM public.portal_services s,
       LATERAL jsonb_array_elements(s.report_data->'completion_draft'->'unitRows') WITH ORDINALITY AS e(r, ord)
  WHERE s.status = 'scheduled'
    AND jsonb_typeof(s.report_data->'completion_draft'->'unitRows') = 'array'
  GROUP BY s.id
)
UPDATE public.portal_services s
SET report_data = jsonb_set(s.report_data, '{completion_draft,unitRows}', c.rows),
    findings = NULL
FROM cleaned c
WHERE s.id = c.id;