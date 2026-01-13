-- Allow unauthenticated users to update reports (needed for technicians without login)
DROP POLICY IF EXISTS "Anyone can update reports" ON public.reports;
CREATE POLICY "Anyone can update reports"
ON public.reports
FOR UPDATE
TO public
USING (true)
WITH CHECK (true);