// Returns the public browser Google Maps JavaScript API key.
// The key is referrer-restricted in Google Cloud Console, so it's safe to
// expose to the browser — we just don't want it baked into the bundle so we
// can rotate it without rebuilding.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const key = Deno.env.get("GOOGLE_MAPS_BROWSER_KEY") || "";
  return new Response(JSON.stringify({ key }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});