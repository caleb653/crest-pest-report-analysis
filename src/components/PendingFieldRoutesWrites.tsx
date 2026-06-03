// PendingFieldRoutesWrites — inline approval list for queued FieldRoutes writes.
//
// Drop this into any page (Slot Finder, Schedule Review, etc.) and the office
// staff (signed in as admin) can approve/reject the writes that originated
// from that page. If the visitor isn't admin, a single sign-in CTA shows up
// instead so non-admins on the page see nothing scary.
//
// Backend: fieldroutes-queue-list (load), fieldroutes-queue-decide (commit).

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, Clock, RefreshCw, XCircle } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type QueueRow = {
  id: string;
  entity: string;
  action: string;
  summary: string | null;
  payload: Record<string, unknown>;
  status: "pending" | "processing" | "committed" | "failed" | "rejected";
  requested_by: string | null;
  requested_at: string;
};

// Plain-English render of what will happen on approve.
function describe(row: QueueRow): { title: string; lines: string[] } {
  const p = (row.payload ?? {}) as Record<string, any>;
  const cid = p.customer_id ?? p.customerID ?? p.customerId ?? "—";
  const lines: string[] = [`FieldRoutes Customer #${cid}`];

  if (row.entity === "appointment") {
    const label = p._label?.customer ? `${p._label.customer} (#${cid})` : `#${cid}`;
    const svc = p._label?.service_type || "appointment";
    const sub = p.subscription_id === -1 ? "standalone" : `subscription #${p.subscription_id}`;
    return {
      title: `Book ${svc} for ${label}`,
      lines: [
        `${p.date} · ${p.start}–${p.end} (${p.duration} min)`,
        sub,
        p.service_type_id ? `Service type id ${p.service_type_id}` : "Service type id not mapped yet",
      ],
    };
  }
  if (row.entity === "document") {
    if (p.filename) lines.push(`File: ${p.filename}`);
    if (p.description) lines.push(`Description: ${p.description}`);
    return { title: `Upload PDF to customer #${cid}`, lines };
  }
  if (row.entity === "note") {
    if (p.notes) lines.push(`Note: ${String(p.notes).slice(0, 400)}`);
    return { title: `Add note to customer #${cid}`, lines };
  }
  return { title: row.summary ?? `${row.entity}/${row.action}`, lines };
}

type Props = {
  /** Optional filter by entity (e.g. "appointment"). Omit to show all pending. */
  entityFilter?: string | string[];
  /** Section title. */
  title?: string;
};

export default function PendingFieldRoutesWrites({ entityFilter, title = "Pending FieldRoutes writes" }: Props) {
  // Optimistic check; the queue-list call enforces real validation.
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => { setToken(localStorage.getItem("admin_session")); }, []);

  const wanted = entityFilter == null ? null
    : Array.isArray(entityFilter) ? entityFilter
    : [entityFilter];

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-queue-list", {
        body: { sessionToken: token },
      });
      if (error || !data?.ok) {
        if (data?.error === "invalid_session") {
          localStorage.removeItem("admin_session"); setToken(null);
        }
        throw new Error(data?.error ?? error?.message ?? "load_failed");
      }
      const pending = (data.pending ?? []) as QueueRow[];
      setRows(wanted ? pending.filter((r) => wanted.includes(r.entity)) : pending);
    } catch (e) {
      // Silent unless we have a token; non-admins shouldn't see errors.
      console.warn("queue load failed", e);
    } finally {
      setLoading(false);
    }
  }, [token, wanted?.join("|")]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const decide = async (row: QueueRow, action: "approve" | "reject") => {
    if (!token) return;
    if (action === "approve" && !window.confirm(`Approve and WRITE to FieldRoutes now?\n\n${row.summary ?? row.id}`)) return;
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-queue-decide", {
        body: { sessionToken: token, id: row.id, action },
      });
      if (error) throw new Error(error.message);
      if (action === "reject") toast.success(data?.ok ? "Rejected" : `Reject: ${data?.error ?? "failed"}`);
      else if (data?.status === "committed") toast.success("Written to FieldRoutes ✓");
      else if (data?.error === "not_pending") toast.info("Already decided — refreshing");
      else if (data?.error === "server_write_disabled") toast.error("Writes disabled on server (FR_WRITE_ENABLED).");
      else toast.error(`Write failed: ${data?.error ?? "unknown"}`);
      await load();
    } catch (e) {
      toast.error(`Action failed: ${String(e)}`);
    } finally {
      setBusyId(null);
    }
  };

  // Non-admin: small sign-in chip, no scary UI.
  if (!token) {
    return (
      <Card className="bg-muted/30">
        <CardContent className="py-3 px-4 text-xs text-muted-foreground flex items-center justify-between gap-3">
          <span>FieldRoutes writes need admin approval.</span>
          <Link to="/admin-login" className="underline hover:text-foreground">Sign in as admin</Link>
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0 && !loading) return null;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" /> {title}{" "}
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((row) => {
          const { title, lines } = describe(row);
          return (
            <div key={row.id} className="rounded-md border border-blue-200 bg-blue-50/40 p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="font-medium text-sm break-words">{title}</p>
                {lines.map((l, i) => (
                  <p key={i} className="text-xs text-muted-foreground break-words">{l}</p>
                ))}
                <p className="text-[10px] text-muted-foreground pt-1">
                  Requested {new Date(row.requested_at).toLocaleString()}
                  {row.requested_by ? ` · ${row.requested_by}` : ""}
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <Button size="sm" disabled={busyId === row.id} onClick={() => decide(row, "approve")}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                </Button>
                <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => decide(row, "reject")}>
                  <XCircle className="h-3 w-3 mr-1" /> Reject
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}