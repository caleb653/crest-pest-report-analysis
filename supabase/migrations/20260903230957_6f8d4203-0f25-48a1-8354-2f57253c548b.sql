CREATE TABLE IF NOT EXISTS public.competitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot        int  NOT NULL UNIQUE CHECK (slot IN (1, 2)),
  name        text NOT NULL DEFAULT 'Competition',
  is_sales    boolean NOT NULL DEFAULT false,
  entries     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.competitions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.competitions TO authenticated;
GRANT ALL ON public.competitions TO service_role;

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view competitions" ON public.competitions;
DROP POLICY IF EXISTS "Anyone can update competitions" ON public.competitions;
DROP POLICY IF EXISTS "Anyone can insert competitions" ON public.competitions;
CREATE POLICY "Anyone can view competitions"   ON public.competitions FOR SELECT USING (true);
CREATE POLICY "Anyone can update competitions" ON public.competitions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can insert competitions" ON public.competitions FOR INSERT WITH CHECK (true);

DROP TRIGGER IF EXISTS update_competitions_updated_at ON public.competitions;
CREATE TRIGGER update_competitions_updated_at
  BEFORE UPDATE ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.competitions (slot, name, is_sales)
VALUES (1, 'Team Competition', false), (2, 'Sales Competition', true)
ON CONFLICT (slot) DO NOTHING;