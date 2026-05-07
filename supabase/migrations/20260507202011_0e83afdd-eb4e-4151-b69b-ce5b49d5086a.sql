CREATE TABLE public.regional_managers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  property_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.regional_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view regional managers" ON public.regional_managers FOR SELECT USING (true);
CREATE POLICY "Anyone can insert regional managers" ON public.regional_managers FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update regional managers" ON public.regional_managers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete regional managers" ON public.regional_managers FOR DELETE USING (true);

CREATE TRIGGER update_regional_managers_updated_at
BEFORE UPDATE ON public.regional_managers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();