-- Allow public viewing of reports for admin dashboard
DROP POLICY IF EXISTS "Authenticated users can view reports" ON public.reports;

CREATE POLICY "Anyone can view reports"
ON public.reports
FOR SELECT
TO public
USING (true);