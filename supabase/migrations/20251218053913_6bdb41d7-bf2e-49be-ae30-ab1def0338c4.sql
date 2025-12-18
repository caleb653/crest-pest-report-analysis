-- Remove overly permissive policies that allow anyone to modify reports
DROP POLICY IF EXISTS "Anyone can insert reports" ON public.reports;
DROP POLICY IF EXISTS "Anyone can update reports" ON public.reports;

-- Create authenticated-only INSERT policy
-- Technicians can create reports and the system tracks who created them
CREATE POLICY "Authenticated users can insert reports" 
ON public.reports 
FOR INSERT 
TO authenticated
WITH CHECK (true);

-- Create authenticated-only UPDATE policy for own reports
-- Users can only update reports they created
CREATE POLICY "Users can update their own reports new" 
ON public.reports 
FOR UPDATE 
TO authenticated
USING (auth.uid() = created_by)
WITH CHECK (auth.uid() = created_by);

-- Drop duplicate policy if exists (from previous migration)
DROP POLICY IF EXISTS "Users can update their own reports" ON public.reports;