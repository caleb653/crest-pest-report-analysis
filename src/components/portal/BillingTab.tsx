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
import { AlertTriangle, FileText, Receipt, RefreshCw, ClipboardList, Check, X, Repeat, Plus, Trash2, Pencil } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  buildDraftInvoice,
  buildOneTimeInvoice,
  saveDraftInvoice,
  listBillableVisits,
  recentPeriods,
  setVisitPrice,
  listOpenInvoices,
  addVisitsToInvoice,
  firstCompletedServiceDate,
  periodMonthKey,
  monthLabel,
  backfillInvoices,
  type DraftInvoice,
  type BillableVisit,
  type CustomLine,
  type OpenInvoice,
} from "@/lib/invoiceBuilder";
import { InvoiceCard } from "@/components/portal/InvoiceCard";

/** jsonb email list <-> the comma-separated text the inputs show. */
const emailList = (v: unknown): string => (Array.isArray(v) ? v : []).map((e: any) => (typeof e === "string" ? e : e?.email)).filter(Boolean).join(", ");
const parseEmails = (s: string): string[] =>
  s.split(/[,;\s]+/).map((e) => e.trim()).filter((e) => e.includes("@"));

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

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


/**
 * A built draft, fully editable before it is saved.
 *
 * Everything the builder worked out is a starting point, never a verdict: any
 * line can be reworded, repriced, removed, and new lines typed from scratch —
 * on a recurring bill exactly as on a one-time one.
 */
function DraftPreview({
  draft,
  onChange,
  onDiscard,
  onSave,
  saving,
}: {
  draft: DraftInvoice;
  onChange: (d: DraftInvoice) => void;
  onDiscard: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const recalc = (lines: DraftInvoice["lines"]): DraftInvoice => ({
    ...draft,
    lines: lines.map((l, i) => ({ ...l, sort_order: i, amount: round2(l.quantity * l.unit_price) })),
    subtotal: round2(lines.reduce((s, l) => s + l.quantity * l.unit_price, 0)),
  });

  const patch = (i: number, p: Partial<DraftInvoice["lines"][number]>) =>
    onChange(recalc(draft.lines.map((l, j) => (j === i ? { ...l, ...p } : l))));

  const remove = (i: number) => onChange(recalc(draft.lines.filter((_, j) => j !== i)));

  const add = () =>
    onChange(
      recalc([
        ...draft.lines,
        {
          sort_order: draft.lines.length,
          line_type: "custom",
          service_id: null,
          description: "",
          detail: null,
          service_date: null,
          quantity: 1,
          unit_price: 0,
          taxable: false,
          units_snapshot: null,
          fr_entry_required: null,
          amount: 0,
        },
      ])
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          {draft.period_start ? `${shortDate(draft.period_start)} – ${shortDate(draft.period_end)}` : "One-time bill"}
          {draft.po_number && <> · PO {draft.po_number}</>}
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditing((e) => !e)}>
          <Pencil className="w-3 h-3 mr-1" /> {editing ? "Done editing" : "Edit lines"}
        </Button>
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
        {draft.lines.map((l, i) =>
          editing ? (
            <div key={i} className="p-2.5 space-y-2">
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  placeholder="Description"
                  value={l.description}
                  onChange={(e) => patch(i, { description: e.target.value })}
                />
                <Input
                  className="w-20"
                  type="number"
                  value={l.quantity}
                  onChange={(e) => patch(i, { quantity: Number(e.target.value) || 0 })}
                />
                <Input
                  className="w-28"
                  type="number"
                  value={l.unit_price}
                  onChange={(e) => patch(i, { unit_price: Number(e.target.value) || 0 })}
                />
                <div className="w-24 flex items-center justify-end text-sm font-semibold tabular-nums">
                  {money(l.amount)}
                </div>
                <Button variant="ghost" size="icon" onClick={() => remove(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              {l.detail && (
                <div className="text-[11px] text-muted-foreground whitespace-pre-line pl-1">{l.detail}</div>
              )}
            </div>
          ) : (
            <div key={i} className="p-3 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium">{l.description || <span className="text-muted-foreground italic">Untitled line</span>}</div>
                {l.detail && <div className="text-xs text-muted-foreground whitespace-pre-line mt-0.5">{l.detail}</div>}
              </div>
              <div className="text-sm font-semibold tabular-nums shrink-0">{money(l.amount)}</div>
            </div>
          )
        )}
        {draft.lines.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground text-center">Nothing on this bill yet.</div>
        )}
      </div>

      {editing && (
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={add}>
          <Plus className="w-3 h-3 mr-1" /> Add a line
        </Button>
      )}

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

  // Which billing period the recurring bill is being built for. Defaults to the
  // current one; prior periods are selectable so a missed month can be caught up.
  const [pickedPeriod, setPickedPeriod] = useState<string>("");

  // Hand-typed price for a picked visit, keyed by service id.
  const [visitAmounts, setVisitAmounts] = useState<Record<string, number | "">>({});

  // Invoices a picked visit can be dropped onto, and which one is chosen.
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [destination, setDestination] = useState<string>("new_one_time");

  // The day the first service was completed — where a cycle naturally starts.
  const [firstService, setFirstService] = useState<string | null>(null);
  const [backfilling, setBackfilling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: inv }] = await Promise.all([
      supabase.from("portal_billing_settings").select("*").eq("property_id", propertyId).maybeSingle(),
      supabase
        .from("portal_invoices")
        .select("*, portal_invoice_lines(id, sort_order, line_type, service_id, description, detail, service_date, quantity, unit_price, amount, fr_entry_required, units_snapshot)")
        .eq("property_id", propertyId)
        .order("issue_date", { ascending: false })
        .limit(50),
    ]);
    setSettings(s ?? null);
    // Admins see everything (hidden ones are badged); customers never see an
    // invoice an admin chose to hide.
    setInvoices((inv ?? []).filter((i: any) => isAdmin || i.hidden_from_portal !== true));
    if (isAdmin) {
      try {
        const [b, o, f] = await Promise.all([
          listBillableVisits(propertyId),
          listOpenInvoices(propertyId),
          firstCompletedServiceDate(propertyId),
        ]);
        setBillable(b);
        setOpenInvoices(o);
        setFirstService(f);
      } catch {
        setBillable([]);
        setOpenInvoices([]);
      }
    }
    setLoading(false);
  }, [propertyId, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  // A recurring property with no cycle start gets one from its first completed
  // service — billing then runs from the day service actually began, instead of
  // opening with a stub part-month. Adjustable afterwards like everything else.
  useEffect(() => {
    if (!isAdmin || !settings || settings.billing_mode !== "cadence") return;
    if (settings.cadence_anchor || !firstService) return;
    saveSetting({ cadence_anchor: firstService });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, settings?.billing_mode, settings?.cadence_anchor, firstService]);

  // Default to the current period once the cycle is known; leave a manual pick alone.
  useEffect(() => {
    if (pickedPeriod || !settings) return;
    const p = recentPeriods(settings as any, 1)[0];
    if (p) setPickedPeriod(p.start);
  }, [settings, pickedPeriod]);

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
      const p = periods.find((x) => x.start === pickedPeriod) ?? periods[0];
      setDraft(await buildDraftInvoice(propertyId, p ? { periodStart: p.start, periodEnd: p.end } : {}));
    } catch (e: any) {
      // A 4-week property with no anchor lands here by design — it refuses to
      // guess the window rather than bill the wrong visits.
      toast({ title: "Can't build this period yet", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBuilding(null);
    }
  };

  /** Reconstruct the invoices history implies but nobody ever built. */
  const runBackfill = async () => {
    setBackfilling(true);
    try {
      const { created, periods, skipped } = await backfillInvoices(propertyId, { actor: "admin" });
      toast({
        title: created ? `${created} draft invoice${created === 1 ? "" : "s"} created` : "Nothing to create",
        description: created
          ? `${periods.join(", ")}. All drafts — review them before sending anything.`
          : skipped.slice(0, 3).join(" · ") || "Every period is already invoiced.",
      });
      await load();
    } catch (e: any) {
      toast({ title: "Could not build the history", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBackfilling(false);
    }
  };

  /** Price sticks to the visit as soon as the field loses focus. */
  const savePrice = async (serviceId: string, raw: string) => {
    const amount = raw.trim() === "" ? null : Number(raw);
    if (amount !== null && !Number.isFinite(amount)) return;
    try {
      await setVisitPrice(serviceId, amount);
      setBillable((prev) =>
        prev.map((v) =>
          v.id === serviceId
            ? { ...v, billing_type: amount === null ? "plan" : "billable", suggested_amount: amount ?? 0 }
            : v
        )
      );
    } catch (e: any) {
      toast({ title: "Could not save that price", description: e?.message ?? String(e), variant: "destructive" });
    }
  };

  /** Put the picked visits on an existing invoice, or start a new one-time bill. */
  const placeVisits = async () => {
    if (destination === "new_one_time") {
      await buildOneTime();
      return;
    }
    setBuilding("one_time");
    try {
      const { added, skipped } = await addVisitsToInvoice(destination, pickedVisits, "admin");
      const target = openInvoices.find((i) => i.id === destination);
      if (added === 0) {
        toast({
          title: "Nothing was added",
          description: skipped.join(" · ") || "Those visits had nothing chargeable on them.",
          variant: "destructive",
        });
      } else {
        toast({
          title: `Added to ${target?.invoice_number ?? "the invoice"}`,
          description:
            `${added} line${added === 1 ? "" : "s"} added.` + (skipped.length ? ` Skipped: ${skipped.join(" · ")}` : ""),
        });
        setPickedVisits([]);
      }
      await load();
    } catch (e: any) {
      toast({ title: "Could not add to that invoice", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setBuilding(null);
    }
  };

  const buildOneTime = async () => {
    setBuilding("one_time");
    try {
      setDraft(
        await buildOneTimeInvoice(propertyId, {
          serviceIds: pickedVisits,
          customLines,
          amountOverrides: Object.fromEntries(
            Object.entries(visitAmounts).filter(([, v]) => v !== "" && Number.isFinite(Number(v)))
          ) as Record<string, number>,
        })
      );
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
      setVisitAmounts({});
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

  // Selectable billing periods, newest first. A 4-week property with no anchor
  // yields none rather than guessing a window.
  const periods = settings ? recentPeriods(settings as any, 12) : [];

  // Periods that already carry an invoice, so the picker can say so.
  const invoicedPeriods = new Set(
    invoices.filter((i) => i.kind !== "one_time" && i.period_start).map((i) => String(i.period_start))
  );

  // A PM should never see a draft or a voided invoice — only what we issued.
  const visible = isAdmin ? invoices : invoices.filter((i) => ["sent", "paid", "partial"].includes(i.status));

  // Grouped by the month the period falls in (or the issue date for a one-off),
  // newest month first, so a year of billing reads at a glance.
  const byMonth = Object.entries<any[]>(
    visible.reduce((acc: Record<string, any[]>, inv) => {
      const key = periodMonthKey(inv.period_start ?? inv.issue_date);
      (acc[key] ||= []).push(inv);
      return acc;
    }, {})
  ).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="space-y-5">
      {/* ─────────────── test-mode banner ─────────────── */}
      {isAdmin && settings?.send_mode === "live" && (
        <div className="flex items-start gap-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-4">
          <AlertTriangle className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="text-sm text-emerald-900">
            <div className="font-semibold">
              Live billing — invoices email the customer with the PDF attached.
            </div>
            {settings?.billing_contact_email
              ? <>Sends to <strong>{settings.billing_contact_email}</strong>.</>
              : <>Add a billing email below first — a live invoice can't send without one.</>}
          </div>
        </div>
      )}

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

          {settings?.billing_mode === "cadence" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cycle starts</Label>
              <Input
                key={settings?.cadence_anchor ?? "none"}
                type="date"
                defaultValue={settings?.cadence_anchor ?? ""}
                onBlur={(e) =>
                  e.target.value !== (settings?.cadence_anchor ?? "") &&
                  saveSetting({ cadence_anchor: e.target.value || null })
                }
              />
              <p className="text-[11px] text-muted-foreground">
                {settings?.cadence_anchor
                  ? firstService === settings.cadence_anchor
                    ? "Set from the first completed service. Change it if you want."
                    : "Set by hand."
                  : settings?.cadence === "4_weeks"
                  ? "Required — a 4-week cycle needs a start date."
                  : "Blank bills on plain calendar months."}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Recurring price</Label>
            <div className="h-10 flex items-center rounded-md border bg-muted/40 px-3 text-sm">
              Once per billing period
            </div>
            <p className="text-[11px] text-muted-foreground">
              Covers every visit in the period, however many there are — two fortnightly visits in a month are still
              one charge.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Units on the invoice</Label>
            <Select value={settings?.unit_line_style ?? "summary"} onValueChange={(v) => saveSetting({ unit_line_style: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="summary">One line per visit — qty × per-unit price</SelectItem>
                <SelectItem value="itemized">A priced line for every unit</SelectItem>
                <SelectItem value="flat">One price for the day — units listed only</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Every unit treated is listed either way — this only decides whether money is attached to each one.
            </p>
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
                {periods.length
                  ? "Any period, not just the current one — catch up on ones you missed."
                  : "Set the billing cycle above to open a period."}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {periods.length > 0 && (
                <Select value={pickedPeriod} onValueChange={setPickedPeriod}>
                  <SelectTrigger className="w-52 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {periods.map((p, i) => (
                      <SelectItem key={p.start} value={p.start}>
                        {p.label}
                        {i === 0 ? " (current)" : ""}
                        {invoicedPeriods.has(p.start) ? " · billed" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" onClick={buildCadence} disabled={building !== null || !periods.length}>
                {building === "cadence" ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Build"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {draft?.kind === "cadence" ? (
              <DraftPreview draft={draft} onChange={setDraft} onDiscard={() => setDraft(null)} onSave={save} saving={saving} />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Sweeps up every completed visit in the chosen period that hasn't been invoiced — the recurring
                  charge plus any units over the plan. Everything stays editable before you save.
                </p>
                {invoicedPeriods.has(pickedPeriod) && (
                  <div className="mt-3 flex gap-2 text-xs text-amber-900 bg-amber-50 border border-amber-300 rounded-lg p-2.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    This period already has an invoice. Building again only picks up visits that were never billed.
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* ═══════════ PRICE & BILL VISITS ═══════════ */}
      {isAdmin && (
        <Card className="shadow-sm">
          <CardHeader className="pb-3 pt-4 border-b">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <FileText className="w-5 h-5 text-primary" />
              Price &amp; bill visits
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Give a visit a price, then put it on whichever invoice you want — an open draft for a past period,
              or a fresh one-time bill.
            </p>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            {draft?.kind === "one_time" ? (
              <DraftPreview draft={draft} onChange={setDraft} onDiscard={() => setDraft(null)} onSave={save} saving={saving} />
            ) : (
              <>
                <div>
                  <Label className="text-xs font-semibold">Visits not yet invoiced</Label>
                  {billable.length === 0 ? (
                    <p className="text-sm text-muted-foreground mt-2">
                      Every completed visit here has already been invoiced.
                    </p>
                  ) : (
                    <div className="mt-2 border rounded-lg divide-y max-h-80 overflow-y-auto">
                      {billable.map((v) => {
                        const priced = visitAmounts[v.id] ?? (v.suggested_amount > 0 ? v.suggested_amount : "");
                        return (
                          <div key={v.id} className="flex items-center gap-3 p-2.5 hover:bg-muted/40">
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
                                {v.billing_type === "billable" && <> · priced</>}
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center gap-1.5">
                              <span className="text-xs text-muted-foreground">$</span>
                              <Input
                                className="h-8 w-24 text-right"
                                type="number"
                                placeholder="Plan"
                                value={priced}
                                onChange={(e) =>
                                  setVisitAmounts({
                                    ...visitAmounts,
                                    [v.id]: e.target.value === "" ? ("" as any) : Number(e.target.value),
                                  })
                                }
                                onBlur={(e) => savePrice(v.id, e.target.value)}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    A price saves to the visit itself the moment you leave the box — it becomes a paid service whether
                    or not you bill it today. Leave it blank for "covered by the plan".
                  </p>
                </div>

                {/* where the picked visits go */}
                {pickedVisits.length > 0 && (
                  <div className="rounded-lg border-2 border-primary/30 bg-primary/[0.03] p-3 space-y-2">
                    <Label className="text-xs font-semibold">
                      Put {pickedVisits.length} visit{pickedVisits.length === 1 ? "" : "s"} on
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      <Select value={destination} onValueChange={setDestination}>
                        <SelectTrigger className="w-72 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="new_one_time">A new one-time bill</SelectItem>
                          {openInvoices.map((inv) => (
                            <SelectItem key={inv.id} value={inv.id}>{inv.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button size="sm" onClick={placeVisits} disabled={building !== null}>
                        {building === "one_time" ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Add"}
                      </Button>
                    </div>
                    {openInvoices.length === 0 && (
                      <p className="text-[11px] text-muted-foreground">
                        No open invoices to add to — build one above, or unlock a sent invoice to reopen it.
                      </p>
                    )}
                  </div>
                )}

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
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setCustomLines([...customLines, { description: "", quantity: 1, unit_price: 0 }])}
                      >
                        <Plus className="w-3 h-3 mr-1" /> Add a line
                      </Button>
                      {customLines.length > 0 && (
                        <Button size="sm" className="h-7 text-xs" onClick={buildOneTime} disabled={building !== null}>
                          Build one-time bill
                        </Button>
                      )}
                    </div>
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
        <CardHeader className="pb-3 pt-4 border-b flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base font-bold">
            {isAdmin ? "Invoices" : "Invoice history"}
          </CardTitle>
          {isAdmin && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={runBackfill} disabled={backfilling}>
              {backfilling ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <>Build missing invoices</>
              )}
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-4">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No invoices yet.</p>
          ) : (
            <div className="space-y-5">
              {byMonth.map(([key, group]) => (
                <div key={key}>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      {monthLabel(key)}
                    </h4>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {group.length} invoice{group.length === 1 ? "" : "s"} ·{" "}
                      {money(group.reduce((t, i) => t + Number(i.total || 0), 0))}
                    </span>
                  </div>
                  <div className="space-y-2">
              {group.map((inv) => (
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
