
-- Drop the restrictive SELECT policy and recreate as permissive
DROP POLICY IF EXISTS "Authenticated users can view reports" ON public.reports;

CREATE POLICY "Anyone can view reports"
  ON public.reports
  FOR SELECT
  USING (true);

-- Also fix the INSERT policy
DROP POLICY IF EXISTS "Anyone can insert reports" ON public.reports;

CREATE POLICY "Anyone can insert reports"
  ON public.reports
  FOR INSERT
  WITH CHECK (true);

-- Fix the general UPDATE policy
DROP POLICY IF EXISTS "Anyone can update reports" ON public.reports;

CREATE POLICY "Anyone can update reports"
  ON public.reports
  FOR UPDATE
  USING (true)
  WITH CHECK (true);
