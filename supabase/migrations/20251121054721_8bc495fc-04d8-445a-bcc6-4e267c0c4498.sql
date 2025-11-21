-- Create storage bucket for report images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('report-images', 'report-images', true);

-- Create RLS policies for report-images bucket
CREATE POLICY "Anyone can upload report images"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'report-images');

CREATE POLICY "Anyone can view report images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'report-images');

CREATE POLICY "Anyone can update report images"
ON storage.objects FOR UPDATE
TO public
USING (bucket_id = 'report-images');

-- Add columns to reports table for storing image URLs
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS custom_map_url TEXT,
ADD COLUMN IF NOT EXISTS property_images JSONB DEFAULT '[]'::jsonb;