WITH cleaned AS (
  SELECT s.id,
    jsonb_agg(jsonb_set(e.r, '{findings}', '""'::jsonb) ORDER BY e.ord) AS rows
  FROM public.portal_services s,
       LATERAL jsonb_array_elements(s.report_data->'completion_draft'->'unitRows') WITH ORDINALITY AS e(r, ord)
  WHERE s.status = 'scheduled'
    AND jsonb_typeof(s.report_data->'completion_draft'->'unitRows') = 'array'
  GROUP BY s.id
)
UPDATE public.portal_services s
SET report_data = jsonb_set(s.report_data, '{completion_draft,unitRows}', c.rows)
FROM cleaned c
WHERE s.id = c.id;