-- Enable realtime so the admin portal and PM portal can stay in sync.
-- Without this, changes one side makes (work orders, planned units, deletions)
-- only show up on the other side after a manual refresh — which causes the
-- two portals to disagree about what units will be treated.
ALTER TABLE public.portal_services REPLICA IDENTITY FULL;
ALTER TABLE public.portal_requests REPLICA IDENTITY FULL;
ALTER TABLE public.portal_properties REPLICA IDENTITY FULL;

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_services;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_requests;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.portal_properties;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;