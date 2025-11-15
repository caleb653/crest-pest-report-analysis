-- Update RLS policies for reports table to be simpler
-- Drop the existing admin-only policies
DROP POLICY IF EXISTS "Admins can view all reports" ON public.reports;
DROP POLICY IF EXISTS "Admins can update all reports" ON public.reports;

-- Create new policies that allow public read access for admin dashboard
-- (authentication is handled via session token in the app)
CREATE POLICY "Anyone can view reports"
ON public.reports
FOR SELECT
USING (true);

CREATE POLICY "Anyone can update reports"
ON public.reports
FOR UPDATE
USING (true);