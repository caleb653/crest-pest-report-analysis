-- Drop existing insecure public policies
DROP POLICY IF EXISTS "Anyone can view reports" ON public.reports;
DROP POLICY IF EXISTS "Anyone can insert reports" ON public.reports;
DROP POLICY IF EXISTS "Anyone can update reports" ON public.reports;
DROP POLICY IF EXISTS "Anyone can delete reports" ON public.reports;

-- Create secure policies requiring authentication
CREATE POLICY "Authenticated users can view reports"
ON public.reports
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert their own reports"
ON public.reports
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own reports"
ON public.reports
FOR UPDATE
TO authenticated
USING (auth.uid() = created_by);

CREATE POLICY "Admins can update any report"
ON public.reports
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete reports"
ON public.reports
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));