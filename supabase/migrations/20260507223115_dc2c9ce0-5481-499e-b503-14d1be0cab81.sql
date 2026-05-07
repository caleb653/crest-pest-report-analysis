UPDATE public.portal_properties AS pp
SET
  map_image_url = r.custom_map_url,
  map_data = r.map_data
FROM public.reports AS r
WHERE pp.id = '96e29290-7c56-4e0c-8682-01d1c3fed455'
  AND r.id = 'f28bf54c-97fe-4b3c-b084-28c9dae3ac29'
  AND r.custom_map_url IS NOT NULL;