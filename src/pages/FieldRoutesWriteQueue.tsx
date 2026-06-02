// FieldRoutesWriteQueue — admin-only approval queue for FieldRoutes writes.
//
// Every write to FieldRoutes goes through here. Submitting a note does NOT write
// it — it creates a PENDING item. Nothing reaches FieldRoutes until an admin
// clicks Approve on that specific item (one approval per write, no bulk).
//
// Backend: fieldroutes-note-submit (enqueue), fieldroutes-queue-list (load),
// fieldroutes-queue-decide (approve/reject → commit via Cloud Run).

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, CheckCircle2, Clock, Inbox } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type QueueRow = {
  id: string;
  entity: string;
  action: string;
  summary: string | null;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "committed" | "failed" | "rejected";
  requested_by: string | null;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  result: unknown;
  error: string | null;
};

// Render a plain-English summary of exactly what will happen in FieldRoutes
// when this queue row is approved. No JSON, no internal field names.
function describeAction(row: QueueRow): { title: string; lines: string[] } {
  const p = (row.payload ?? {}) as Record<string, any>;
  const cid = p.customerID ?? p.customer_id ?? p.customerId ?? "—";
  const lines: string[] = [`FieldRoutes Customer ID: ${cid}`];

  if (row.entity === "document" || row.action?.includes("document")) {
    const title = `Upload PDF to FieldRoutes customer ${cid}`;
    if (p.filename) lines.push(`File: ${p.filename}`);
    if (p.description) lines.push(`Description: ${p.description}`);
    return { title, lines };
  }
  if (row.entity === "note" || row.action?.includes("note")) {
    const title = `Add note to FieldRoutes customer ${cid}`;
    if (p.notes) lines.push(`Note: ${String(p.notes).slice(0, 400)}`);
    return { title, lines };
  }
  return { title: row.summary ?? `${row.entity}/${row.action}`, lines };
}

export default function FieldRoutesWriteQueue() {
  const navigate = useNavigate();
  const session = useAdminSession();
  const token = session.status === "valid" ? session.token : null;

  const [pending, setPending] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-queue-list", {
        body: { sessionToken: token },
      });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "load_failed");
      setPending(data.pending ?? []);
    } catch (e) {
      toast.error(`Could not load queue: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  // Manual run of the inspection auto-create job (also runs hourly via cron once wired).
  const syncInspections = async () => {
    if (!token) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-sync-inspections", {
        body: { sessionToken: token },
      });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "sync_failed");
      toast.success(`Inspections synced: ${data.created} new draft report(s), ${data.skipped} already existed.`);
    } catch (e) {
      toast.error(`Sync failed: ${String(e)}`);
    } finally {
      setSyncing(false);
    }
  };

  const decide = async (row: QueueRow, action: "approve" | "reject") => {
    if (!token) return;
    if (action === "approve" &&
        !window.confirm(`Approve and WRITE to FieldRoutes now?\n\n${row.summary ?? row.id}`)) {
      return;
    }
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-queue-decide", {
        body: { sessionToken: token, id: row.id, action },
      });
      if (error) throw new Error(error.message);
      if (action === "reject") {
        toast.success(data?.ok ? "Rejected" : `Reject: ${data?.error ?? "failed"}`);
      } else if (data?.status === "committed") {
        toast.success("Written to FieldRoutes ✓");
      } else if (data?.error === "server_write_disabled") {
        toast.error("Writes are disabled on the server (FR_WRITE_ENABLED not set). Nothing was written.");
      } else {
        toast.error(`Write failed: ${data?.error ?? "unknown"}`);
      }
      await load();
    } catch (e) {
      toast.error(`Action failed: ${String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  if (session.status === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Checking session…</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin-dashboard")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">FieldRoutes Writes</h1>
          <p className="text-sm text-muted-foreground">
            Each item below is exactly what will be sent to FieldRoutes when you approve it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={syncInspections} disabled={syncing}>
          <Inbox className={`h-4 w-4 mr-2 ${syncing ? "animate-pulse" : ""}`} /> Sync inspections
        </Button>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Pending */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
          <Clock className="h-4 w-4" /> Pending approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Nothing waiting. When a signed report is ready to push to FieldRoutes, it will appear here for approval.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((row) => {
              const { title, lines } = describeAction(row);
              return (
                <Card key={row.id} className="border-blue-200">
                  <CardContent className="pt-4 flex items-start gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <p className="font-medium break-words">{title}</p>
                      {lines.map((l, i) => (
                        <p key={i} className="text-sm text-muted-foreground break-words">{l}</p>
                      ))}
                      <p className="text-xs text-muted-foreground pt-1">
                        Requested {new Date(row.requested_at).toLocaleString()}
                        {row.requested_by ? ` · ${row.requested_by}` : ""}
                      </p>
                    </div>
                    <Button size="sm" disabled={busyId === row.id}
                      onClick={() => decide(row, "approve")}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
