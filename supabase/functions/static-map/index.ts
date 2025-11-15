// Deno function to fetch a static map image server-side and return as base64 data URL
// Avoids browser CORS/tainted canvas issues during PDF export

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const url = new URL(req.url);
    const lat = url.searchParams.get("lat");
    const lng = url.searchParams.get("lng");
    const zoom = url.searchParams.get("zoom") ?? "20";
    const width = url.searchParams.get("width") ?? "1100";
    const height = url.searchParams.get("height") ?? "700";
    const marker = url.searchParams.get("marker") ?? "1"; // show a marker by default

    if (!lat || !lng) {
      return new Response(
        JSON.stringify({ error: "lat and lng are required" }),
        { status: 400, headers: CORS_HEADERS },
      );
    }

    // Build OSM static map URL (no API key required)
    const staticUrl = `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(
      lat,
    )},${encodeURIComponent(lng)}&zoom=${encodeURIComponent(zoom)}&size=${encodeURIComponent(
      `${width}x${height}`,
    )}&maptype=mapnik${marker === "1" ? `&markers=${encodeURIComponent(lat)},${encodeURIComponent(lng)},lightblue1` : ""}`;

    const imgResp = await fetch(staticUrl);
    if (!imgResp.ok) {
      return new Response(
        JSON.stringify({ error: `Upstream static map error: ${imgResp.status}` }),
        { status: 502, headers: CORS_HEADERS },
      );
    }

    const buffer = await imgResp.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    // Convert to base64 safely in chunks
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, Array.from(chunk));
    }
    const base64 = btoa(binary);

    const dataUrl = `data:image/png;base64,${base64}`;

    return new Response(JSON.stringify({ dataUrl }), { headers: CORS_HEADERS });
  } catch (e) {
    console.error("static-map error", e);
    return new Response(
      JSON.stringify({ error: "Unexpected error fetching static map" }),
      { status: 500, headers: CORS_HEADERS },
    );
  }
});
