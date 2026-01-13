-- Drop the existing restrictive insert policy
DROP POLICY IF EXISTS "Anyone can insert reports" ON public.reports;

-- Create a new permissive insert policy that actually allows inserts
CREATE POLICY "Anyone can insert reports"
ON public.reports
FOR INSERT
TO public
WITH CHECK (true);