/**
 * CommercialDashboardView — Admin-side dashboard for commercial accounts
 * (e.g. restaurants). Sibling to PropertyDashboard; PortalAdmin delegates
 * to this when property_type === "commercial".
 *
 * Differences from PropertyDashboard (apartments / HOA):
 *   • NO units, sub-locations, or unit pricing concepts.
 *   • NO work-order workflow, NO surveys, NO video tab.
 *   • Per service we only show: date, type, technician, summary/findings/notes,
 *     products used, and photos. Service editing reuses the existing admin
 *     service dialog via the same callbacks PropertyDashboard uses.
 *
 * NOTE: We deliberately do not import or reuse PropertyDashboard so the
 * apartment + HOA flows stay completely untouched.
 */
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Calendar, ClipboardList, MapPin, Edit, Trash2, FileText,
  Plus, Copy, ExternalLink, ChevronDown, FlaskConical, Camera, Image as ImageIcon,
} from "lucide-react";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import { ProductUsageSummary } from "@/components/portal/ProductUsageSummary";
import { normalizeUsageList } from "@/lib/productCatalog";

interface PropertyData {
  id: string;
  name: string;
  address: string | null;
  image_url: string | null;
  map_data: any;
  map_image_url: string | null;
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
}

interface PortalLink {
  id: string; client_id: string; token: string; link_type: string;
  label: string | null; assigned_property_ids: any; is_active: boolean;
}

interface Props {
  property: PropertyData;
  services: ServiceData[];
  links: PortalLink[];
  clientName: string;
  onOpenServiceReport: (s: ServiceData) => void;
  onEditService: (s: ServiceData) => void;
  onDeleteService: (id: string) => void;
  onCopyLink: (token: string) => void;
  onOpenPortal: (token: string) => void;
  onAddUpcomingService: () => void;
}

const todayISO = () => new Date().toISOString().split("T")[0];
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }) : "—";

export default function CommercialDashboardView({
  property, services, links, onOpenServiceReport, onEditService,
  onDeleteService, onCopyLink, onOpenPortal, onAddUpcomingService,
}: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const today = todayISO();
  const past = services.filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
  const upcoming = services
    .filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today))
    .sort((a, b) => (a.service_date || "").localeCompare(b.service_date || ""));
  const mapUrl = property.map_image_url || property.image_url || null;
  // Only show portal links that are actually targeted at this property.
  const propertyLinks = links.filter(l => {
    const ids: any = l.assigned_property_ids;
    if (!Array.isArray(ids)) return false;
    return ids.includes(property.id);
  });

  return (
    <div className="space-y-4">
      {/* Location summary */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Location</p>
              <p className="font-medium">{property.address || "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Last Visit</p>
              <p className="font-medium">{past[0] ? fmtDate(past[0].service_date) : "—"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <ClipboardList className="w-4 h-4 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Next Visit</p>
              <p className="font-medium">{upcoming[0] ? fmtDate(upcoming[0].service_date) : "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Portal links for this property */}
      {propertyLinks.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Portal Links</p>
            <div className="space-y-1.5">
              {propertyLinks.map(l => (
                <div key={l.id} className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">{l.label || l.link_type}</Badge>
                  <Button size="sm" variant="outline" onClick={() => onCopyLink(l.token)} className="h-7 text-xs gap-1">
                    <Copy className="w-3 h-3" /> Copy
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => onOpenPortal(l.token)} className="h-7 text-xs gap-1">
                    <ExternalLink className="w-3 h-3" /> Open
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Site map */}
      {(property.map_data || mapUrl) && (
        <Card>
          <CardContent className="p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
              <ImageIcon className="w-3 h-3" /> Site Map
            </p>
            <div className="w-full bg-background rounded-md overflow-hidden border border-border" style={{ height: "55vh", minHeight: 360 }}>
              {property.map_data ? (
                <ReadOnlyMapCanvas mapUrl={mapUrl || ""} mapData={property.map_data} />
              ) : mapUrl ? (
                <img src={mapUrl} alt="Site map" className="w-full h-full object-contain" />
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Upcoming Visits</p>
          <Button size="sm" variant="outline" onClick={onAddUpcomingService} className="h-7 text-xs gap-1">
            <Plus className="w-3 h-3" /> Add Visit
          </Button>
        </div>
        {upcoming.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground text-center">
            No upcoming visits scheduled.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {upcoming.map(s => (
              <Card key={s.id}>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{s.service_type}</p>
                    <p className="text-xs text-muted-foreground">
                      {fmtDate(s.service_date)}{s.service_time ? ` • ${s.service_time}` : ""}{s.technician ? ` • ${s.technician}` : ""}
                    </p>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => onOpenServiceReport(s)} className="h-8 gap-1 text-xs">
                      <FileText className="w-3 h-3" /> Report
                    </Button>
                    <Button size="icon" variant="outline" onClick={() => onEditService(s)} className="h-8 w-8">
                      <Edit className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="outline" onClick={() => onDeleteService(s.id)} className="h-8 w-8 text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Past */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-2">Past Visits</p>
        {past.length === 0 ? (
          <Card><CardContent className="p-4 text-sm text-muted-foreground text-center">
            No past visits yet.
          </CardContent></Card>
        ) : (
          <div className="space-y-2">
            {past.map(s => {
              const isOpen = openId === s.id;
              const products = normalizeUsageList(s.products_used);
              const hasFollowUp = !!s.follow_up_recommended;
              const photos: any[] = Array.isArray(s.photos) ? s.photos : [];
              return (
                <Card key={s.id} className={hasFollowUp ? "border-2 border-orange-400" : ""}>
                  <CardContent className="p-0">
                    {hasFollowUp && (
                      <div className="bg-orange-500 text-white px-3 py-1.5 rounded-t-lg flex items-center gap-2">
                        <span className="text-sm leading-none">⚠️</span>
                        <p className="font-bold text-[11px] uppercase tracking-wide">Follow-up Needed</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setOpenId(isOpen ? null : s.id)}
                        className="flex-1 min-w-0 text-left flex items-center gap-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-bold text-sm truncate">{s.service_type}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDate(s.service_date)}{s.technician ? ` • ${s.technician}` : ""}
                          </p>
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      <div className="flex gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => onOpenServiceReport(s)} className="h-8 gap-1 text-xs">
                          <FileText className="w-3 h-3" /> Report
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => onEditService(s)} className="h-8 w-8">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="icon" variant="outline" onClick={() => onDeleteService(s.id)} className="h-8 w-8 text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {isOpen && (
                      <div className="px-3 pb-3 pt-2 border-t border-border/60 space-y-3">
                        {hasFollowUp && s.follow_up_notes && (
                          <div className="bg-orange-50 border border-orange-200 rounded-md p-2.5">
                            <p className="text-[11px] font-bold text-orange-800 uppercase tracking-wide mb-0.5">Follow-up Notes</p>
                            <p className="text-sm text-orange-900 whitespace-pre-wrap">{s.follow_up_notes}</p>
                          </div>
                        )}
                        {s.summary && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Summary</p>
                            <p className="text-sm whitespace-pre-wrap">{s.summary}</p>
                          </div>
                        )}
                        {s.findings && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Findings</p>
                            <p className="text-sm whitespace-pre-wrap">{s.findings}</p>
                          </div>
                        )}
                        {s.notes && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-0.5">Notes</p>
                            <p className="text-sm whitespace-pre-wrap">{s.notes}</p>
                          </div>
                        )}
                        {products.length > 0 && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                              <FlaskConical className="w-3 h-3" /> Products Used
                            </p>
                            <ProductUsageSummary entries={products} />
                          </div>
                        )}
                        {photos.length > 0 && (
                          <div>
                            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
                              <Camera className="w-3 h-3" /> Photos
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {photos.map((p: any, i: number) => {
                                const url = typeof p === "string" ? p : p?.url;
                                if (!url) return null;
                                return (
                                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 rounded-md border border-border overflow-hidden bg-muted">
                                    <img src={url} alt={`Photo ${i + 1}`} loading="lazy" className="w-full h-full object-cover" />
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}