-- Drop the existing restrictive insert policy
DROP POLICY IF EXISTS "Authenticated users can insert reports" ON public.reports;

-- Create a new PERMISSIVE insert policy that allows anyone to insert (for technicians who may not be logged in)
CREATE POLICY "Anyone can insert reports" 
ON public.reports 
FOR INSERT 
WITH CHECK (true);