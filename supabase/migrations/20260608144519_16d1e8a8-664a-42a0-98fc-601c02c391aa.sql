DROP FUNCTION public.list_reports_summary();

CREATE OR REPLACE FUNCTION public.list_reports_summary()
 RETURNS TABLE(id uuid, technician_name text, customer_name text, address text, created_at timestamp with time zone, next_steps jsonb, services jsonb, sent_to_customer_at timestamp with time zone, has_signature boolean, notes_head text, report_format text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    r.id,
    r.technician_name,
    r.customer_name,
    r.address,
    r.created_at,
    r.next_steps,
    r.services,
    r.sent_to_customer_at,
    (r.customer_signature IS NOT NULL AND length(r.customer_signature) > 0) AS has_signature,
    LEFT(coalesce(r.notes, ''), 2000) AS notes_head,
    NULLIF(r.customer_preferences->>'reportFormat', '') AS report_format
  FROM public.reports r
  ORDER BY r.created_at DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.list_reports_summary() TO anon, authenticated, service_role;