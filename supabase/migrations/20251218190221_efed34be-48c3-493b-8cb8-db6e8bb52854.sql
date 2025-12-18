-- Add explicit deny-all policy to admin_sessions to satisfy RLS linter and prevent any client access
DO $$
BEGIN
  -- Ensure RLS is enabled
  EXECUTE 'ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN
  -- ignore if cannot enable / already enabled
  NULL;
END $$;

DROP POLICY IF EXISTS "No client access to admin sessions" ON public.admin_sessions;

CREATE POLICY "No client access to admin sessions"
ON public.admin_sessions
FOR ALL
USING (false)
WITH CHECK (false);
