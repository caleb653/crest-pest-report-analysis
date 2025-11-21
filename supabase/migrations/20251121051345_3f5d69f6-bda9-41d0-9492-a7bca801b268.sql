-- Allow public report creation while protecting existing data
DROP POLICY IF EXISTS "Authenticated users can insert their own reports" ON public.reports;

-- Allow anyone to insert reports (for technician workflow)
CREATE POLICY "Anyone can insert reports"
ON public.reports
FOR INSERT
TO public
WITH CHECK (true);

-- But only authenticated users or the creator can update
DROP POLICY IF EXISTS "Users can update their own reports" ON public.reports;

CREATE POLICY "Users can update their own reports"
ON public.reports
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by);

-- Keep admin policies and view policies as is