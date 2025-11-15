// Deno function to fetch a static map image server-side and return as base64 data URL
// Avoids browser CORS/tainted canvas issues during PDF export

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Content-Type': 'application/json',
};

function clampZoom(z: number) {
  // OSM static map typically supports up to ~18; higher zooms can fail
  if (!Number.isFinite(z)) return 17;
  return Math.max(0, Math.min(18, Math.round(z)));
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
    const width = url.searchParams.get('width') ?? '1100';
    const height = url.searchParams.get('height') ?? '700';
    const marker = url.searchParams.get('marker') ?? '1'; // show a marker by default

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: 'lat and lng are required' }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Build OSM static map URL (no API key required)
    // center expects lat,lon; markers expects lon,lat,color
    const markerParam = marker === '1' ? `&markers=${encodeURIComponent(lng)},${encodeURIComponent(lat)},lightblue1` : '';
    const staticUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&zoom=${encodeURIComponent(String(z))}&size=${encodeURIComponent(`${width}x${height}`)}&maptype=mapnik${markerParam}`;

    console.log('static-map fetching:', { staticUrl, lat, lng, z, width, height });

    const imgResp = await fetch(staticUrl, {
      headers: {
        'User-Agent': 'CrestReports/1.0 (+https://lovable.dev)',
        'Accept': 'image/png,image/*;q=0.8,*/*;q=0.5',
      },
    });

    if (!imgResp.ok) {
      const text = await imgResp.text().catch(() => '');
      console.error('static-map upstream error', imgResp.status, text);
      return new Response(
        JSON.stringify({ error: `Upstream static map error: ${imgResp.status}`, details: text.slice(0, 500) }),
        { status: 502, headers: corsHeaders },
      );
    }

    const buffer = await imgResp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Convert to base64 safely in chunks
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);

    const dataUrl = `data:image/png;base64,${base64}`;

    return new Response(JSON.stringify({ dataUrl, zoom: z }), { headers: corsHeaders });
  } catch (e) {
    console.error('static-map error', e);
    return new Response(
      JSON.stringify({ error: 'Unexpected error fetching static map' }),
      { status: 500, headers: corsHeaders },
    );
  }
});
