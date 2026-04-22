-- Add appointment-level service outcome to portal_services
ALTER TABLE public.portal_services
  ADD COLUMN IF NOT EXISTS appointment_service text;

-- Surveys: one per property/campaign
CREATE TABLE IF NOT EXISTS public.portal_surveys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL,
  client_id uuid,
  title text NOT NULL DEFAULT 'Pest Activity Survey',
  intro text,
  questions jsonb NOT NULL DEFAULT '[]'::jsonb,
  recipient_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  sent_count integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_surveys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal surveys"
  ON public.portal_surveys FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal surveys"
  ON public.portal_surveys FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal surveys"
  ON public.portal_surveys FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal surveys"
  ON public.portal_surveys FOR DELETE USING (true);

CREATE TRIGGER set_portal_surveys_updated_at
  BEFORE UPDATE ON public.portal_surveys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_portal_surveys_property
  ON public.portal_surveys(property_id);

-- Survey responses: one row per tenant submission
CREATE TABLE IF NOT EXISTS public.portal_survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  survey_id uuid NOT NULL REFERENCES public.portal_surveys(id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  token text NOT NULL UNIQUE DEFAULT encode(extensions.gen_random_bytes(24), 'hex'),
  recipient_email text,
  respondent_name text,
  unit_number text,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.portal_survey_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view portal survey responses"
  ON public.portal_survey_responses FOR SELECT USING (true);
CREATE POLICY "Anyone can insert portal survey responses"
  ON public.portal_survey_responses FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update portal survey responses"
  ON public.portal_survey_responses FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete portal survey responses"
  ON public.portal_survey_responses FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_portal_survey_responses_survey
  ON public.portal_survey_responses(survey_id);
CREATE INDEX IF NOT EXISTS idx_portal_survey_responses_property
  ON public.portal_survey_responses(property_id);
CREATE INDEX IF NOT EXISTS idx_portal_survey_responses_token
  ON public.portal_survey_responses(token);