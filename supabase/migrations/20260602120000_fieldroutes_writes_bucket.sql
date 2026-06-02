-- Private Storage bucket for FieldRoutes document writes.
--
-- When a completed report's PDF is queued to upload back to FieldRoutes, the
-- bytes are stored here (NOT in the fieldroutes_write_queue row, which is shown
-- as JSON in the approval UI and listed in bulk — a base64 PDF there would bloat
-- every list call). The queue row holds only the storage path; the
-- fieldroutes-queue-decide function downloads the file at approve-time, base64s
-- it, and forwards it to Cloud Run /api/fr/document.
--
-- Private (public = false) and no RLS policies: only the edge functions touch it,
-- and they use the service-role key, which bypasses Storage RLS. The browser
-- never reads/writes this bucket directly.

INSERT INTO storage.buckets (id, name, public)
VALUES ('fieldroutes-writes', 'fieldroutes-writes', false)
ON CONFLICT (id) DO NOTHING;
