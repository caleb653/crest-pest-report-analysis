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
    const width = clampSize(widthParam, 256, 1280); // keep reasonable to avoid provider limits
    const height = clampSize(heightParam, 256, 1280);

    const marker = url.searchParams.get('marker') ?? '1';

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: 'lat and lng are required' }),
        { status: 400, headers: corsHeaders },
      );
    }

    // Build candidate URLs (some providers expect markers as lat,lon, others lon,lat).
    const candidates: string[] = [];
    const baseParams = `center=${encodeURIComponent(lat)},${encodeURIComponent(lng)}&zoom=${encodeURIComponent(String(z))}&size=${encodeURIComponent(`${width}x${height}`)}&maptype=mapnik`;

    // openstreetmap.de
    if (marker === '1') {
      candidates.push(`https://staticmap.openstreetmap.de/staticmap.php?${baseParams}&markers=${encodeURIComponent(lat)},${encodeURIComponent(lng)},lightblue1`);
      candidates.push(`https://staticmap.openstreetmap.de/staticmap.php?${baseParams}&markers=${encodeURIComponent(lng)},${encodeURIComponent(lat)},lightblue1`);
    } else {
      candidates.push(`https://staticmap.openstreetmap.de/staticmap.php?${baseParams}`);
    }

    // openstreetmap.fr (fallback)
    if (marker === '1') {
      candidates.push(`https://staticmap.openstreetmap.fr/staticmap.php?${baseParams}&markers=${encodeURIComponent(lat)},${encodeURIComponent(lng)},lightblue1`);
      candidates.push(`https://staticmap.openstreetmap.fr/staticmap.php?${baseParams}&markers=${encodeURIComponent(lng)},${encodeURIComponent(lat)},lightblue1`);
    } else {
      candidates.push(`https://staticmap.openstreetmap.fr/staticmap.php?${baseParams}`);
    }

    let lastError = '';
    for (const staticUrl of candidates) {
      try {
        const imgResp = await fetch(staticUrl, {
          headers: {
            'User-Agent': 'CrestReports/1.0 (+https://lovable.dev)',
            'Accept': 'image/png,image/jpeg,image/*;q=0.8,*/*;q=0.5',
          },
        });

        if (!imgResp.ok) {
          const text = await imgResp.text().catch(() => '');
          lastError = `HTTP ${imgResp.status}: ${text.slice(0, 200)}`;
          continue; // try next candidate
        }

        const contentType = imgResp.headers.get('content-type') || '';
        if (!contentType.includes('image')) {
          const text = await imgResp.text().catch(() => '');
          lastError = `Non-image response: ${contentType} ${text.slice(0, 200)}`;
          continue;
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
        lastError = `${staticUrl} fetch error: ${msg}`;
        continue;
      }
    }

    return new Response(
      JSON.stringify({ error: 'All static map providers failed', details: lastError }),
      { status: 502, headers: corsHeaders },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: 'Unexpected error fetching static map', details: e?.message || String(e) }),
      { status: 500, headers: corsHeaders },
    );
  }
});
