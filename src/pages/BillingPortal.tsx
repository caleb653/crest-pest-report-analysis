/**
 * Customer-facing billing portal — /billing/:token
 *
 * One page a property-management company opens to see every invoice across
 * the properties we've put on it: each property is its own tile with what's
 * been billed, what's paid and what's still due, and under it every issued
 * invoice with the units behind each line.
 *
 * Read-only by design. Which properties appear here is decided on the admin
 * side (a portal_links row of type "billing"); nothing on this page can change
 * it. Drafts, voided invoices and invoices an admin hid never show.
 */

import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import crestLogo from "@/assets/crest-logo.png";
import { InvoiceCard } from "@/components/portal/InvoiceCard";
import { periodMonthKey, monthLabel, fetchInvoiceExtras } from "@/lib/invoiceBuilder";
import { Building2, CheckCircle2, Clock, Receipt, MapPin } from "lucide-react";

const money = (n: number | null | undefined) =>
  `$${(Number(n) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  client_id: string;
}

const ISSUED = ["sent", "paid", "partial"];

const BillingPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const [clientName, setClientName] = useState<string | null>(null);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  const load = async () => {
    if (!token) return;
    setLoading(true);

    const { data: link } = await supabase
      .from("portal_links")
      .select("*")
      .eq("token", token)
      .eq("link_type", "billing")
      .eq("is_active", true)
      .maybeSingle();

    if (!link) {
      setError("This billing link is invalid or has been turned off.");
      setLoading(false);
      return;
    }

    const ids = Array.isArray(link.assigned_property_ids) ? (link.assigned_property_ids as string[]) : [];
    if (ids.length === 0) {
      setError("No properties have been added to this billing portal yet.");
      setLoading(false);
      return;
    }

    const [{ data: props }, { data: client }, { data: inv }] = await Promise.all([
      supabase
        .from("portal_properties")
        .select("id, name, address, client_id")
        .in("id", ids)
        .is("archived_at", null)
        .order("name"),
      supabase.from("portal_clients").select("name, company").eq("id", link.client_id).maybeSingle(),
      supabase
        .from("portal_invoices")
        .select(
          "*, portal_invoice_lines(id, sort_order, line_type, description, detail, service_date, quantity, unit_price, amount, units_snapshot)"
        )
        .in("property_id", ids)
        .in("status", ISSUED)
        .order("issue_date", { ascending: false }),
    ]);

    setLabel(link.label);
    setClientName(client?.company || client?.name || null);
    setProperties((props as PropertyRow[]) ?? []);
    // Hidden invoices are an admin choice (Billing tab → "Hide from customer");
    // names ("August invoice") come from the same log.
    const { hidden, titles } = await fetchInvoiceExtras((inv ?? []).map((i: any) => i.id));
    setInvoices(
      (inv ?? [])
        .filter((i: any) => !hidden.has(i.id))
        .map((i: any) => ({ ...i, _title: titles.get(i.id) ?? null }))
    );
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Totals across everything on the portal, and per property.
  const totals = useMemo(() => {
    const sum = (list: any[], key: string) => list.reduce((t, i) => t + (Number(i[key]) || 0), 0);
    const perProperty: Record<string, { billed: number; paid: number; due: number; count: number }> = {};
    for (const p of properties) {
      const mine = invoices.filter((i) => i.property_id === p.id);
      perProperty[p.id] = {
        billed: sum(mine, "total"),
        paid: sum(mine, "amount_paid"),
        due: sum(mine, "balance"),
        count: mine.length,
      };
    }
    return {
      billed: sum(invoices, "total"),
      paid: sum(invoices, "amount_paid"),
      due: sum(invoices, "balance"),
      perProperty,
    };
  }, [invoices, properties]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <img src={crestLogo} alt="Crest Pest Control" className="h-16 mx-auto mb-4 animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading your invoices…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="p-8 text-center">
            <img src={crestLogo} alt="Crest Pest Control" className="h-16 mx-auto mb-4" />
            <p className="text-destructive font-medium">{error}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Please contact Crest Pest Control if you believe this is an error.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafaf9]">
      {/* ─── hero ─── */}
      <header className="bg-gradient-to-br from-[#f2f6f2] via-[#fafaf9] to-[#e9efe9] border-b border-[#dde2dd]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
            <div>
              <img src={crestLogo} alt="Crest Pest Control" className="h-12 sm:h-14 mb-5" />
              <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#95a197]">Billing portal</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-[#2a2a2a] mt-1">
                {label || clientName || "Your invoices"}
              </h1>
              {clientName && label && <p className="text-sm text-[#6e746e] mt-1">{clientName}</p>}
            </div>

            {/* portal-wide totals */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 sm:min-w-[420px]">
              <Stat label="Billed" value={money(totals.billed)} />
              <Stat label="Paid" value={money(totals.paid)} tone="good" />
              <Stat label="Outstanding" value={money(totals.due)} tone={totals.due > 0 ? "due" : "good"} />
            </div>
          </div>
        </div>
      </header>

      {/* ─── one tile per property ─── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {properties.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">No properties on this portal yet.</p>
        )}

        {properties.map((p) => {
          const t = totals.perProperty[p.id];
          const mine = invoices.filter((i) => i.property_id === p.id);
          const byMonth = (
            Object.entries(
              mine.reduce((acc: Record<string, any[]>, inv) => {
                const key = periodMonthKey(inv.period_start ?? inv.issue_date);
                (acc[key] ||= []).push(inv);
                return acc;
              }, {} as Record<string, any[]>)
            ) as [string, any[]][]
          ).sort((a, b) => b[0].localeCompare(a[0]));

          return (
            <section key={p.id} className="bg-white rounded-2xl border border-[#dde2dd] shadow-sm overflow-hidden">
              {/* property header */}
              <div className="px-5 sm:px-7 py-5 sm:py-6 bg-gradient-to-r from-[#f2f6f2] to-white border-b border-[#dde2dd]">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-[#c3d1c5] flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-[#2a2a2a]" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-lg sm:text-xl font-bold text-[#2a2a2a] leading-tight">{p.name}</h2>
                      {p.address && (
                        <p className="text-sm text-[#6e746e] flex items-center gap-1 mt-0.5">
                          <MapPin className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{p.address}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap md:justify-end">
                    <Pill icon={Receipt}>
                      {t.count} invoice{t.count === 1 ? "" : "s"} · {money(t.billed)}
                    </Pill>
                    <Pill icon={CheckCircle2} tone="good">Paid {money(t.paid)}</Pill>
                    {t.due > 0 ? (
                      <Pill icon={Clock} tone="due">Due {money(t.due)}</Pill>
                    ) : (
                      <Pill icon={CheckCircle2} tone="good">Nothing outstanding</Pill>
                    )}
                  </div>
                </div>
              </div>

              {/* invoices by month */}
              <div className="px-4 sm:px-7 py-5 space-y-6">
                {mine.length === 0 && (
                  <p className="text-sm text-[#6e746e] py-4 text-center">No invoices issued for this property yet.</p>
                )}
                {byMonth.map(([key, group]) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#95a197]">
                        {monthLabel(key)}
                      </h3>
                      <span className="text-xs text-[#6e746e] tabular-nums">
                        {money(group.reduce((s, i) => s + Number(i.total || 0), 0))}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {group.map((inv) => (
                        <InvoiceCard
                          key={inv.id}
                          invoice={inv}
                          property={{ name: p.name, address: p.address }}
                          clientName={clientName}
                          isAdmin={false}
                          onChanged={load}
                          defaultOpen
                          headerBadge={
                            inv.status === "paid" ? (
                              <Badge className="bg-emerald-100 text-emerald-900 text-[10px]">Paid</Badge>
                            ) : (
                              <Badge className="bg-amber-100 text-amber-900 text-[10px] whitespace-nowrap">
                                Due {money(inv.balance)}
                              </Badge>
                            )
                          }
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </main>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 pb-10 pt-2 text-center text-xs text-[#95a197]">
        Crest Pest Control · 949-424-5000 · office@crestpestcontrol.com
      </footer>
    </div>
  );
};

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "due" }) {
  const color = tone === "good" ? "text-emerald-800" : tone === "due" ? "text-amber-800" : "text-[#2a2a2a]";
  return (
    <div className="bg-white/80 backdrop-blur rounded-xl border border-[#dde2dd] px-3 sm:px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#95a197]">{label}</p>
      <p className={`text-base sm:text-xl font-bold tabular-nums mt-0.5 ${color}`}>{value}</p>
    </div>
  );
}

function Pill({
  children,
  icon: Icon,
  tone,
}: {
  children: React.ReactNode;
  icon: any;
  tone?: "good" | "due";
}) {
  const cls =
    tone === "good"
      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
      : tone === "due"
      ? "bg-amber-50 text-amber-900 border-amber-200"
      : "bg-[#f2f6f2] text-[#2a2a2a] border-[#dde2dd]";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cls}`}>
      <Icon className="w-3.5 h-3.5" />
      {children}
    </span>
  );
}

export default BillingPortal;
