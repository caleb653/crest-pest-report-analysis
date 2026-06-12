import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ClipboardList, MessageSquare, Phone, Mail, ChevronRight, ChevronDown, Send, ArrowLeft, X, MapPin, Shield, Wrench, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { friendlyUnitStatus } from "@/lib/unitStatus";
import { generateFreeAndClearCertificatePdf, isFreeAndClearStatus } from "@/lib/freeAndClearCertificate";
import crestLogo from "@/assets/crest-logo.png";
import { PropertyDocuments } from "@/components/portal/PropertyDocuments";
import CommercialPMView from "@/components/portal/CommercialPMView";

interface LinkData {
  id: string;
  client_id: string;
  token: string;
  link_type: string;
  label: string | null;
  assigned_property_ids: any;
  is_active: boolean;
}

interface ClientData {
  id: string;
  name: string;
  company: string | null;
}

interface PropertyData {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  map_data: any;
  map_image_url: string | null;
  equipment: any;
  customer_preferences: any;
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
  products_used: any;
  photos: any;
  follow_up_recommended: boolean | null;
  follow_up_notes: string | null;
  scheduling_status: string | null;
  prep_required: boolean | null;
  prep_notes: string | null;
  units_planned: any;
  unit_details: any;
  special_notes: string | null;
}

interface ChatMessage {
  id: string;
  sender_name: string;
  sender_type: string;
  message: string;
  subject: string;
  created_at: string;
}

// ─── Service Snapshot Component ───
const ServiceSnapshot = ({ service, isExpanded, onToggle, onViewFull, isAdmin, uploadingPhotoId, onUploadPhotos, property }: {
  service: ServiceData;
  isExpanded: boolean;
  onToggle: () => void;
  onViewFull: () => void;
  isAdmin: boolean;
  uploadingPhotoId: string | null;
  onUploadPhotos: (serviceId: string, files: FileList | null) => void;
  property?: PropertyData | null;
}) => {
  // Surface follow-up units extremely prominently — pull every unit the
  // technician explicitly flagged so the customer sees exactly which
  // units still need attention without expanding the unit list.
  const followUpUnits: any[] = Array.isArray(service.unit_details)
    ? (service.unit_details as any[]).filter((u: any) => u?.follow_up_needed === true)
    : [];
  const hasFollowUp = followUpUnits.length > 0 || !!service.follow_up_recommended;
  return (
  <Card className={`transition-all ${isExpanded ? "border-primary/40 shadow-md" : "hover:border-primary/20"}`}>
    <CardContent className="p-0">
      <button className="w-full text-left p-4 flex items-center justify-between" onClick={onToggle}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="font-semibold text-sm">{service.service_type}</p>
            <Badge variant={service.status === "completed" ? "default" : "secondary"} className="text-xs">{service.status}</Badge>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{service.service_date ? new Date(service.service_date + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "No date"}</span>
            {service.technician && <span>• {service.technician}</span>}
          </div>
        </div>
        <ChevronDown className={`w-5 h-5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
      </button>
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t pt-3">
          {hasFollowUp && (
            <p className="text-xs text-orange-800 bg-orange-50 border border-orange-300 rounded-md px-2.5 py-1.5">
              <span className="font-bold uppercase tracking-wide">Follow-up needed:</span>{" "}
              {followUpUnits.length > 0 ? (
                <>
                  {followUpUnits.length} {followUpUnits.length === 1 ? "unit" : "units"}
                  {(() => {
                    const list = followUpUnits.map((u: any) => u.unit_number).filter(Boolean).join(", ");
                    return list ? ` (${list})` : "";
                  })()}{" "}
                  will auto-roll into the next scheduled service.
                </>
              ) : (
                service.follow_up_notes || "Flagged for a return visit on the next scheduled service."
              )}
            </p>
          )}
          {service.summary && <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Summary</p><p className="text-sm">{service.summary}</p></div>}
          {service.findings && <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Findings</p><p className="text-sm">{service.findings}</p></div>}
          {service.notes && <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Notes</p><p className="text-sm">{service.notes}</p></div>}
          {service.products_used && Array.isArray(service.products_used) && service.products_used.length > 0 && (
            <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Products Used</p>
              <div className="flex flex-wrap gap-1">{(service.products_used as string[]).map((p, i) => <Badge key={i} variant="outline" className="text-xs">{p}</Badge>)}</div>
            </div>
          )}
          {service.unit_details && Array.isArray(service.unit_details) && (service.unit_details as any[]).length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide mb-2">
                Unit Details ({(service.unit_details as any[]).length})
              </p>
              <div className="space-y-3">
                {(service.unit_details as any[]).map((unit: any, i: number) => {
                  const isFollowUp = unit.follow_up_needed === true;
                  const productsText = Array.isArray(unit.products_used)
                    ? (unit.products_used as any[]).map((p: any) => typeof p === "string" ? p : p?.name).filter(Boolean).join(", ")
                    : unit.products_used;
                  return (
                    <div
                      key={i}
                      className={`rounded-lg border-2 p-3.5 bg-card shadow-sm ${
                        isFollowUp ? "border-orange-300 bg-orange-50/40" : "border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-border/60 flex-wrap">
                        <span className="text-sm font-bold">Unit {unit.unit_number || i + 1}</span>
                        {unit.status && (
                          <Badge variant="outline" className={`text-[10px] ${isFollowUp ? "border-orange-300 text-orange-700 bg-orange-50" : ""}`}>
                            {friendlyUnitStatus(unit.status, (unit as any).kind)}
                          </Badge>
                        )}
                        {isFreeAndClearStatus(unit.status) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] px-2 ml-auto"
                            onClick={(e) => {
                              e.stopPropagation();
                              generateFreeAndClearCertificatePdf({
                                propertyName: property?.name,
                                propertyAddress: property?.address,
                                unitNumber: unit.unit_number,
                                inspectionDate: service.service_date,
                                inspectorName: service.technician,
                              });
                            }}
                          >
                            Download Free & Clear Certificate
                          </Button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                        {unit.target_pest && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Target Pest</p>
                            <p>{unit.target_pest}</p>
                          </div>
                        )}
                        {unit.pest_activity && unit.pest_activity !== "None" && (
                          <div>
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Activity Level</p>
                            <p>{unit.pest_activity}</p>
                          </div>
                        )}
                        {unit.findings && (
                          <div className="md:col-span-2">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Findings</p>
                            <p className="whitespace-pre-wrap leading-relaxed">{unit.findings}</p>
                          </div>
                        )}
                        {productsText && (
                          <div className="md:col-span-2">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Products</p>
                            <p className="whitespace-pre-wrap">{productsText}</p>
                          </div>
                        )}
                        {unit.notes && (
                          <div className="md:col-span-2">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-0.5">Notes</p>
                            <p className="whitespace-pre-wrap leading-relaxed">{unit.notes}</p>
                          </div>
                        )}
                        {Array.isArray(unit.photos) && unit.photos.length > 0 && (
                          <div className="md:col-span-2">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Photos ({unit.photos.length})</p>
                            <div className="grid grid-cols-3 gap-1.5">
                              {(unit.photos as any[]).map((photo: any, pIdx: number) => {
                                const url = typeof photo === "string" ? photo : photo?.url || photo?.src;
                                if (!url) return null;
                                return (
                                  <a key={pIdx} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-md overflow-hidden border border-border hover:border-primary/50 transition-all hover:shadow-md">
                                    <img src={url} alt={`Unit ${unit.unit_number || i + 1} photo ${pIdx + 1}`} className="w-full h-full object-cover" loading="lazy" />
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {service.special_notes && !/^\s*Follow-up units from/i.test(service.special_notes) && <div><p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Special Notes</p><p className="text-sm">{service.special_notes}</p></div>}
          {/* Service-level photos. Anyone can view; Crest staff (admin) can add
              more — to ANY service, past or upcoming — from camera or gallery. */}
          {(() => {
            const servicePhotos: any[] = Array.isArray(service.photos) ? service.photos : [];
            const photoUrl = (p: any) => (typeof p === "string" ? p : p?.url || p?.src);
            if (servicePhotos.length === 0 && !isAdmin) return null;
            const busy = uploadingPhotoId === service.id;
            return (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Photos{servicePhotos.length > 0 ? ` (${servicePhotos.length})` : ""}
                  </p>
                  {isAdmin && (
                    <label className={`inline-flex items-center gap-1 text-xs font-medium text-primary ${busy ? "opacity-60" : "cursor-pointer hover:underline"}`}>
                      {busy
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</>
                        : <><ImagePlus className="w-3.5 h-3.5" /> Add photos</>}
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => { onUploadPhotos(service.id, e.target.files); e.currentTarget.value = ""; }}
                      />
                    </label>
                  )}
                </div>
                {servicePhotos.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {servicePhotos.map((p, i) => {
                      const url = photoUrl(p);
                      if (!url) return null;
                      return (
                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-md overflow-hidden border bg-muted">
                          <img src={url} alt={`Service photo ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                        </a>
                      );
                    })}
                  </div>
                ) : isAdmin && (
                  <p className="text-xs text-muted-foreground">No photos yet — tap "Add photos" to upload from this device's camera or gallery (you can pick several at once).</p>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </CardContent>
  </Card>
);
};

// ─── Floating Chat Widget ───
const FloatingChat = ({ messages, input, setInput, onSend, sending }: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  sending: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  return (
    <>
      {/* Floating bubble */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl transition-all flex items-center justify-center hover:scale-105"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-80 sm:w-96 h-[420px] bg-card border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-primary/5">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span className="font-semibold text-sm">Chat with Crest</span>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-muted transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-6">
                <p className="mb-2">Send us a message anytime!</p>
                <div className="flex items-center justify-center gap-3">
                  <span className="flex items-center gap-1"><Phone className="w-3 h-3" />949-424-5000</span>
                  <span className="flex items-center gap-1"><Mail className="w-3 h-3" />office@crestpestcontrol.com</span>
                </div>
              </div>
            )}
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.sender_type === "client" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.sender_type === "client" ? "bg-primary text-primary-foreground rounded-br-md" : "bg-muted rounded-bl-md"}`}>
                  {msg.sender_type === "admin" && <p className="text-xs font-medium mb-0.5 opacity-70">Crest</p>}
                  <p className="whitespace-pre-wrap text-[13px]">{msg.message}</p>
                  <p className={`text-[10px] mt-1 ${msg.sender_type === "client" ? "opacity-60" : "text-muted-foreground"}`}>
                    {new Date(msg.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="border-t p-2">
            <form onSubmit={e => { e.preventDefault(); onSend(); }} className="flex gap-2">
              <Input placeholder="Type a message..." value={input} onChange={e => setInput(e.target.value)} disabled={sending} className="flex-1 h-9 text-sm rounded-full" />
              <Button type="submit" size="icon" disabled={!input.trim() || sending} className="h-9 w-9 rounded-full shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};

// ─── Main Component ───
const ClientPortal = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [properties, setProperties] = useState<PropertyData[]>([]);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<PropertyData | null>(null);
  const [serviceView, setServiceView] = useState<"past" | "upcoming" | null>(null);
  const [serviceSortBy, setServiceSortBy] = useState<"date" | "unit">("date");
  const [expandedServiceId, setExpandedServiceId] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<ServiceData | null>(null);
  // Crest staff (signed in as admin) get an "Add photos" control on each service;
  // regular clients viewing via their link do not. Mirrors the admin_session
  // convention used by the pending-writes approval UI.
  const [isAdmin] = useState<boolean>(() => typeof window !== "undefined" && !!localStorage.getItem("admin_session"));
  const [uploadingPhotoId, setUploadingPhotoId] = useState<string | null>(null);

  // Upload one or more photos onto a service (any service, past or upcoming).
  // No `capture` attribute on the input, so an iPad offers Photo Library AND
  // Camera; `multiple` lets staff pick several at once.
  const uploadServicePhotos = async (serviceId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingPhotoId(serviceId);
    const urls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `client-portal-service-photos/${serviceId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("report-images").upload(path, file, {
        contentType: file.type || "image/jpeg", upsert: false,
      });
      if (upErr) { toast({ title: "Upload failed", description: upErr.message, variant: "destructive" }); continue; }
      const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
      if (pub?.publicUrl) urls.push(pub.publicUrl);
    }
    if (urls.length) {
      const current = services.find(s => s.id === serviceId);
      const existing: any[] = Array.isArray(current?.photos) ? (current!.photos as any[]) : [];
      const next = [...existing, ...urls];
      const { error: updErr } = await supabase.from("portal_services").update({ photos: next }).eq("id", serviceId);
      if (updErr) { toast({ title: "Couldn't save photos", description: updErr.message, variant: "destructive" }); }
      else {
        setServices(prev => prev.map(s => s.id === serviceId ? { ...s, photos: next } : s));
        toast({ title: `Added ${urls.length} photo${urls.length === 1 ? "" : "s"}` });
      }
    }
    setUploadingPhotoId(null);
  };

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { if (token) loadPortal(); }, [token]);

  useEffect(() => {
    if (!linkData) return;
    const interval = setInterval(() => loadMessages(), 10000);
    return () => clearInterval(interval);
  }, [linkData]);

  const loadPortal = async () => {
    setLoading(true);
    const { data: link } = await supabase.from("portal_links").select("*").eq("token", token).eq("is_active", true).single();
    if (!link) { setError("Invalid or expired link"); setLoading(false); return; }
    if (link.link_type === "tenant") { navigate(`/tenant/${token}`, { replace: true }); return; }
    setLinkData(link);

    const { data: c } = await supabase.from("portal_clients").select("id, name, company").eq("id", link.client_id).single();
    if (c) setClient(c);

    let propsQuery = supabase.from("portal_properties").select("*").eq("client_id", link.client_id);
    if (link.link_type === "sub" && Array.isArray(link.assigned_property_ids) && link.assigned_property_ids.length > 0) {
      propsQuery = propsQuery.in("id", link.assigned_property_ids as string[]);
    }
    const { data: props } = await propsQuery;
    if (props) {
      setProperties(props);
      if (props.length > 0) {
        const { data: svcs } = await supabase.from("portal_services").select("*").in("property_id", props.map(p => p.id)).order("service_date", { ascending: false });
        if (svcs) setServices(svcs);
      }
    }

    const { data: msgs } = await supabase
      .from("portal_messages")
      .select("id, sender_name, sender_type, message, subject, created_at")
      .eq("client_id", link.client_id)
      .order("created_at", { ascending: true });
    if (msgs) setChatMessages(msgs);

    setLoading(false);
  };

  const loadMessages = async () => {
    if (!linkData) return;
    const { data: msgs } = await supabase
      .from("portal_messages")
      .select("id, sender_name, sender_type, message, subject, created_at")
      .eq("client_id", linkData.client_id)
      .order("created_at", { ascending: true });
    if (msgs) setChatMessages(msgs);
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim() || !linkData || !client) return;
    setSending(true);
    const senderName = client.company || client.name;
    const { data: msgInserted, error: err } = await supabase.from("portal_messages").insert({
      link_id: linkData.id, client_id: linkData.client_id,
      sender_name: senderName, sender_type: "client",
      subject: "Portal Chat", message: chatInput.trim(),
    }).select("id").maybeSingle();
    if (!err) {
      try {
        await supabase.functions.invoke("send-portal-message", {
          body: { senderName, propertyName: client.company || null, subject: `Chat from ${senderName}`, message: chatInput.trim() },
        });
      } catch (e) { console.error("Email send failed:", e); }
      if (msgInserted?.id) {
        try {
          await supabase.functions.invoke("notify-submission", {
            body: { kind: "message", messageId: msgInserted.id },
          });
        } catch (e) { console.error("notify-submission failed", e); }
      }
      setChatInput("");
      loadMessages();
    } else {
      toast({ title: "Error", description: "Could not send message.", variant: "destructive" });
    }
    setSending(false);
  };

  const today = new Date().toISOString().split("T")[0];

  const getPropertyServices = (propertyId: string) => services.filter(s => s.property_id === propertyId);
  const getPastServices = (propertyId: string) => getPropertyServices(propertyId).filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
  const getFutureServices = (propertyId: string) => {
    const future = getPropertyServices(propertyId).filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today));
    // Auto-populate follow-up notes from past services
    if (future.length > 0) {
      const past = getPastServices(propertyId);
      const followUps = past.filter(s => s.follow_up_recommended && s.follow_up_notes);
      if (followUps.length > 0) {
        // Attach follow-up context to the next service
        const nextService = future[0];
        if (!nextService.special_notes?.includes("Follow-up from previous")) {
          // We don't mutate, but we'll show it in the UI
        }
      }
    }
    return future;
  };

  const sortServices = (svcs: ServiceData[]) => {
    if (serviceSortBy === "unit") {
      return [...svcs].sort((a, b) => {
        const aUnits = Array.isArray(a.unit_details) ? (a.unit_details as any[]).map(u => u.unit_number).join(",") : "";
        const bUnits = Array.isArray(b.unit_details) ? (b.unit_details as any[]).map(u => u.unit_number).join(",") : "";
        return aUnits.localeCompare(bUnits) || ((b.service_date || "").localeCompare(a.service_date || ""));
      });
    }
    return [...svcs].sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));
  };

  // Get unique service types for scope of work
  const getScopeOfWork = (propertyId: string) => {
    const propServices = getPropertyServices(propertyId);
    const types = new Set<string>();
    propServices.forEach(s => types.add(s.service_type));
    return Array.from(types);
  };

  // ─── Loading / Error states ───
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <img src={crestLogo} alt="Crest Pest Control" className="h-16 mx-auto mb-4 animate-pulse" />
        <p className="text-muted-foreground text-sm">Loading your portal...</p>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Card className="max-w-md w-full mx-4">
        <CardContent className="p-8 text-center">
          <img src={crestLogo} alt="Crest Pest Control" className="h-16 mx-auto mb-4" />
          <p className="text-destructive font-medium">{error}</p>
          <p className="text-sm text-muted-foreground mt-2">Please contact Crest Pest Control if you believe this is an error.</p>
        </CardContent>
      </Card>
    </div>
  );

  // ─── Property Detail View ───
  if (selectedProperty) {
    // Commercial properties get the full Sprague-style PM view (tabs,
    // conditions log, trending, SDS, etc.) instead of the apartments layout.
    const _ptype = (selectedProperty.customer_preferences as any)?.property_type;
    if (_ptype === "commercial") {
      return (
        <div className="min-h-screen bg-background">
          <div className="bg-card border-b px-4 py-3 sticky top-0 z-40">
            <div className="max-w-3xl mx-auto flex items-center gap-3">
              <button
                onClick={() => { setSelectedProperty(null); setServiceView(null); setExpandedServiceId(null); }}
                className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
                aria-label="Back to properties"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>
          </div>
          <CommercialPMView propertyId={selectedProperty.id} linkId={linkData?.id || ""} />
        </div>
      );
    }

    const pastSvcs = sortServices(getPastServices(selectedProperty.id));
    const futureSvcs = getFutureServices(selectedProperty.id);
    const equipment = Array.isArray(selectedProperty.equipment) ? selectedProperty.equipment as string[] : [];
    const scope = getScopeOfWork(selectedProperty.id);
    const mapUrl = selectedProperty.map_image_url || selectedProperty.image_url;
    const followUpItems = pastSvcs.filter(s => s.follow_up_recommended && s.follow_up_notes);

    // Auto-expand most recent past service
    const autoExpandId = pastSvcs.length > 0 && !expandedServiceId ? pastSvcs[0].id : expandedServiceId;

    return (
      <div className="min-h-screen bg-background">
        {/* Header */}
        <div className="bg-card border-b px-4 py-3 sticky top-0 z-20">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button onClick={() => { setSelectedProperty(null); setServiceView(null); setExpandedServiceId(null); }} className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <img src={crestLogo} alt="Crest" className="h-8" />
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-base truncate">{selectedProperty.name}</h1>
              {selectedProperty.address && <p className="text-xs text-muted-foreground truncate">{selectedProperty.address}</p>}
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
          {/* Map */}
          {mapUrl && (
            <div className="rounded-xl overflow-hidden border shadow-sm bg-muted">
              <div className="aspect-[3/4] relative max-w-md mx-auto">
                {selectedProperty.map_data ? (
                  <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={selectedProperty.map_data} imageFit="contain" />
                ) : (
                  <img src={mapUrl} alt={selectedProperty.name} className="w-full h-full object-contain" />
                )}
              </div>
            </div>
          )}

          {/* Scope of Work */}
          {scope.length > 0 && (
            <Card className="border-primary/20">
              <CardHeader className="pb-2 py-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Shield className="w-4 h-4 text-primary" />
                  Scope of Work
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {scope.map((type, i) => (
                    <div key={type} className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-sm font-medium">{type}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Equipment (numbered) */}
          {equipment.length > 0 && (
            <Card>
              <CardHeader className="pb-2 py-4">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-muted-foreground" />
                  Equipment on Site
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-1.5">
                  {equipment.map((eq, i) => (
                    <div key={eq} className="flex items-center gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                      <span className="text-sm">{eq}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Customer Preferences */}
          {(selectedProperty.customer_preferences as any)?.preference && (
            <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Customer Preference</p>
              <p className="text-sm font-medium">🌱 {(selectedProperty.customer_preferences as any).preference}</p>
              {(selectedProperty.customer_preferences as any)?.notes && (
                <p className="text-xs text-muted-foreground mt-1">{(selectedProperty.customer_preferences as any).notes}</p>
              )}
            </div>
          )}

          {/* Follow-up alerts from past services */}
          {followUpItems.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-bold text-orange-700 uppercase tracking-wide">⚠️ Follow-up Items</p>
              {followUpItems.map(s => (
                <div key={s.id} className="text-sm text-orange-700">
                  <span className="font-medium">{s.service_type}</span>
                  {s.service_date && <span className="text-orange-500 ml-1">({new Date(s.service_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})</span>}
                  <span className="mx-1">—</span>
                  <span>{s.follow_up_notes}</span>
                </div>
              ))}
            </div>
          )}

          {/* ═══ Two Big Buttons ═══ */}
          {!serviceView && (
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setServiceView("past")}
                className="relative overflow-hidden rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-card to-primary/5 p-6 text-center transition-all hover:border-primary hover:shadow-lg active:scale-[0.98] group"
              >
                <Calendar className="w-8 h-8 mx-auto mb-2 text-primary group-hover:scale-110 transition-transform" />
                <p className="text-2xl font-bold">{pastSvcs.length}</p>
                <p className="text-sm font-semibold text-muted-foreground mt-0.5">Past Services</p>
              </button>
              <button
                onClick={() => setServiceView("upcoming")}
                className="relative overflow-hidden rounded-2xl border-2 border-secondary/30 bg-gradient-to-br from-card to-secondary/5 p-6 text-center transition-all hover:border-secondary hover:shadow-lg active:scale-[0.98] group"
              >
                <ClipboardList className="w-8 h-8 mx-auto mb-2 text-secondary group-hover:scale-110 transition-transform" />
                <p className="text-2xl font-bold">{futureSvcs.length}</p>
                <p className="text-sm font-semibold text-muted-foreground mt-0.5">Upcoming</p>
              </button>
            </div>
          )}

          {/* ═══ Service List View ═══ */}
          {serviceView && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <button onClick={() => { setServiceView(null); setExpandedServiceId(null); }} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <h2 className="font-bold text-base">{serviceView === "past" ? "Past Services" : "Upcoming Services"}</h2>
                {serviceView === "past" && (
                  <Select value={serviceSortBy} onValueChange={(v: "date" | "unit") => setServiceSortBy(v)}>
                    <SelectTrigger className="w-[110px] h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date">By Date</SelectItem>
                      <SelectItem value="unit">By Unit</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {serviceView !== "past" && <div />}
              </div>

              {serviceView === "past" ? (
                pastSvcs.length === 0 ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No past services on record</CardContent></Card>
                ) : (
                  <div className="space-y-2">
                    {pastSvcs.map((s, i) => (
                      <ServiceSnapshot
                        key={s.id}
                        service={s}
                        isExpanded={(autoExpandId === s.id && i === 0 && !expandedServiceId) || expandedServiceId === s.id}
                        onToggle={() => setExpandedServiceId(expandedServiceId === s.id ? null : s.id)}
                        onViewFull={() => setSelectedService(s)}
                        isAdmin={isAdmin}
                        uploadingPhotoId={uploadingPhotoId}
                        onUploadPhotos={uploadServicePhotos}
                        property={selectedProperty}
                      />
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-2">
                  {/* Show follow-up notes on next service */}
                  {futureSvcs.length > 0 && followUpItems.length > 0 && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 mb-2">
                      <p className="text-xs font-bold text-orange-700 mb-1">Carrying forward from previous visits:</p>
                      {followUpItems.map(s => (
                        <p key={s.id} className="text-xs text-orange-600">• {s.follow_up_notes}</p>
                      ))}
                    </div>
                  )}
                  {futureSvcs.length === 0 ? (
                    <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">No upcoming services scheduled</CardContent></Card>
                  ) : futureSvcs.map(s => (
                    <ServiceSnapshot
                      key={s.id}
                      service={s}
                      isExpanded={expandedServiceId === s.id}
                      onToggle={() => setExpandedServiceId(expandedServiceId === s.id ? null : s.id)}
                      onViewFull={() => setSelectedService(s)}
                      isAdmin={isAdmin}
                      uploadingPhotoId={uploadingPhotoId}
                      onUploadPhotos={uploadServicePhotos}
                      property={selectedProperty}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
          <p>© {new Date().getFullYear()} Crest Pest Control • 949-424-5000</p>
        </div>

        {/* Floating Chat */}
        <FloatingChat messages={chatMessages} input={chatInput} setInput={setChatInput} onSend={sendChatMessage} sending={sending} />
      </div>
    );
  }

  // ─── All Properties View ───
  const allPast = services.filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
  const allFuture = services.filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
          <div>
            <h1 className="text-lg font-bold">Client Portal</h1>
            {client && <p className="text-sm text-muted-foreground">{client.company || client.name}</p>}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="border-primary/15">
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{properties.length}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Properties</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{allPast.length}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Services Done</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-3xl font-bold">{allFuture.length}</p>
              <p className="text-xs text-muted-foreground font-medium mt-0.5">Upcoming</p>
            </CardContent>
          </Card>
        </div>

        {/* Properties */}
        <div>
          <h2 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-primary" /> Your Properties
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {properties.map(p => {
              const propPast = getPastServices(p.id);
              const propFuture = getFutureServices(p.id);
              return (
                <Card key={p.id} className="cursor-pointer hover:border-primary/40 hover:shadow-md transition-all overflow-hidden group active:scale-[0.99]"
                  onClick={() => setSelectedProperty(p)}>
                  {p.image_url && (
                    <div className="h-36 w-full overflow-hidden">
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                    </div>
                  )}
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{p.name}</p>
                        {p.address && <p className="text-xs text-muted-foreground truncate mt-0.5">{p.address}</p>}
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                      <span>{propPast.length} completed</span>
                      <span>•</span>
                      <span>{propFuture.length} upcoming</span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Crest Pest Control • 949-424-5000 • office@crestpestcontrol.com</p>
      </div>

      {/* Floating Chat */}
      <FloatingChat messages={chatMessages} input={chatInput} setInput={setChatInput} onSend={sendChatMessage} sending={sending} />
    </div>
  );
};

export default ClientPortal;
