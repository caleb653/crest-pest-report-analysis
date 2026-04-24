
INSERT INTO storage.buckets (id, name, public)
VALUES ('prep-sheets', 'prep-sheets', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='Public read access for prep-sheets'
  ) THEN
    CREATE POLICY "Public read access for prep-sheets"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'prep-sheets');
  END IF;
END $$;
