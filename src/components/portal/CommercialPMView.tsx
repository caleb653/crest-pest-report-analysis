/**
 * CommercialPMView — Client-side portal for commercial accounts (e.g.
 * restaurants). Mobile-first, intentionally stripped down compared to the
 * apartment / HOA PM portals:
 *
 *   • NO units / sub-locations of any kind. The location is the location.
 *   • NO work-order workflow. A simple "Send a message" form replaces it.
 *   • NO surveys, NO video tab, NO resident / tenant references.
 *   • NO per-unit pricing or overage display anywhere.
 *
 * This file deliberately does NOT touch the existing apartment or HOA
 * portals — it's a sibling component PortalAdmin / PMPortalView delegate
 * to when the property's `property_type === "commercial"`.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, ClipboardList, MapPin, MessageSquare, Send, Phone, Clock, ChevronDown, FlaskConical, Camera } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { ProductUsageSummary } from "@/components/portal/ProductUsageSummary";
import { normalizeUsageList } from "@/lib/productCatalog";
import { PesticideNotice } from "@/components/portal/PesticideNotice";
import crestLogo from "@/assets/crest-logo.png";

interface PropertyData {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  map_data: any;
  map_image_url: string | null;
  equipment: any;
  customer_preferences: any;
  notes: string | null;
}

interface ServiceData {
  id: string;
  property_id: string;
  service_date: string | null;
  service_time: string | null;
  service_type: string;
  technician: string | null;
  status: string;
  summary: string | null;
  findings: string | null;
  notes: string | null;
  follow_up_recommended: boolean | null;
  follow_up_notes: string | null;
  products_used: any;
  photos: any;
  special_notes: string | null;
  frequency_days?: number | null;
}

interface CommercialPMViewProps {
  propertyId: string;
  linkId: string;
}

const todayISO = () => new Date().toISOString().split("T")[0];

export default function CommercialPMView({ propertyId, linkId }: CommercialPMViewProps) {
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [openServiceId, setOpenServiceId] = useState<string | null>(null);

  // Message form state — replaces the apartment "work order" flow.
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgFrom, setMsgFrom] = useState("");
  const [msgEmail, setMsgEmail] = useState("");
  const [msgPhone, setMsgPhone] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: prop } = await supabase
          .from("portal_properties")
          .select("*")
          .eq("id", propertyId)
          .single();
        if (prop) setProperty(prop as any);
        const { data: svcs } = await supabase
          .from("portal_services")
          .select("*")
          .eq("property_id", propertyId)
          .order("service_date", { ascending: false });
        if (svcs) setServices(svcs as any);
      } finally {
        setLoading(false);
      }
    })();
  }, [propertyId]);

  const today = todayISO();
  const past = services.filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
  const upcoming = services
    .filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today))
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));

  const mapUrl = property?.map_image_url || property?.image_url || null;

  const sendMessage = async () => {
    if (!msgSubject.trim() || !msgBody.trim()) {
      toast({ title: "Add a subject and message", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.from("portal_messages").insert({
        client_id: property?.client_id || null,
        link_id: linkId,
        sender_type: "client",
        sender_name: msgFrom.trim() || "Commercial Portal",
        sender_email: msgEmail.trim() || null,
        property_name: property?.name || null,
        subject: msgSubject.trim(),
        message: [
          msgBody.trim(),
          msgPhone.trim() ? `\nCallback: ${msgPhone.trim()}` : "",
        ].filter(Boolean).join(""),
      } as any);
      if (error) throw error;
      // Try to notify office, but don't block the success path if the edge
      // function is unavailable.
      try {
        await supabase.functions.invoke("send-portal-message", {
          body: {
            propertyName: property?.name || "Commercial Portal",
            subject: msgSubject.trim(),
            message: msgBody.trim(),
            senderName: msgFrom.trim() || "Commercial Portal",
            senderEmail: msgEmail.trim() || null,
            senderPhone: msgPhone.trim() || null,
          },
        });
      } catch { /* non-fatal */ }
      toast({ title: "Message sent", description: "We'll be in touch shortly." });
      setMsgSubject("");
      setMsgBody("");
      setMsgPhone("");
    } catch (e: any) {
      toast({ title: "Couldn't send", description: e?.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="h-8 w-8 rounded-full border-2 border-muted border-t-foreground animate-spin" />
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-sm text-muted-foreground">Location not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* Sticky header — large tap targets, single line on mobile */}
      <div className="sticky top-0 z-30 bg-card border-b border-border shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img src={crestLogo} alt="Crest Pest Control" className="h-8 w-auto" />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold leading-tight">
              Commercial Portal
            </p>
            <h1 className="text-base font-bold leading-tight truncate">{property.name}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
        {/* Location card */}
        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                  Location
                </p>
                <p className="text-sm font-medium">{property.address || "—"}</p>
              </div>
            </div>
            {property.notes && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap pt-1 border-t border-border/60">
                {property.notes}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tabs — mobile-first 3-column grid, full-width tap targets */}
        <Tabs defaultValue="visits" className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-11">
            <TabsTrigger value="visits" className="text-xs gap-1.5">
              <Calendar className="w-3.5 h-3.5" />
              Visits
            </TabsTrigger>
            <TabsTrigger value="map" className="text-xs gap-1.5">
              <MapPin className="w-3.5 h-3.5" />
              Site Map
            </TabsTrigger>
            <TabsTrigger value="contact" className="text-xs gap-1.5">
              <MessageSquare className="w-3.5 h-3.5" />
              Contact
            </TabsTrigger>
          </TabsList>

          {/* ─── VISITS ─── */}
          <TabsContent value="visits" className="space-y-3 mt-3">
            {/* Upcoming */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                Upcoming
              </p>
              {upcoming.length === 0 ? (
                <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">
                  No upcoming visits scheduled.
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {upcoming.slice(0, 6).map(s => (
                    <Card key={s.id}>
                      <CardContent className="p-3 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{s.service_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.service_date
                              ? new Date(s.service_date + "T00:00:00").toLocaleDateString("en-US", {
                                  weekday: "short", month: "short", day: "numeric",
                                })
                              : "Date TBD"}
                            {s.service_time && ` • ${s.service_time}`}
                          </p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">Scheduled</Badge>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Past */}
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                <ClipboardList className="w-3 h-3" />
                Past Visits
              </p>
              {past.length === 0 ? (
                <Card><CardContent className="p-4 text-center text-sm text-muted-foreground">
                  No past visits yet.
                </CardContent></Card>
              ) : (
                <div className="space-y-2">
                  {past.slice(0, 25).map(s => {
                    const isOpen = openServiceId === s.id;
                    const products = normalizeUsageList(s.products_used);
                    const hasFollowUp = !!s.follow_up_recommended;
                    const photos: any[] = Array.isArray(s.photos) ? s.photos : [];
                    return (
                      <Card
                        key={s.id}
                        className={hasFollowUp ? "border-2 border-orange-400 ring-2 ring-orange-200/60" : ""}
                      >
                        <CardContent className="p-0">
                          {hasFollowUp && (
                            <div className="bg-orange-500 text-white px-3 py-2 rounded-t-lg flex items-center gap-2">
                              <span className="text-base leading-none">⚠️</span>
                              <p className="font-bold text-xs uppercase tracking-wide">
                                Follow-up Needed
                              </p>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => setOpenServiceId(isOpen ? null : s.id)}
                            className="w-full flex items-center justify-between gap-2 px-3 py-3 text-left hover:bg-muted/40 transition-colors"
                          >
                            <div className="min-w-0">
                              <p className="font-bold text-sm truncate">{s.service_type}</p>
                              <p className="text-xs text-muted-foreground">
                                {s.service_date
                                  ? new Date(s.service_date + "T00:00:00").toLocaleDateString("en-US", {
                                      month: "short", day: "numeric", year: "numeric",
                                    })
                                  : "—"}
                                {s.technician && ` • ${s.technician}`}
                              </p>
                            </div>
                            <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                          </button>
                          {isOpen && (
                            <div className="px-3 pb-3 pt-1 space-y-3 border-t border-border/60">
                              {hasFollowUp && s.follow_up_notes && (
                                <div className="bg-orange-50 border border-orange-200 rounded-md p-2.5">
                                  <p className="text-[11px] font-bold text-orange-800 uppercase tracking-wide mb-0.5">
                                    Follow-up Notes
                                  </p>
                                  <p className="text-sm text-orange-900 whitespace-pre-wrap leading-relaxed">{s.follow_up_notes}</p>
                                </div>
                              )}
                              {s.summary && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Summary</p>
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.summary}</p>
                                </div>
                              )}
                              {s.findings && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Findings</p>
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.findings}</p>
                                </div>
                              )}
                              {s.notes && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Notes</p>
                                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{s.notes}</p>
                                </div>
                              )}
                              {products.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                    <FlaskConical className="w-3 h-3" />
                                    Products Used
                                  </p>
                                  <ProductUsageSummary entries={products} />
                                </div>
                              )}
                              {photos.length > 0 && (
                                <div>
                                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                                    <Camera className="w-3 h-3" />
                                    Photos
                                  </p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {photos.map((p: any, i: number) => {
                                      const url = typeof p === "string" ? p : p?.url;
                                      if (!url) return null;
                                      return (
                                        <a
                                          key={i}
                                          href={url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block w-20 h-20 rounded-md border border-border overflow-hidden bg-muted"
                                        >
                                          <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                                        </a>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                              <PesticideNotice />
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── SITE MAP ─── */}
          <TabsContent value="map" className="mt-3">
            <Card>
              <CardContent className="p-3">
                {property.map_data || mapUrl ? (
                  <div className="w-full bg-background rounded-md overflow-hidden border border-border" style={{ height: "60vh", minHeight: 380 }}>
                    {property.map_data ? (
                      <ReadOnlyMapCanvas mapUrl={mapUrl || ""} mapData={property.map_data} />
                    ) : mapUrl ? (
                      <img src={mapUrl} alt="Site map" className="w-full h-full object-contain" />
                    ) : null}
                  </div>
                ) : (
                  <div className="text-center py-10 text-sm text-muted-foreground">
                    No site map uploaded yet.
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ─── CONTACT / MESSAGE ─── */}
          <TabsContent value="contact" className="space-y-3 mt-3">
            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-primary" />
                  <p className="text-sm font-bold">Need something faster?</p>
                </div>
                <a
                  href="tel:9494245000"
                  className="block w-full bg-primary text-primary-foreground rounded-lg py-3 px-4 text-center font-semibold text-sm shadow-sm active:opacity-90"
                >
                  Call Crest — (949) 424-5000
                </a>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <p className="text-sm font-bold">Send Crest a Message</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Use this for service questions, scheduling tweaks, or anything you'd like our office to know.
                </p>
                <div className="space-y-2">
                  <Input
                    placeholder="Your name"
                    value={msgFrom}
                    onChange={e => setMsgFrom(e.target.value)}
                    className="h-11 text-base"
                  />
                  <Input
                    type="email"
                    placeholder="Your email (optional)"
                    value={msgEmail}
                    onChange={e => setMsgEmail(e.target.value)}
                    className="h-11 text-base"
                    autoComplete="email"
                    inputMode="email"
                  />
                  <Input
                    type="tel"
                    placeholder="Callback phone (optional)"
                    value={msgPhone}
                    onChange={e => setMsgPhone(e.target.value)}
                    className="h-11 text-base"
                    autoComplete="tel"
                    inputMode="tel"
                  />
                  <Input
                    placeholder="Subject"
                    value={msgSubject}
                    onChange={e => setMsgSubject(e.target.value)}
                    className="h-11 text-base"
                  />
                  <Textarea
                    placeholder="Your message"
                    value={msgBody}
                    onChange={e => setMsgBody(e.target.value)}
                    rows={5}
                    className="text-base"
                  />
                </div>
                <Button
                  type="button"
                  onClick={sendMessage}
                  disabled={sending}
                  className="w-full h-11 text-sm gap-2"
                >
                  <Send className="w-4 h-4" />
                  {sending ? "Sending…" : "Send Message"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}