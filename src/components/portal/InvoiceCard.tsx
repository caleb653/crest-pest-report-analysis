/**
 * One invoice, expandable — shared by the admin Billing tab and the tenant /
 * PM portal so both sides see exactly the same lines and the same units.
 *
 * A sent invoice can still be edited, but only after an admin unlocks it with
 * the portal password. Every edit to a sent invoice snapshots the previous
 * version into portal_invoice_revisions, so what the customer was handed is
 * always recoverable.
 */

import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, Download, Lock, LockOpen, Plus, Trash2, Check, X, Send } from "lucide-react";
import { buildInvoicePdf, invoicePdfBase64, invoicePdfFilename, type InvoicePdfLine, type InvoicePdfData } from "@/lib/invoicePdf";

const EDIT_PASSWORD = "18444";

const money = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (d?: string | null) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-blue-100 text-blue-800",
  sent: "bg-amber-100 text-amber-900",
  partial: "bg-orange-100 text-orange-900",
  paid: "bg-emerald-100 text-emerald-900",
  void: "bg-neutral-200 text-neutral-600 line-through",
};

interface RefNumber {
  label: string;
  value: string;
}

export function InvoiceCard({
  invoice,
  property,
  clientName,
  isAdmin,
  onChanged,
}: {
  invoice: any;
  property: { name: string; address?: string | null };
  clientName?: string | null;
  isAdmin: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [confirmSend, setConfirmSend] = useState(false);

  const lines: any[] = [...(invoice.portal_invoice_lines ?? [])].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const isSent = ["sent", "paid", "partial", "void"].includes(invoice.status);
  const unlocked =
    !!invoice.edit_unlocked_until && new Date(invoice.edit_unlocked_until).getTime() > Date.now();
  const canEdit = isAdmin && (!isSent || unlocked);

  const [po, setPo] = useState<string>(invoice.po_number ?? "");
  const [note, setNote] = useState<string>(invoice.customer_note ?? "");
  const [refs, setRefs] = useState<RefNumber[]>(
    Array.isArray(invoice.reference_numbers) ? invoice.reference_numbers : []
  );

  const pdfData = (): InvoicePdfData => {
    const pdfLines: InvoicePdfLine[] = lines.map((l) => ({
      line_type: l.line_type,
      description: l.description,
      detail: l.detail,
      service_date: l.service_date,
      quantity: Number(l.quantity),
      unit_price: Number(l.unit_price),
      amount: Number(l.amount),
      units_snapshot: l.units_snapshot,
    }));

    return {
      invoiceNumber: invoice.invoice_number,
      issueDate: invoice.issue_date,
      dueDate: invoice.due_date,
      periodStart: invoice.period_start,
      periodEnd: invoice.period_end,
      propertyName: property.name,
      propertyAddress: property.address,
      clientName,
      referenceNumbers: [
        ...(invoice.po_number ? [{ label: "PO #", value: String(invoice.po_number) }] : []),
        ...(Array.isArray(invoice.reference_numbers) ? invoice.reference_numbers : []),
      ],
      lines: pdfLines,
      subtotal: Number(invoice.subtotal),
      taxAmount: Number(invoice.tax_amount),
      total: Number(invoice.total),
      amountPaid: Number(invoice.amount_paid),
      balance: Number(invoice.balance),
      customerNote: invoice.customer_note,
      // A draft must never be mistaken for a real invoice on someone's desk.
      watermark: invoice.status === "draft" ? "DRAFT" : invoice.status === "void" ? "VOID" : null,
    };
  };

  const download = () =>
    buildInvoicePdf(pdfData()).save(
      invoicePdfFilename({ invoiceNumber: invoice.invoice_number, propertyName: property.name })
    );

  const send = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-invoice-email", {
        body: {
          invoiceId: invoice.id,
          pdfBase64: invoicePdfBase64(pdfData()),
          pdfFilename: invoicePdfFilename({ invoiceNumber: invoice.invoice_number, propertyName: property.name }),
          actor: "admin",
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Send failed");

      toast({
        title: data.mode === "test" ? "Test sent" : "Invoice sent",
        description:
          data.mode === "test"
            ? `Internal only — ${(data.to ?? []).join(", ")}. The customer received nothing.`
            : `To ${(data.to ?? []).join(", ")}`,
      });
      onChanged();
    } catch (e: any) {
      toast({ title: "Could not send", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSending(false);
      setConfirmSend(false);
    }
  };

  const unlock = async () => {
    if (pw.trim() !== EDIT_PASSWORD) {
      toast({ title: "Wrong password", variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc("portal_invoice_unlock", {
      p_invoice: invoice.id,
      p_actor: "admin",
      p_minutes: 20,
    });
    if (error) {
      toast({ title: "Could not unlock", description: error.message, variant: "destructive" });
      return;
    }
    setPw("");
    setUnlocking(false);
    toast({ title: "Unlocked for 20 minutes", description: "Edits are recorded as a new revision." });
    onChanged();
  };

  const saveHeader = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("portal_invoices")
      .update({
        po_number: po.trim() || null,
        customer_note: note.trim() || null,
        reference_numbers: refs.filter((r) => r.label.trim() && r.value.trim()) as never,
      })
      .eq("id", invoice.id);
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved" });
    onChanged();
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between gap-4 p-3 text-left hover:bg-muted/40 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="min-w-0">
          <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
            {invoice.invoice_number}
            <Badge className={`text-[10px] ${STATUS_TONE[invoice.status] ?? ""}`}>{invoice.status}</Badge>
            {unlocked && (
              <Badge className="text-[10px] bg-blue-100 text-blue-800 gap-1">
                <LockOpen className="w-3 h-3" /> unlocked
              </Badge>
            )}
            {invoice.kind === "one_time" && (
              <Badge variant="outline" className="text-[10px]">one-time</Badge>
            )}
            {invoice.revision > 1 && (
              <span className="text-[10px] text-muted-foreground">rev {invoice.revision}</span>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {invoice.period_start
              ? `${shortDate(invoice.period_start)} – ${shortDate(invoice.period_end)}`
              : shortDate(invoice.issue_date)}
            {invoice.po_number && <> · PO {invoice.po_number}</>}
            {Number(invoice.balance) > 0 && invoice.status !== "draft" && <> · {money(invoice.balance)} due</>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-bold tabular-nums">{money(invoice.total)}</span>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="border-t bg-muted/20 p-3 space-y-4">
          {/* ── lines, with every unit we treated ── */}
          <div className="space-y-2">
            {lines.map((l) => {
              const units = l.units_snapshot?.units ?? [];
              return (
                <div key={l.id} className="bg-background rounded-md border p-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {l.service_date && <span className="text-muted-foreground mr-2">{shortDate(l.service_date)}</span>}
                        {l.description}
                      </div>
                      {l.detail && !units.length && (
                        <div className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{l.detail}</div>
                      )}
                    </div>
                    <div className="text-sm font-semibold tabular-nums shrink-0">{money(l.amount)}</div>
                  </div>

                  {units.length > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <div className="text-[11px] text-muted-foreground mb-1">
                        {l.units_snapshot.total} units treated · {l.units_snapshot.included} included in the plan
                      </div>
                      <div className="grid gap-0.5 sm:grid-cols-2">
                        {units.map((u: any, i: number) => (
                          <div key={i} className="text-[11px] text-foreground/80">
                            <span className="font-medium">Unit {u.unit_number}</span> — {u.service}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-bold">{money(invoice.total)}</span>
          </div>

          {invoice.customer_note && !canEdit && (
            <div className="text-xs text-muted-foreground whitespace-pre-line border-t pt-2">{invoice.customer_note}</div>
          )}

          {/* ── admin header editing ── */}
          {canEdit && (
            <div className="space-y-3 border-t pt-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">PO number (optional)</Label>
                  <Input value={po} onChange={(e) => setPo(e.target.value)} placeholder="Leave blank if not needed" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Other numbers for the invoice (optional)</Label>
                {refs.map((r, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      className="w-40"
                      placeholder="Label"
                      value={r.label}
                      onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    />
                    <Input
                      placeholder="Value"
                      value={r.value}
                      onChange={(e) => setRefs(refs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                    />
                    <Button variant="ghost" size="icon" onClick={() => setRefs(refs.filter((_, j) => j !== i))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setRefs([...refs, { label: "", value: "" }])}>
                  <Plus className="w-3 h-3 mr-1" /> Add a number
                </Button>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Comments on the invoice (optional)</Label>
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Prints under the totals." />
              </div>

              <Button size="sm" onClick={saveHeader} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          )}

          {/* ── unlock ── */}
          {isAdmin && isSent && !unlocked && (
            <div className="border-t pt-3">
              {!unlocking ? (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setUnlocking(true)}>
                  <Lock className="w-3 h-3 mr-1" /> Unlock to edit
                </Button>
              ) : (
                <div className="flex gap-2 items-center">
                  <Input
                    type="password"
                    className="w-40 h-8"
                    placeholder="Admin password"
                    value={pw}
                    onChange={(e) => setPw(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && unlock()}
                  />
                  <Button size="sm" className="h-8" onClick={unlock}>
                    <Check className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => { setUnlocking(false); setPw(""); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={download}>
              <Download className="w-3 h-3 mr-1" /> Download PDF
            </Button>

            {isAdmin && invoice.status !== "void" && (
              !confirmSend ? (
                <Button size="sm" className="h-7 text-xs" onClick={() => setConfirmSend(true)}>
                  <Send className="w-3 h-3 mr-1" /> Send invoice
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Send this now?</span>
                  <Button size="sm" className="h-7 text-xs" onClick={send} disabled={sending}>
                    {sending ? "Sending…" : "Yes, send"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setConfirmSend(false)}>
                    Cancel
                  </Button>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default InvoiceCard;
