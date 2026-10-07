/**
 * Admin: customer billing portals.
 *
 * A billing portal is a portal_links row of type "billing". The admin picks
 * which properties appear on it; the customer opens /billing/<token> and sees
 * those properties as tiles with every issued invoice, paid vs outstanding,
 * and the units behind each line.
 *
 * Only this screen can change which properties are on a portal — the
 * customer page is read-only.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Copy, ExternalLink, Plus, Receipt, Power, Pencil, Check, X, CreditCard } from "lucide-react";
import { fetchLoginLinks, billingPropertyLinkKey, setBillingPropertyPaymentLink } from "@/lib/frLoginLinks";

interface ClientRow { id: string; name: string; company: string | null }
interface PropertyRow { id: string; name: string; address: string | null; client_id: string; fieldroutes_customer_id: string | null }
interface LinkRow {
  id: string;
  client_id: string;
  token: string;
  label: string | null;
  assigned_property_ids: any;
  is_active: boolean;
  created_at: string;
}

const portalUrl = (token: string) => `${window.location.origin}/billing/${token}`;

export function BillingPortalsAdmin() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [portals, setPortals] = useState<LinkRow[]>([]);
  /** property id -> pasted payment link (that property's FieldPortals account). */
  const [paymentLinks, setPaymentLinks] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  // new portal form
  const [creating, setCreating] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newClient, setNewClient] = useState<string>("");
  const [newProps, setNewProps] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  // editing an existing portal's name and property list
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editProps, setEditProps] = useState<string[]>([]);
  const [editLabel, setEditLabel] = useState("");
  const [editPayLinks, setEditPayLinks] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: c }, { data: p }, { data: l }] = await Promise.all([
      supabase.from("portal_clients").select("id, name, company").order("name"),
      supabase.from("portal_properties").select("id, name, address, client_id, fieldroutes_customer_id").is("archived_at", null).order("name"),
      supabase.from("portal_links").select("*").eq("link_type", "billing").order("created_at", { ascending: false }),
    ]);
    setClients((c as ClientRow[]) ?? []);
    setProperties((p as PropertyRow[]) ?? []);
    const rows = (l as LinkRow[]) ?? [];
    setPortals(rows);
    // Payment links for every property that sits on any billing portal.
    const propIds = [...new Set(rows.flatMap((r) => (Array.isArray(r.assigned_property_ids) ? (r.assigned_property_ids as string[]) : [])))];
    const keyed = await fetchLoginLinks(propIds.map(billingPropertyLinkKey));
    const byProperty: Record<string, string> = {};
    for (const id of propIds) if (keyed[billingPropertyLinkKey(id)]) byProperty[id] = keyed[billingPropertyLinkKey(id)];
    setPaymentLinks(byProperty);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clientName = (id: string) => {
    const c = clients.find((x) => x.id === id);
    return c?.company || c?.name || "—";
  };
  const propName = (id: string) => properties.find((p) => p.id === id)?.name ?? "(removed)";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    // Properties of the chosen client float to the top; anything can be added.
    const sorted = [...properties].sort((a, b) => {
      const aMine = newClient && a.client_id === newClient ? 0 : 1;
      const bMine = newClient && b.client_id === newClient ? 0 : 1;
      return aMine - bMine || a.name.localeCompare(b.name);
    });
    return q ? sorted.filter((p) => `${p.name} ${p.address ?? ""}`.toLowerCase().includes(q)) : sorted;
  }, [properties, search, newClient]);

  const create = async () => {
    if (!newClient) {
      toast({ title: "Pick the customer this portal belongs to", variant: "destructive" });
      return;
    }
    if (newProps.length === 0) {
      toast({ title: "Pick at least one property", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("portal_links").insert({
      client_id: newClient,
      link_type: "billing",
      label: newLabel.trim() || `${clientName(newClient)} — Billing`,
      assigned_property_ids: newProps,
    });
    if (error) {
      toast({ title: "Could not create the portal", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Billing portal created" });
    setCreating(false);
    setNewLabel("");
    setNewClient("");
    setNewProps([]);
    setSearch("");
    await load();
  };

  const saveEdit = async (p: LinkRow) => {
    // A blank name keeps the one it had — the customer's page needs a heading.
    const label = editLabel.trim() || p.label;
    const { error } = await supabase
      .from("portal_links")
      .update({ assigned_property_ids: editProps, label })
      .eq("id", p.id);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    for (const propId of editProps) {
      const next = (editPayLinks[propId] ?? "").trim();
      if (next === (paymentLinks[propId] ?? "")) continue;
      const fr = properties.find((x) => x.id === propId)?.fieldroutes_customer_id ?? null;
      const linkErr = await setBillingPropertyPaymentLink(propId, next, fr);
      if (linkErr) {
        toast({ title: `Portal saved, but not the payment link for ${propName(propId)}`, description: linkErr, variant: "destructive" });
        return;
      }
    }
    toast({ title: "Portal updated" });
    setEditingId(null);
    await load();
  };

  const toggleActive = async (p: LinkRow) => {
    const { error } = await supabase.from("portal_links").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) {
      toast({ title: "Could not update", description: error.message, variant: "destructive" });
      return;
    }
    await load();
  };

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const PropertyPicker = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
    <div className="space-y-2">
      <Input placeholder="Search properties…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
      <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
        {filtered.map((p) => (
          <label key={p.id} className="flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/40">
            <Checkbox checked={value.includes(p.id)} onCheckedChange={() => onChange(toggle(value, p.id))} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{p.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">
                {clientName(p.client_id)}
                {p.address ? ` · ${p.address}` : ""}
              </div>
            </div>
          </label>
        ))}
        {filtered.length === 0 && <div className="p-3 text-sm text-muted-foreground text-center">No matches.</div>}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {value.length} selected. Each one shows as its own tile on the customer's page.
      </p>
    </div>
  );

  return (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="w-4 h-4" />
            Customer billing portals
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            One link per customer. You choose which properties appear on it — they see every issued invoice,
            paid vs outstanding, and the units behind each one.
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="w-4 h-4 mr-1" /> New portal
          </Button>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {creating && (
          <div className="rounded-lg border-2 border-primary/30 bg-primary/[0.03] p-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Customer</Label>
                <Select value={newClient} onValueChange={setNewClient}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Who is this portal for?" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Portal name (shows on their page)</Label>
                <Input
                  className="h-9"
                  placeholder="e.g. Anaheim Properties — Invoices"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Properties on this portal</Label>
              <PropertyPicker value={newProps} onChange={setNewProps} />
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={create}>Create portal</Button>
              <Button size="sm" variant="ghost" onClick={() => { setCreating(false); setSearch(""); }}>Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading…</p>
        ) : portals.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">No billing portals yet.</p>
        ) : (
          <div className="divide-y border rounded-lg">
            {portals.map((p) => {
              const ids: string[] = Array.isArray(p.assigned_property_ids) ? p.assigned_property_ids : [];
              const editing = editingId === p.id;
              return (
                <div key={p.id} className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                        {p.label || "Billing portal"}
                        {!p.is_active && <Badge variant="outline" className="text-[10px]">off</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground">{clientName(p.client_id)}</div>

                      {!editing && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {ids.map((id) => (
                            <Badge
                              key={id}
                              variant="secondary"
                              className="text-[10px] font-normal gap-1"
                              title={paymentLinks[id] ? "Has a pay / add-a-card button" : "No payment link yet"}
                            >
                              {propName(id)}
                              {paymentLinks[id] && <CreditCard className="w-3 h-3 text-emerald-700" />}
                            </Badge>
                          ))}
                          {ids.length === 0 && <span className="text-[11px] text-amber-700">No properties yet</span>}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-wrap">
                      <Button
                        variant="ghost" size="sm" className="h-7 text-xs"
                        onClick={() => { navigator.clipboard.writeText(portalUrl(p.token)); toast({ title: "Billing portal link copied" }); }}
                      >
                        <Copy className="w-3 h-3 mr-1" /> Copy link
                      </Button>
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.open(portalUrl(p.token), "_blank")}>
                        <ExternalLink className="w-3 h-3 mr-1" /> Open
                      </Button>
                      {!editing && (
                        <Button
                          variant="ghost" size="sm" className="h-7 text-xs"
                          onClick={() => { setEditingId(p.id); setEditProps(ids); setEditLabel(p.label ?? ""); setEditPayLinks(Object.fromEntries(ids.map((id) => [id, paymentLinks[id] ?? ""]))); setSearch(""); }}
                        >
                          <Pencil className="w-3 h-3 mr-1" /> Edit
                        </Button>
                      )}
                      <Button
                        variant="ghost" size="sm"
                        className={`h-7 text-xs ${p.is_active ? "text-muted-foreground" : "text-emerald-700"}`}
                        onClick={() => toggleActive(p)}
                      >
                        <Power className="w-3 h-3 mr-1" /> {p.is_active ? "Turn off" : "Turn on"}
                      </Button>
                    </div>
                  </div>

                  {editing && (
                    <div className="rounded-lg border bg-muted/20 p-3 space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Portal name (shows on their page)</Label>
                        <Input
                          className="h-9 bg-background"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveEdit(p)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs font-semibold">Properties on this portal</Label>
                        <PropertyPicker value={editProps} onChange={setEditProps} />
                      </div>
                      {editProps.length > 0 && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-semibold">Payment links (each property's customer portal, where they add a card)</Label>
                          <div className="border rounded-lg divide-y bg-background">
                            {editProps.map((id) => (
                              <div key={id} className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 p-2.5">
                                <div className="text-sm font-medium sm:w-56 shrink-0 truncate">{propName(id)}</div>
                                <Input
                                  className="h-8 text-xs"
                                  placeholder="Paste this property's FieldPortals login link"
                                  value={editPayLinks[id] ?? ""}
                                  onChange={(e) => setEditPayLinks((prev) => ({ ...prev, [id]: e.target.value }))}
                                />
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-muted-foreground">
                            Each one becomes a “Make a payment or add a card” button on that property's tile. Leave empty for no button.
                          </p>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" className="h-8" onClick={() => saveEdit(p)}>
                          <Check className="w-3 h-3 mr-1" /> Save
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditingId(null)}>
                          <X className="w-3 h-3 mr-1" /> Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default BillingPortalsAdmin;
