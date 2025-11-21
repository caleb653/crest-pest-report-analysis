-- Permanently protect reports from deletion
DROP POLICY IF EXISTS "Admins can delete reports" ON public.reports;

-- No delete policy means no one can delete reports, protecting data permanently