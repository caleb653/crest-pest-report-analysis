-- Company competitions board (Caleb 2026-08-01): two competition slots shown
-- on the home-tile page. Slot 2 is the SALES competition — each person's
-- score is the list of sale names (score = count). Editing (names + scores)
-- is gated in the app by the shared password; data itself follows the app's
-- open-RLS pattern (PIN gate + password protect the UI).

CREATE TABLE IF NOT EXISTS public.competitions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot        int  NOT NULL UNIQUE CHECK (slot IN (1, 2)),
  name        text NOT NULL DEFAULT 'Competition',
  is_sales    boolean NOT NULL DEFAULT false,
  -- { "<Full Name>": { "score": 3, "sales": ["Smith residence", ...] } }
  entries     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view competitions"   ON public.competitions FOR SELECT USING (true);
CREATE POLICY "Anyone can update competitions" ON public.competitions FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can insert competitions" ON public.competitions FOR INSERT WITH CHECK (true);

CREATE TRIGGER update_competitions_updated_at
  BEFORE UPDATE ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.competitions (slot, name, is_sales)
VALUES (1, 'Team Competition', false), (2, 'Sales Competition', true)
ON CONFLICT (slot) DO NOTHING;
