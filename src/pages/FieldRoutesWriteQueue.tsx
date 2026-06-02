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
import { ArrowLeft, RefreshCw, CheckCircle2, XCircle, Clock, AlertTriangle } from "lucide-react";

import { useAdminSession } from "@/hooks/useAdminSession";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// Common FieldRoutes Note Types (Admin > Preferences > Note Types). Default to
// "Scheduling Notes" since this app is scheduling-focused.
const NOTE_TYPES: { id: number; label: string }[] = [
  { id: 17, label: "Scheduling Notes" },
  { id: 0, label: "Notes" },
  { id: 1, label: "Phone Call" },
  { id: 23, label: "QA Note" },
  { id: 14, label: "Technician Notes" },
  { id: 28, label: "Lead Note" },
];

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

function statusBadge(status: QueueRow["status"]) {
  switch (status) {
    case "committed": return <Badge className="bg-green-600">Committed</Badge>;
    case "failed":    return <Badge variant="destructive">Failed</Badge>;
    case "rejected":  return <Badge variant="secondary">Rejected</Badge>;
    case "processing":return <Badge className="bg-amber-500">Processing…</Badge>;
    default:          return <Badge className="bg-blue-600">Pending</Badge>;
  }
}

export default function FieldRoutesWriteQueue() {
  const navigate = useNavigate();
  const session = useAdminSession();
  const token = session.status === "valid" ? session.token : null;

  const [pending, setPending] = useState<QueueRow[]>([]);
  const [recent, setRecent] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Compose form
  const [customerID, setCustomerID] = useState("");
  const [contactType, setContactType] = useState("17");
  const [noteText, setNoteText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-queue-list", {
        body: { sessionToken: token },
      });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "load_failed");
      setPending(data.pending ?? []);
      setRecent(data.recent ?? []);
    } catch (e) {
      toast.error(`Could not load queue: ${String(e)}`);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const submitNote = async () => {
    if (!token) return;
    const cid = Number(customerID);
    if (!cid || cid <= 0) { toast.error("Enter a valid customer ID"); return; }
    if (!noteText.trim()) { toast.error("Enter the note text"); return; }
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-note-submit", {
        body: {
          sessionToken: token,
          customerID: cid,
          contactType: Number(contactType),
          notes: noteText.trim(),
        },
      });
      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "submit_failed");
      toast.success("Queued for approval");
      setNoteText("");
      setCustomerID("");
      await load();
    } catch (e) {
      toast.error(`Could not queue note: ${String(e)}`);
    } finally {
      setSubmitting(false);
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
            Every write waits here. Nothing reaches FieldRoutes until you approve it.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {/* Compose a note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add a note</CardTitle>
          <CardDescription>Queues a note for approval — it is not written yet.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="cid">Customer ID</Label>
              <Input id="cid" inputMode="numeric" value={customerID}
                onChange={(e) => setCustomerID(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="e.g. 48213" />
            </div>
            <div className="space-y-1.5">
              <Label>Note type</Label>
              <Select value={contactType} onValueChange={setContactType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {NOTE_TYPES.map((t) => (
                    <SelectItem key={t.id} value={String(t.id)}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note">Note</Label>
            <Textarea id="note" value={noteText} onChange={(e) => setNoteText(e.target.value)}
              rows={3} placeholder="What should be recorded on the customer…" />
          </div>
          <Button onClick={submitNote} disabled={submitting}>
            {submitting ? "Queuing…" : "Queue for approval"}
          </Button>
        </CardContent>
      </Card>

      {/* Pending */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
          <Clock className="h-4 w-4" /> Pending approval ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">Nothing waiting.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((row) => (
              <Card key={row.id} className="border-blue-200">
                <CardContent className="pt-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium break-words">{row.summary ?? `${row.entity}/${row.action}`}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {row.requested_by ?? "—"} · {new Date(row.requested_at).toLocaleString()}
                    </p>
                    <pre className="text-xs bg-muted rounded p-2 mt-2 overflow-x-auto">
{JSON.stringify(row.payload, null, 2)}
                    </pre>
                  </div>
                  <div className="flex flex-col gap-2 shrink-0">
                    <Button size="sm" disabled={busyId === row.id}
                      onClick={() => decide(row, "approve")}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyId === row.id}
                      onClick={() => decide(row, "reject")}>
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Recent history */}
      {recent.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">Recent</h2>
          <div className="space-y-2">
            {recent.map((row) => (
              <div key={row.id} className="flex items-center gap-3 text-sm border rounded px-3 py-2">
                {statusBadge(row.status)}
                <span className="flex-1 truncate">{row.summary ?? `${row.entity}/${row.action}`}</span>
                {row.error && (
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> {row.error}
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {row.decided_at ? new Date(row.decided_at).toLocaleString() : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
