
ALTER TABLE public.portal_messages 
ADD COLUMN sender_type text NOT NULL DEFAULT 'client',
ADD COLUMN client_id uuid REFERENCES public.portal_clients(id) ON DELETE CASCADE;
