// PendingFieldRoutesWrites — inline approval list for queued FieldRoutes writes.
//
// Drop this into any page (Slot Finder, Schedule Review, etc.) and the office
// staff (signed in as admin) can approve/reject the writes that originated
// from that page. If the visitor isn't admin, a single sign-in CTA shows up
// instead so non-admins on the page see nothing scary.
//
// Appointment writes are grouped by service date so the office can approve a
// WHOLE DAY in one click (or everything at once) instead of one appointment at
// a time. Bulk approve loops the same per-item commit endpoint, so there's no
// backend change — each item still writes independently and reports success.
//
// Backend: fieldroutes-queue-list (load), fieldroutes-queue-decide (commit).

import { useCallback, useEffect, useMemo, useState } from "react";
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
  status: "pending" | "auto" | "processing" | "committed" | "failed" | "rejected";
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

// Batch key: appointments group by service date (so a day approves at once);
// everything else groups under its entity type.
function groupKeyOf(row: QueueRow): string {
  const p = (row.payload ?? {}) as Record<string, any>;
  if (row.entity === "appointment" && p.date) return `appt:${p.date}`;
  return `entity:${row.entity}`;
}

function groupLabelOf(key: string): string {
  if (key.startsWith("appt:")) {
    const iso = key.slice(5);
    const d = new Date(`${iso}T12:00:00`);
    return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  }
  return `${key.slice(7)}s`;
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
  // Everything that ISN'T awaiting approval: auto-queued (paced bot), in-flight,
  // committed, failed — so "did my push actually land?" is answerable here.
  const [recent, setRecent] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Bulk approval: which group is committing ("all" for the whole list) + progress.
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const clearExpiredSession = useCallback(() => {
    localStorage.removeItem("admin_session");
    setToken(null);
    setRows([]);
  }, []);

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
      const errorMessage = data?.error ?? error?.message ?? "load_failed";
      if (error || !data?.ok) {
        if (errorMessage === "invalid_session" || errorMessage === "missing_session") {
          clearExpiredSession();
          return;
        }
        throw new Error(errorMessage);
      }
      const pending = (data.pending ?? []) as QueueRow[];
      setRows(wanted ? pending.filter((r) => wanted.includes(r.entity)) : pending);
      setRecent((data.recent ?? []) as QueueRow[]);
    } catch (e) {
      // Silent unless we have a token; non-admins shouldn't see errors.
      console.warn("queue load failed", e);
    } finally {
      setLoading(false);
    }
  }, [token, wanted?.join("|"), clearExpiredSession]);

  useEffect(() => { if (token) load(); }, [token, load]);

  // Rows batched into approvable groups (appointments by date, soonest first).
  const groups = useMemo(() => {
    const m = new Map<string, QueueRow[]>();
    for (const r of rows) {
      const k = groupKeyOf(r);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    for (const list of m.values()) {
      list.sort((a, b) =>
        String((a.payload as any)?.start ?? "").localeCompare(String((b.payload as any)?.start ?? "")));
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const decide = async (row: QueueRow, action: "approve" | "reject") => {
    if (!token) return;
    if (action === "approve" && !window.confirm(`Approve and WRITE to FieldRoutes now?\n\n${row.summary ?? row.id}`)) return;
    setBusyId(row.id);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-queue-decide", {
        body: { sessionToken: token, id: row.id, action },
      });
      const errorMessage = data?.error ?? error?.message ?? "unknown";
      if (errorMessage === "invalid_session" || errorMessage === "missing_session") {
        clearExpiredSession();
        toast.info("Admin session expired — please sign in again.");
        return;
      }
      if (error) {
        toast.error(`Action failed: ${errorMessage}`);
        return;
      }
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

  // Bulk-approve a list of queued writes with a single confirm. Loops the same
  // per-item commit endpoint sequentially (so one bad item can't abort the rest)
  // and reports a roll-up. `scopeKey` drives which button shows the spinner.
  const bulkApprove = async (list: QueueRow[], scopeKey: string, scopeLabel: string) => {
    if (!token || list.length === 0) return;
    if (!window.confirm(
      `Approve and WRITE ${list.length} appointment${list.length === 1 ? "" : "s"}` +
      `${scopeLabel ? ` for ${scopeLabel}` : ""} to FieldRoutes now?\n\n` +
      `Each one books in FieldRoutes immediately.`,
    )) return;

    setBulkBusy(scopeKey);
    setProgress({ done: 0, total: list.length });
    let ok = 0, fail = 0, disabled = false, expired = false;
    for (let i = 0; i < list.length; i++) {
      const row = list[i];
      try {
        const { data, error } = await supabase.functions.invoke("fieldroutes-queue-decide", {
          body: { sessionToken: token, id: row.id, action: "approve" },
        });
        const errorMessage = data?.error ?? error?.message ?? "unknown";
        if (errorMessage === "invalid_session" || errorMessage === "missing_session") { expired = true; break; }
        if (!error && data?.status === "committed") ok++;
        else {
          fail++;
          if (errorMessage === "server_write_disabled") { disabled = true; break; }
        }
      } catch { fail++; }
      setProgress({ done: i + 1, total: list.length });
    }
    setBulkBusy(null);
    setProgress(null);
    if (expired) {
      clearExpiredSession();
      toast.info("Admin session expired — please sign in again.");
      return;
    }
    await load();
    if (disabled) toast.error("Writes disabled on server (FR_WRITE_ENABLED).");
    else if (ok) toast.success(`Wrote ${ok} to FieldRoutes${fail ? ` · ${fail} failed` : ""} ✓`);
    else toast.error(`No writes committed${fail ? ` · ${fail} failed` : ""}`);
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

  if (rows.length === 0 && recent.length === 0 && !loading) return null;

  const anyBusy = bulkBusy !== null || busyId !== null;

  // Status roll-up of everything NOT awaiting approval — auto-queued rows the
  // paced bot will write, in-flight, failures (with why), and recent successes.
  const autoRows = recent.filter((r) => r.status === "auto" || r.status === "processing");
  const failedRows = recent.filter((r) => r.status === "failed");
  const committedRows = recent.filter((r) => r.status === "committed").slice(0, 8);

  const statusSection = (autoRows.length > 0 || failedRows.length > 0 || committedRows.length > 0) && (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <RefreshCw className="h-4 w-4" /> Write queue status
          {autoRows.length > 0 && <Badge variant="secondary">{autoRows.length} queued</Badge>}
          {failedRows.length > 0 && <Badge variant="destructive">{failedRows.length} failed</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-xs">
        {autoRows.length > 0 && (
          <div className="space-y-1">
            <p className="font-semibold">Queued for auto-push (the bot writes these ~40/min — no approval needed):</p>
            {autoRows.map((r) => (
              <p key={r.id} className="text-muted-foreground break-words">
                • {r.summary ?? r.id}{r.status === "processing" ? " — writing now…" : ""}
              </p>
            ))}
          </div>
        )}
        {failedRows.length > 0 && (
          <div className="space-y-1">
            <p className="font-semibold text-red-600">Failed (NOT in FieldRoutes — re-push from the Fill tab):</p>
            {failedRows.map((r) => (
              <p key={r.id} className="text-muted-foreground break-words">
                • {r.summary ?? r.id} — <span className="text-red-600">{(r as any).error ?? "unknown error"}</span>
              </p>
            ))}
          </div>
        )}
        {committedRows.length > 0 && (
          <div className="space-y-1">
            <p className="font-semibold text-emerald-700">Recently written to FieldRoutes:</p>
            {committedRows.map((r) => (
              <p key={r.id} className="text-muted-foreground break-words">• {r.summary ?? r.id}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (rows.length === 0) {
    return statusSection || null;
  }

  return (
    <>
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0 gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Clock className="h-4 w-4" /> {title}{" "}
          <Badge variant="secondary">{rows.length}</Badge>
        </CardTitle>
        <div className="flex items-center gap-2">
          {rows.length > 1 && (
            <Button
              size="sm"
              disabled={anyBusy}
              onClick={() => bulkApprove(rows, "all", "")}
            >
              {bulkBusy === "all" && progress
                ? <>Approving {progress.done}/{progress.total}…</>
                : <><CheckCircle2 className="h-3 w-3 mr-1" /> Approve all ({rows.length})</>}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={load} disabled={loading || anyBusy}>
            <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {groups.map(([key, list]) => {
          const label = groupLabelOf(key);
          const isApptDay = key.startsWith("appt:");
          return (
            <div key={key} className="space-y-2">
              <div className="flex items-center justify-between gap-2 border-b pb-1">
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                  {label} <Badge variant="outline">{list.length}</Badge>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={anyBusy}
                  onClick={() => bulkApprove(list, key, isApptDay ? label : `all ${label}`)}
                >
                  {bulkBusy === key && progress
                    ? <>Approving {progress.done}/{progress.total}…</>
                    : <><CheckCircle2 className="h-3 w-3 mr-1" /> {isApptDay ? "Approve day" : "Approve all"} ({list.length})</>}
                </Button>
              </div>
              {list.map((row) => {
                const { title: rowTitle, lines } = describe(row);
                return (
                  <div key={row.id} className="rounded-md border border-blue-200 bg-blue-50/40 p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-medium text-sm break-words">{rowTitle}</p>
                      {lines.map((l, i) => (
                        <p key={i} className="text-xs text-muted-foreground break-words">{l}</p>
                      ))}
                      <p className="text-[10px] text-muted-foreground pt-1">
                        Requested {new Date(row.requested_at).toLocaleString()}
                        {row.requested_by ? ` · ${row.requested_by}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" disabled={anyBusy} onClick={() => decide(row, "approve")}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="outline" disabled={anyBusy} onClick={() => decide(row, "reject")}>
                        <XCircle className="h-3 w-3 mr-1" /> Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </CardContent>
    </Card>
    {statusSection}
    </>
  );
}
