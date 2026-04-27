-- Quarterly Updates table
CREATE TABLE public.portal_quarterly_updates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID NOT NULL,
  title TEXT,
  comment TEXT,
  video_url TEXT,
  file_name TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_quarterly_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view quarterly updates"
  ON public.portal_quarterly_updates FOR SELECT USING (true);
CREATE POLICY "Anyone can insert quarterly updates"
  ON public.portal_quarterly_updates FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update quarterly updates"
  ON public.portal_quarterly_updates FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete quarterly updates"
  ON public.portal_quarterly_updates FOR DELETE USING (true);

CREATE TRIGGER update_portal_quarterly_updates_updated_at
  BEFORE UPDATE ON public.portal_quarterly_updates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_portal_quarterly_updates_property ON public.portal_quarterly_updates(property_id, created_at DESC);

-- Storage bucket for videos
INSERT INTO storage.buckets (id, name, public)
VALUES ('portal-videos', 'portal-videos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Anyone can view portal videos"
  ON storage.objects FOR SELECT USING (bucket_id = 'portal-videos');
CREATE POLICY "Anyone can upload portal videos"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'portal-videos');
CREATE POLICY "Anyone can update portal videos"
  ON storage.objects FOR UPDATE USING (bucket_id = 'portal-videos');
CREATE POLICY "Anyone can delete portal videos"
  ON storage.objects FOR DELETE USING (bucket_id = 'portal-videos');