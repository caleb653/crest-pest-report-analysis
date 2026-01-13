-- Add column for storing the rendered map image (map with annotations baked in)
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS rendered_map_url TEXT;