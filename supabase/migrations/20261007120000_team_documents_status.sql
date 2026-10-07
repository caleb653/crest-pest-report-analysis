-- Signature Sheets: pre-made (pending) sheets that get signed later.
ALTER TABLE public.team_documents
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'signed';

CREATE INDEX IF NOT EXISTS team_documents_status_idx ON public.team_documents (status, created_at DESC);

DROP POLICY IF EXISTS "Anyone can update team documents" ON public.team_documents;
CREATE POLICY "Anyone can update team documents"
ON public.team_documents FOR UPDATE
TO public
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can delete pending team documents" ON public.team_documents;
CREATE POLICY "Anyone can delete pending team documents"
ON public.team_documents FOR DELETE
TO public
USING (status = 'pending');
