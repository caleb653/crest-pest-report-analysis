/**
 * Billing tab — admin side.
 *
 * Invoices are BUILT and SENT from the Crest app. FieldRoutes is never written
 * to from here: the recurring subscription bills itself, and the office keys
 * the extras in by hand from the "needs keying into FieldRoutes" checklist so
 * AR ties.
 *
 * Nothing on this screen sends anything automatically. Every property starts in
 * TEST mode, where a send reaches only the internal test recipients.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { AlertTriangle, FileText, Receipt, RefreshCw, ClipboardList, Check, X, Repeat, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  buildDraftInvoice,
  buildOneTimeInvoice,
  saveDraftInvoice,
  listBillableVisits,
  billingPeriod,
  type DraftInvoice,
  type BillableVisit,
  type CustomLine,
} from "@/lib/invoiceBuilder";
import { InvoiceCard } from "@/components/portal/InvoiceCard";

/** jsonb email list <-> the comma-separated text the inputs show. */
const emailList = (v: unknown): string => (Array.isArray(v) ? v : []).map((e: any) => (typeof e === "string" ? e : e?.email)).filter(Boolean).join(", ");
const parseEmails = (s: string): string[] =>
  s.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"));

const money = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (d?: string | null) =>
  d ? new Date(`${String(d).slice(0, 10)}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";

const STATUS_TONE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-blue-100 text-blue-800",
  sent: "bg-amber-100 text-amber-900",
  partial: "bg-orange-100 text-orange-900",
  paid: "bg-emerald-100 text-emerald-900",
  void: "bg-neutral-200 text-neutral-600 line-through",
};


/** Shared preview of a built draft — identical for a recurring and a one-time bill. */
function DraftPreview({
  draft,
  onDiscard,
  onSave,
  saving,
}: {
  draft: DraftInvoice;
  onDiscard: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        {draft.period_start ? `${shortDate(draft.period_start)} – ${shortDate(draft.period_end)}` : "One-time bill"}
        {draft.po_number && <> · PO {draft.po_number}</>}
      </div>

      {draft.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 space-y-1">
          {draft.warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-900 flex gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {w}
            </div>
          ))}
        </div>
      )}

      <div className="border rounded-lg divide-y">
        {draft.lines.map((l, i) => (
          <div key={i} className="p-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-medium">{l.description}</div>
              {l.detail && <div className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{l.detail}</div>}
            </div>
            <div className="text-sm font-semibold tabular-nums shrink-0">{money(l.amount)}</div>
          </div>
        ))}
        {draft.lines.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">Nothing to bill.</div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="text-base font-bold">Total {money(draft.subtotal)}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onDiscard}>Discard</Button>
          <Button size="sm" onClick={onSave} disabled={saving || draft.lines.length === 0}>
            {saving ? "Saving…" : "Save as draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}

interface Props {
  propertyId: string;
  propertyName: string;
  propertyAddress?: string | null;
  clientName?: string | null;
  /** Tenant / PM view: invoice history only, no setup, no drafts, no money buttons. */
  isAdmin?: boolean;
}

export function BillingTab({ propertyId, propertyName, propertyAddress, clientName, isAdmin = true }: Props) {
  const [settings, setSettings] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<DraftInvoice | null>(null);
  const [building, setBuilding] = useState<"cadence" | "one_time" | null>(null);
  const [saving, setSaving] = useState(false);

  // One-time bill: what the user has picked, and the free-typed lines.
  const [billable, setBillable] = useState<BillableVisit[]>([]);
  const [pickedVisits, setPickedVisits] = useState<string[]>([]);
  const [customLines, setCustomLines] = useState<CustomLine[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: inv }] = await Promise.all([
      supabase.from("portal_billing_settings").select("*").eq("property_id", propertyId).maybeSingle(),
      supabase
        .from("portal_invoices")
        .select("*, portal_invoice_lines(id, sort_order, line_type, description, detail, service_date, quantity, unit_price, amount, fr_entry_required, units_snapshot)")
        .eq("property_id", propertyId)
        .order("issue_date", { ascending: false })
        .limit(50),
    ]);
    setSettings(s ?? null);
    setInvoices(inv ?? []);
    if (isAdmin) {
      try {
        setBillable(await listBillableVisits(propertyId));
      } catch {
        setBillable([]);
      }
    }
    setLoading(false);
  }, [propertyId, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const saveSetting = async (patch: Record<string, unknown>) => {
    const { error } = await supabase
      .from("portal_billing_settings")
      .upsert({ property_id: propertyId, ...(settings ?? {}), ...patch }, { onConflict: "property_id" });
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    setSettings((prev: any) => ({ ...(prev ?? { property_id: propertyId }), ...patch }));
  };

  const buildCadence = async () => {
    setBuilding("cadence");
    try {
      setDraft(await buildDraftInvoice(propertyId));
    } catch (e: any) {
      // A 4-week property with no anchor lands here by design — it refuses to
      // guess the window rather than bill the wrong visits.
      toast({ title: "Can't build this period yet", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBuilding(null);
    }
  };

  const buildOneTime = async () => {
    setBuilding("one_time");
    try {
      setDraft(await buildOneTimeInvoice(propertyId, { serviceIds: pickedVisits, customLines }));
    } catch (e: any) {
      toast({ title: "Can't build this bill", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBuilding(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      await saveDraftInvoice(draft);
      toast({ title: "Draft saved", description: "Nothing has been sent — review it, then send a test." });
      setDraft(null);
      setPickedVisits([]);
      setCustomLines([]);
      await load();
    } catch (e: any) {
      toast({ title: "Could not save draft", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const setPaid = async (invoiceId: string, paid: boolean) => {
    const { error } = await supabase.rpc("portal_invoice_set_paid", {
      p_invoice: invoiceId,
      p_paid: paid,
      p_actor: "admin",
    });
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    await load();
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading billing…</div>;
  }

  const toKeyIn = invoices.filter(
    (i) => ["sent", "paid", "partial"].includes(i.status) && i.fieldroutes_status === "pending"
  );

  // The window a cadence invoice would cover right now. A 4-week property with
  // no anchor throws rather than guessing, so the label just stays empty.
  let periodLabel = "";
  try {
    const p = settings ? billingPeriod(settings as any) : null;
    if (p) {
      const endShown = new Date(new Date(`${p.end}T00:00:00`).getTime() - 86400000).toISOString().slice(0, 10);
      periodLabel = `${shortDate(p.start)} – ${shortDate(endShown)}`;
    }
  } catch {
    periodLabel = "";
  }

  // A PM should never see a draft or a voided invoice — only what we issued.
  const visible = isAdmin ? invoices : invoices.filter((i) => ["sent", "paid", "partial"].includes(i.status));

  return (
    <div className="space-y-5">
      {/* ─────────────── test-mode banner ─────────────── */}
      {isAdmin && settings?.send_mode !== "live" && (
        <div className="flex items-start gap-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <div className="font-semibold">Test mode — the customer receives nothing.</div>
            Invoices sent from here go only to the internal test recipients, with <code>[TEST]</code> on the subject.
            Switch this property to live only once a test invoice looks right.
          </div>
        </div>
      )}

      {/* ─────────────── settings ─────────────── */}
      {isAdmin && (
      <Card className="shadow-sm border-primary/20">
        <CardHeader className="pb-3 pt-4 border-b bg-primary/[0.06]">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            Billing setup
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">How they're billed</Label>
            <Select value={settings?.billing_mode ?? "per_service"} onValueChange={(v) => saveSetting({ billing_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cadence">On a recurring cycle</SelectItem>
                <SelectItem value="per_service">After each service</SelectItem>
                <SelectItem value="manual">One-time bills only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {settings?.billing_mode === "cadence" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Billing cycle</Label>
              <Select value={settings?.cadence ?? ""} onValueChange={(v) => saveSetting({ cadence: v })}>
                <SelectTrigger><SelectValue placeholder="Pick one" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="4_weeks">Every 4 weeks</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Not the same as how often we visit.</p>
            </div>
          )}

          {settings?.billing_mode === "cadence" && settings?.cadence === "4_weeks" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">First period started</Label>
              <Input
                type="date"
                defaultValue={settings?.cadence_anchor ?? ""}
                onBlur={(e) => e.target.value !== (settings?.cadence_anchor ?? "") && saveSetting({ cadence_anchor: e.target.value || null })}
              />
              {!settings?.cadence_anchor && (
                <p className="text-[11px] text-amber-700 font-medium">Required — a 4-week cycle needs a start date.</p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Base price is charged</Label>
            <Select value={settings?.base_price_basis ?? "per_period"} onValueChange={(v) => saveSetting({ base_price_basis: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="per_period">Once per invoice</SelectItem>
                <SelectItem value="per_visit">Once per visit</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Payment terms (days)</Label>
            <Input
              type="number"
              defaultValue={settings?.payment_terms_days ?? 30}
              onBlur={(e) => Number(e.target.value) !== settings?.payment_terms_days && saveSetting({ payment_terms_days: Number(e.target.value) || 30 })}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Sending</Label>
            <Select value={settings?.send_mode ?? "test"} onValueChange={(v) => saveSetting({ send_mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Test — internal only</SelectItem>
                <SelectItem value="live">Live — reaches the customer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>

        {/* Billing contact — deliberately separate from the property contact:
            whoever books the service is rarely whoever pays the bill. */}
        <CardContent className="pt-0 pb-4 border-t mt-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide pt-4 pb-3">
            Who the invoice goes to
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Billing contact name</Label>
              <Input
                defaultValue={settings?.billing_contact_name ?? ""}
                placeholder="e.g. Accounts Payable"
                onBlur={(e) =>
                  e.target.value !== (settings?.billing_contact_name ?? "") &&
                  saveSetting({ billing_contact_name: e.target.value.trim() || null })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Billing email</Label>
              <Input
                type="email"
                defaultValue={settings?.billing_contact_email ?? ""}
                placeholder="ap@property.com"
                onBlur={(e) =>
                  e.target.value !== (settings?.billing_contact_email ?? "") &&
                  saveSetting({ billing_contact_email: e.target.value.trim() || null })
                }
              />
              <p className="text-[11px] text-muted-foreground">Can be different from the property's main contact.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Also CC (customer side)</Label>
              <Input
                defaultValue={emailList(settings?.invoice_cc)}
                placeholder="manager@property.com, owner@property.com"
                onBlur={(e) =>
                  e.target.value !== emailList(settings?.invoice_cc) &&
                  saveSetting({ invoice_cc: parseEmails(e.target.value) })
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Crest team CC</Label>
              <Input
                defaultValue={emailList(settings?.crest_cc)}
                placeholder="office@crestpestcontrol.com, caleb@crestpestco.com"
                onBlur={(e) =>
                  e.target.value !== emailList(settings?.crest_cc) &&
                  saveSetting({ crest_cc: parseEmails(e.target.value) })
                }
              />
              <p className="text-[11px] text-muted-foreground">Copied on every live invoice for this property.</p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs font-semibold">Test sends go to</Label>
              <Input
                defaultValue={emailList(settings?.test_recipients)}
                placeholder="office@crestpestcontrol.com, caleb@crestpestco.com (default)"
                onBlur={(e) =>
                  e.target.value !== emailList(settings?.test_recipients) &&
                  saveSetting({ test_recipients: parseEmails(e.target.value) })
                }
              />
              <p className="text-[11px] text-muted-foreground">
                While this property is in test mode these are the only recipients — no customer CC, ever.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      )}

      {/* ═══════════ RECURRING BILLING ═══════════ */}
      {isAdmin && settings?.billing_mode === "cadence" && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3 pt-4 border-b flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <Repeat className="w-5 h-5 text-primary" />
                Recurring bill
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                {periodLabel
                  ? `This period: ${periodLabel}`
                  : "Set the billing cycle above to open a period."}
              </p>
            </div>
            <Button size="sm" onClick={buildCadence} disabled={building !== null}>
              {building === "cadence" ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Build this period"}
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {draft?.kind === "cadence" ? (
              <DraftPreview draft={draft} onDiscard={() => setDraft(null)} onSave={save} saving={saving} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Sweeps up every completed visit in this billing period that hasn't been invoiced — the recurring
                charge plus any units over the plan.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════ ONE-TIME BILL ═══════════ */}
      {isAdmin && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3 pt-4 border-b flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                One-time bill
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                A standalone charge — no cycle, no recurring line.
              </p>
            </div>
            <Button
              size="sm"
              variant={settings?.billing_mode === "cadence" ? "outline" : "default"}
              onClick={buildOneTime}
              disabled={building !== null || (pickedVisits.length === 0 && customLines.length === 0)}
            >
              {building === "one_time" ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Build this bill"}
            </Button>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            {draft?.kind === "one_time" ? (
              <DraftPreview draft={draft} onDiscard={() => setDraft(null)} onSave={save} saving={saving} />
            ) : (
              <>
                <div>
                  <Label className="text-xs font-semibold">Visits not yet invoiced</Label>
                  {billable.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Every completed visit here has already been invoiced.
                    </p>
                  ) : (
                    <div className="mt-2 border rounded-lg divide-y max-h-64 overflow-y-auto">
                      {billable.map((v) => (
                        <label key={v.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40">
                          <Checkbox
                            checked={pickedVisits.includes(v.id)}
                            onCheckedChange={(c) =>
                              setPickedVisits((prev) => (c ? [...prev, v.id] : prev.filter((x) => x !== v.id)))
                            }
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">
                              <span className="text-muted-foreground mr-2">{shortDate(v.service_date)}</span>
                              {v.service_type}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {v.units_total > 0 && <>{v.units_total} units treated</>}
                              {v.units_over > 0 && <> · {v.units_over} over the plan</>}
                              {v.billing_type && v.billing_type !== "plan" && <> · {v.billing_type.replace("_", " ")}</>}
                            </div>
                          </div>
                          <span className="text-sm font-semibold tabular-nums shrink-0">
                            {money(v.suggested_amount)}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-semibold">Anything else to charge</Label>
                  <div className="mt-2 space-y-2">
                    {customLines.map((c, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          className="flex-1"
                          placeholder="Description"
                          value={c.description}
                          onChange={(e) =>
                            setCustomLines(customLines.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                          }
                        />
                        <Input
                          className="w-20"
                          type="number"
                          placeholder="Qty"
                          value={c.quantity}
                          onChange={(e) =>
                            setCustomLines(customLines.map((x, j) => (j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x)))
                          }
                        />
                        <Input
                          className="w-28"
                          type="number"
                          placeholder="Price"
                          value={c.unit_price}
                          onChange={(e) =>
                            setCustomLines(customLines.map((x, j) => (j === i ? { ...x, unit_price: Number(e.target.value) || 0 } : x)))
                          }
                        />
                        <Button variant="ghost" size="icon" onClick={() => setCustomLines(customLines.filter((_, j) => j !== i))}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setCustomLines([...customLines, { description: "", quantity: 1, unit_price: 0 }])}
                    >
                      <Plus className="w-3 h-3 mr-1" /> Add a line
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─────────────── front desk checklist ─────────────── */}
      {isAdmin && toKeyIn.length > 0 && (
        <Card className="shadow-sm border-blue-300">
          <CardHeader className="pb-3 pt-4 border-b bg-blue-50">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-700" />
              Needs keying into FieldRoutes
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            <p className="text-xs text-muted-foreground">
              Recurring service already bills itself in FieldRoutes. Only these extras need entering so AR ties.
            </p>
            {toKeyIn.map((inv) => {
              const extras = (inv.portal_invoice_lines ?? []).filter(
                (l: any) => l.fr_entry_required ?? l.line_type !== "base"
              );
              const sum = extras.reduce((s: number, l: any) => s + Number(l.amount || 0), 0);
              return (
                <div key={inv.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-semibold">{inv.invoice_number}</span>
                    <span className="text-sm font-bold tabular-nums">{money(sum)}</span>
                  </div>
                  {extras.map((l: any) => (
                    <div key={l.id} className="text-xs text-muted-foreground flex justify-between gap-3">
                      <span>{shortDate(l.service_date)} · {l.description}</span>
                      <span className="tabular-nums">{money(l.amount)}</span>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs"
                    onClick={async () => {
                      await supabase
                        .from("portal_invoices")
                        .update({ fieldroutes_status: "matched", fieldroutes_matched_at: new Date().toISOString() })
                        .eq("id", inv.id);
                      await load();
                    }}
                  >
                    Entered in FieldRoutes
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* ─────────────── invoice list ─────────────── */}
      <Card className="shadow-sm">
        <CardHeader className="pb-3 pt-4 border-b">
          <CardTitle className="text-base font-bold">
            {isAdmin ? "Invoices" : "Invoice history"}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices yet.</p>
          ) : (
            <div className="space-y-2">
              {visible.map((inv) => (
                <div key={inv.id} className="space-y-1">
                  <InvoiceCard
                    invoice={inv}
                    property={{ name: propertyName, address: propertyAddress }}
                    clientName={clientName}
                    isAdmin={isAdmin}
                    onChanged={load}
                  />
                  {isAdmin && inv.status !== "draft" && inv.status !== "void" && (
                    <div className="flex justify-end">
                      {inv.status === "paid" ? (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPaid(inv.id, false)}>
                          <X className="w-3 h-3 mr-1" /> Mark not paid
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setPaid(inv.id, true)}>
                          <Check className="w-3 h-3 mr-1" /> Mark paid
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default BillingTab;
