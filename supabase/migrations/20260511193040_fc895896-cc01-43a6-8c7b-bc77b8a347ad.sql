-- Create portal_documents table for property-scoped document uploads
CREATE TABLE public.portal_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_type TEXT,
  category TEXT DEFAULT 'general',
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_portal_documents_property_id ON public.portal_documents(property_id);

ALTER TABLE public.portal_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal documents" ON public.portal_documents FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal documents" ON public.portal_documents FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal documents" ON public.portal_documents FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal documents" ON public.portal_documents FOR DELETE USING (true);

CREATE TRIGGER update_portal_documents_updated_at
BEFORE UPDATE ON public.portal_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Storage bucket for documents
INSERT INTO storage.buckets (id, name, public) VALUES ('portal-documents', 'portal-documents', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read portal documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'portal-documents');

CREATE POLICY "Anyone can upload portal documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'portal-documents');

CREATE POLICY "Anyone can update portal documents storage"
ON storage.objects FOR UPDATE
USING (bucket_id = 'portal-documents');

CREATE POLICY "Anyone can delete portal documents storage"
ON storage.objects FOR DELETE
USING (bucket_id = 'portal-documents');