CREATE TABLE public.team_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_type TEXT NOT NULL DEFAULT 'meal_period_waiver',
  employee_name TEXT NOT NULL,
  job_title TEXT,
  work_location TEXT,
  form_date DATE,
  employee_signature TEXT,
  employee_printed_name TEXT,
  employee_signed_date DATE,
  representative_name TEXT,
  representative_title TEXT,
  representative_signature TEXT,
  representative_signed_date DATE,
  form_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.team_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view team documents"
ON public.team_documents FOR SELECT
TO public
USING (true);

CREATE POLICY "Anyone can insert team documents"
ON public.team_documents FOR INSERT
TO public
WITH CHECK (true);

CREATE TRIGGER update_team_documents_updated_at
BEFORE UPDATE ON public.team_documents
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();