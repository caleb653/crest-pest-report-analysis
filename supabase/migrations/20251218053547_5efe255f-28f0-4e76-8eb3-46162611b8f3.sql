-- Fix PUBLIC_DATA_EXPOSURE: Restrict reports SELECT to authenticated users only
-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Anyone can view reports" ON public.reports;

-- Create authenticated-only SELECT policy
CREATE POLICY "Authenticated users can view reports" 
ON public.reports 
FOR SELECT 
TO authenticated
USING (true);

-- Add DELETE policy for admins (missing from current setup)
CREATE POLICY "Admins can delete reports" 
ON public.reports 
FOR DELETE 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create admin_sessions table for proper server-side session validation
CREATE TABLE IF NOT EXISTS public.admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text NOT NULL UNIQUE,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  is_valid boolean DEFAULT true
);

-- Enable RLS on admin_sessions
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;

-- Only edge functions (service role) can manage sessions - no public access
-- No policies needed as service role bypasses RLS