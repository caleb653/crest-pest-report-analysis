
-- Create portal_requests table for tenant service requests
CREATE TABLE public.portal_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id uuid REFERENCES public.portal_links(id) ON DELETE CASCADE,
  property_id uuid REFERENCES public.portal_properties(id) ON DELETE CASCADE NOT NULL,
  unit_number text,
  request_type text NOT NULL DEFAULT 'service_request',
  description text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  response_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal requests" ON public.portal_requests FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal requests" ON public.portal_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal requests" ON public.portal_requests FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal requests" ON public.portal_requests FOR DELETE USING (true);

-- Add report_data column to portal_services for appointment reports
ALTER TABLE public.portal_services ADD COLUMN IF NOT EXISTS report_data jsonb DEFAULT NULL;

-- Add unit_number to portal_links for tenant links
ALTER TABLE public.portal_links ADD COLUMN IF NOT EXISTS unit_number text DEFAULT NULL;

-- Trigger for updated_at on portal_requests
CREATE TRIGGER update_portal_requests_updated_at
  BEFORE UPDATE ON public.portal_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
