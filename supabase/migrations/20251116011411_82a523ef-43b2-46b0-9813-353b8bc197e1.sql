-- Add DELETE policy for reports table
CREATE POLICY "Anyone can delete reports" 
ON public.reports 
FOR DELETE 
USING (true);