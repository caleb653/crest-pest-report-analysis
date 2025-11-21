-- Allow anyone using the app to update existing reports
CREATE POLICY "Anyone can update reports"
ON public.reports
FOR UPDATE
USING (true)
WITH CHECK (true);