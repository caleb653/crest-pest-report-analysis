// supabase/functions/fieldroutes-queue-list
// List the FieldRoutes write queue for the admin approval UI.
//
// Returns all PENDING rows (oldest first, so the queue is FIFO) plus the most
// recent decided rows (committed/failed/rejected) for context. Admin session
// required — the queue is never exposed to the browser directly (RLS denies
// anon), only through this service-role function.
//
// Request body: { sessionToken, recentLimit? }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const sessionToken = String(body?.sessionToken ?? "").trim();
    const recentLimit = Math.min(50, Math.max(0, Math.trunc(Number(body?.recentLimit ?? 20))));

    if (!sessionToken) return json({ ok: false, error: "missing_session" }, 401);
    const { data: session } = await supabase
      .from("admin_sessions")
      .select("id")
      .eq("session_token", sessionToken)
      .eq("is_valid", true)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!session) return json({ ok: false, error: "invalid_session" }, 401);

    const cols = "id, entity, action, summary, payload, status, requested_by, requested_at, decided_by, decided_at, result, error";

    // Pending: oldest first (FIFO). Decided: newest first (recent history).
    const [pendingRes, recentRes] = await Promise.all([
      supabase.from("fieldroutes_write_queue")
        .select(cols).eq("status", "pending").order("requested_at", { ascending: true }),
      supabase.from("fieldroutes_write_queue")
        .select(cols).neq("status", "pending").order("decided_at", { ascending: false }).limit(recentLimit),
    ]);

    if (pendingRes.error || recentRes.error) {
      console.error("fieldroutes-queue-list error", pendingRes.error ?? recentRes.error);
      return json({ ok: false, error: "list_failed" }, 500);
    }

    return json({ ok: true, pending: pendingRes.data ?? [], recent: recentRes.data ?? [] });
  } catch (e) {
    console.error("fieldroutes-queue-list exception", e);
    return json({ ok: false, error: "exception", detail: String(e) });
  }
});
