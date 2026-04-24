
-- Add client owner column to properties
ALTER TABLE public.portal_properties
  ADD COLUMN IF NOT EXISTS owner_tech text;

-- In-app notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_username text,           -- e.g. "clopez", null = broadcast to all staff
  recipient_name text,               -- e.g. "Carmen Lopez" (denormalized for filtering by full name)
  title text NOT NULL,
  body text,
  link text,                         -- e.g. /portal-admin?property=<id>
  notification_type text NOT NULL DEFAULT 'work_order',  -- work_order | message | other
  related_property_id uuid,
  related_request_id uuid,
  related_message_id uuid,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_recipient_username_idx
  ON public.notifications (recipient_username, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_recipient_name_idx
  ON public.notifications (recipient_name, created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_unread_idx
  ON public.notifications (is_read, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view notifications"
  ON public.notifications FOR SELECT USING (true);
CREATE POLICY "Anyone can insert notifications"
  ON public.notifications FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update notifications"
  ON public.notifications FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Anyone can delete notifications"
  ON public.notifications FOR DELETE USING (true);
