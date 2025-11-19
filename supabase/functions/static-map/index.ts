// Deno function to fetch a static map image server-side and return as base64 data URL
// Tries multiple public OSM static map providers to avoid outages and CORS/taint issues.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
};

function clampZoom(z: number) {
  if (!Number.isFinite(z)) return 17;
  return Math.max(0, Math.min(18, Math.round(z)));
}

function clampSize(v: number, min: number, max: number) {
  if (!Number.isFinite(v)) return min;
  return Math.max(min, Math.min(max, Math.round(v)));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get('lat');
    const lng = url.searchParams.get('lng');
    const zoomParam = Number(url.searchParams.get('zoom') ?? 17);
    const z = clampZoom(zoomParam);

    const widthParam = Number(url.searchParams.get('width') ?? 1100);
    const heightParam = Number(url.searchParams.get('height') ?? 700);
    const width = clampSize(widthParam, 256, 1280);
    const height = clampSize(heightParam, 256, 1280);

    const marker = url.searchParams.get('marker') ?? '1';

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: 'lat and lng are required' }),
        { status: 400, headers: corsHeaders },
      );
    }

    const MAPBOX_TOKEN = Deno.env.get('MAPBOX_ACCESS_TOKEN');
    if (!MAPBOX_TOKEN) {
      return new Response(
        JSON.stringify({ error: 'Mapbox token not configured' }),
        { status: 500, headers: corsHeaders },
      );
    }

    // Use Mapbox Static Images API for high-quality satellite imagery
    // Format: /styles/v1/{username}/{style_id}/static/{lon},{lat},{zoom}/{width}x{height}@2x
    // bearing=0, pitch=0 for 2D top-down view
    let mapboxUrl = `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static`;
    
    if (marker === '1') {
      // Add a red pin marker at the location
      mapboxUrl += `/pin-s+ff0000(${lng},${lat})`;
    }
    
    mapboxUrl += `/${lng},${lat},${z},0,0/${width}x${height}@2x?access_token=${MAPBOX_TOKEN}`;

    const candidates: string[] = [mapboxUrl];


    let lastError = '';
    
    try {
      const imgResp = await fetch(candidates[0], {
        headers: {
          'User-Agent': 'CrestReports/1.0 (+https://lovable.dev)',
          'Accept': 'image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
        },
      });

      if (!imgResp.ok) {
        const text = await imgResp.text().catch(() => '');
        return new Response(
          JSON.stringify({ error: 'Failed to fetch map', details: `HTTP ${imgResp.status}: ${text.slice(0, 200)}` }),
          { status: 502, headers: corsHeaders },
        );
      }

      const contentType = imgResp.headers.get('content-type') || '';
      if (!contentType.includes('image')) {
        const text = await imgResp.text().catch(() => '');
        return new Response(
          JSON.stringify({ error: 'Invalid response', details: `Non-image response: ${contentType}` }),
          { status: 502, headers: corsHeaders },
        );
      }

      const buffer = await imgResp.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk));
      }
      const base64 = btoa(binary);
      const dataUrl = `data:${contentType.split(';')[0] || 'image/png'};base64,${base64}`;
      return new Response(JSON.stringify({ dataUrl, zoom: z }), { headers: corsHeaders });
    } catch (e) {
      const msg = (e && typeof e === 'object' && 'message' in e) ? (e as any).message as string : String(e);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch satellite map', details: msg }),
        { status: 502, headers: corsHeaders },
      );
    }

  } catch (e) {
    const details = (e && typeof e === 'object' && 'toString' in e)
      ? String(e as any)
      : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Unexpected error fetching static map', details }),
      { status: 500, headers: corsHeaders },
    );
  }
});
