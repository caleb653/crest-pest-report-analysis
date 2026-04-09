
-- Portal clients (top-level customers)
CREATE TABLE public.portal_clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal clients" ON public.portal_clients FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal clients" ON public.portal_clients FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal clients" ON public.portal_clients FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal clients" ON public.portal_clients FOR DELETE USING (true);

CREATE TRIGGER update_portal_clients_updated_at
  BEFORE UPDATE ON public.portal_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Portal properties
CREATE TABLE public.portal_properties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.portal_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_properties ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal properties" ON public.portal_properties FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal properties" ON public.portal_properties FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal properties" ON public.portal_properties FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal properties" ON public.portal_properties FOR DELETE USING (true);

CREATE TRIGGER update_portal_properties_updated_at
  BEFORE UPDATE ON public.portal_properties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Portal access links
CREATE TABLE public.portal_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID NOT NULL REFERENCES public.portal_clients(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  link_type TEXT NOT NULL DEFAULT 'sub' CHECK (link_type IN ('master', 'sub')),
  label TEXT,
  assigned_property_ids JSONB DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal links" ON public.portal_links FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal links" ON public.portal_links FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal links" ON public.portal_links FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal links" ON public.portal_links FOR DELETE USING (true);

CREATE TRIGGER update_portal_links_updated_at
  BEFORE UPDATE ON public.portal_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Portal services (past and future)
CREATE TABLE public.portal_services (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL REFERENCES public.portal_properties(id) ON DELETE CASCADE,
  service_date DATE,
  service_time TEXT,
  service_type TEXT NOT NULL,
  technician TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',
  summary TEXT,
  findings TEXT,
  notes TEXT,
  products_used JSONB DEFAULT '[]'::jsonb,
  photos JSONB DEFAULT '[]'::jsonb,
  follow_up_recommended BOOLEAN DEFAULT false,
  follow_up_notes TEXT,
  scheduling_status TEXT DEFAULT 'confirmed',
  prep_required BOOLEAN DEFAULT false,
  prep_notes TEXT,
  units_planned JSONB DEFAULT '[]'::jsonb,
  unit_details JSONB DEFAULT '[]'::jsonb,
  special_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal services" ON public.portal_services FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal services" ON public.portal_services FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal services" ON public.portal_services FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal services" ON public.portal_services FOR DELETE USING (true);

CREATE TRIGGER update_portal_services_updated_at
  BEFORE UPDATE ON public.portal_services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Portal prep sheets
CREATE TABLE public.portal_prep_sheets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  treatment_type TEXT NOT NULL,
  file_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_prep_sheets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal prep sheets" ON public.portal_prep_sheets FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal prep sheets" ON public.portal_prep_sheets FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal prep sheets" ON public.portal_prep_sheets FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal prep sheets" ON public.portal_prep_sheets FOR DELETE USING (true);

CREATE TRIGGER update_portal_prep_sheets_updated_at
  BEFORE UPDATE ON public.portal_prep_sheets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Portal messages
CREATE TABLE public.portal_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  link_id UUID REFERENCES public.portal_links(id) ON DELETE SET NULL,
  sender_name TEXT NOT NULL,
  sender_email TEXT,
  property_name TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  related_service_date DATE,
  related_unit TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal messages" ON public.portal_messages FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal messages" ON public.portal_messages FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal messages" ON public.portal_messages FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal messages" ON public.portal_messages FOR DELETE USING (true);
