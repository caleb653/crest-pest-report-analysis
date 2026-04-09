
ALTER TABLE public.portal_properties ADD COLUMN IF NOT EXISTS map_data jsonb DEFAULT NULL;
ALTER TABLE public.portal_properties ADD COLUMN IF NOT EXISTS map_image_url text DEFAULT NULL;
