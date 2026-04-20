import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ClipboardList, Send, Wrench, Shield, MapPin, FileText, Download, Copy,
  Eye, Clock, CheckCircle, AlertCircle, Phone, Mail,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ReadOnlyMapCanvas } from "@/components/ReadOnlyMapCanvas";
import crestLogo from "@/assets/crest-logo.png";

const PEST_TYPES = [
  "Ants", "Spiders", "American Roaches", "German Cockroaches", "Crickets",
  "Earwigs", "Rodents", "Bed Bugs", "Fleas", "Mosquitoes", "Wasps",
  "Silverfish", "Drain Flies", "Pantry Pests", "Other",
];

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

interface PrepSheet {
  id: string;
  title: string;
  description: string | null;
  treatment_type: string;
  file_url: string | null;
}

interface RequestData {
  id: string;
  request_type: string;
  description: string;
  status: string;
  response_notes: string | null;
  unit_number: string | null;
  created_at: string;
  pest_type?: string | null;
  location_type?: string | null;
  preferred_date?: string | null;
}

interface PMPortalViewProps {
  propertyId: string;
  linkId: string;
  /** When true, hides the page chrome (header) — used inside admin preview. */
  embedded?: boolean;
}

const PMPortalView = ({ propertyId, linkId, embedded = false }: PMPortalViewProps) => {
  const [loading, setLoading] = useState(true);
  const [property, setProperty] = useState<PropertyData | null>(null);
  const [scopeOfWork, setScopeOfWork] = useState<string[]>([]);
  const [knownUnits, setKnownUnits] = useState<string[]>([]);
  const [prepSheets, setPrepSheets] = useState<PrepSheet[]>([]);
  const [requests, setRequests] = useState<RequestData[]>([]);

  // Work order form
  const [submitting, setSubmitting] = useState(false);
  const [unitNumber, setUnitNumber] = useState("");
  const [pestType, setPestType] = useState("");
  const [locationType, setLocationType] = useState("Interior");
  const [description, setDescription] = useState("");
  const [preferredDateChoice, setPreferredDateChoice] = useState<"next" | "few-weeks" | "other">("next");
  const [preferredDateCustom, setPreferredDateCustom] = useState("");

  useEffect(() => {
    loadAll();
  }, [propertyId, linkId]);

  const loadAll = async () => {
    setLoading(true);

    const [{ data: prop }, { data: svcs }, { data: sheets }, { data: reqs }] = await Promise.all([
      supabase.from("portal_properties").select("*").eq("id", propertyId).maybeSingle(),
      supabase.from("portal_services").select("service_type, unit_details").eq("property_id", propertyId),
      supabase.from("portal_prep_sheets").select("*").order("title"),
      supabase.from("portal_requests").select("*").eq("link_id", linkId).order("created_at", { ascending: false }),
    ]);

    if (prop) setProperty(prop as PropertyData);

    if (Array.isArray(svcs)) {
      const types = new Set<string>();
      const units = new Set<string>();
      svcs.forEach((s: any) => {
        if (s.service_type) types.add(s.service_type);
        if (Array.isArray(s.unit_details)) {
          s.unit_details.forEach((u: any) => { if (u?.unit_number) units.add(String(u.unit_number)); });
        }
      });
      setScopeOfWork(Array.from(types));
      setKnownUnits(Array.from(units).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
    }

    if (Array.isArray(sheets)) setPrepSheets(sheets);
    if (Array.isArray(reqs)) setRequests(reqs);

    setLoading(false);
  };

  const computePreferredDate = (): string | null => {
    if (preferredDateChoice === "next") {
      // next 7 days
      const d = new Date();
      d.setDate(d.getDate() + 7);
      return d.toISOString().split("T")[0];
    }
    if (preferredDateChoice === "few-weeks") {
      const d = new Date();
      d.setDate(d.getDate() + 21);
      return d.toISOString().split("T")[0];
    }
    return preferredDateCustom || null;
  };

  const submitRequest = async () => {
    if (!unitNumber.trim() || !pestType) return;
    setSubmitting(true);

    const { error: err } = await supabase.from("portal_requests").insert({
      link_id: linkId,
      property_id: propertyId,
      unit_number: unitNumber.trim(),
      request_type: "Service Request",
      description: `${pestType} - ${locationType}${description ? ` - ${description}` : ""}`,
      pest_type: pestType,
      location_type: locationType,
      preferred_date: computePreferredDate(),
    } as any);

    if (!err) {
      toast({ title: "Work order submitted", description: "Crest will reach out shortly." });
      setUnitNumber("");
      setPestType("");
      setDescription("");
      setPreferredDateChoice("next");
      setPreferredDateCustom("");
      // reload requests
      const { data: reqs } = await supabase
        .from("portal_requests")
        .select("*")
        .eq("link_id", linkId)
        .order("created_at", { ascending: false });
      if (reqs) setRequests(reqs);
    } else {
      toast({ title: "Error", description: "Could not submit work order.", variant: "destructive" });
    }
    setSubmitting(false);
  };

  const copyPrepLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: "Link copied" });
    } catch {
      toast({ title: "Couldn't copy link", variant: "destructive" });
    }
  };

  const downloadPrep = async (sheet: PrepSheet) => {
    if (!sheet.file_url) return;
    try {
      const a = document.createElement("a");
      a.href = sheet.file_url;
      a.download = `${sheet.title}.pdf`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(sheet.file_url, "_blank", "noopener,noreferrer");
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-4 h-4 text-yellow-500" />;
      case "in_progress": return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case "resolved":
      case "completed": return <CheckCircle className="w-4 h-4 text-green-500" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="text-center">
          <img src={crestLogo} alt="Crest Pest Control" className="h-12 mx-auto mb-3 animate-pulse" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-[200px] flex items-center justify-center">
        <p className="text-destructive text-sm">Property not found.</p>
      </div>
    );
  }

  const equipment: { name: string; count: number }[] = Array.isArray(property.equipment)
    ? (property.equipment as any[]).map((e) =>
        typeof e === "string" ? { name: e, count: 1 } : { name: e?.name ?? "", count: e?.count ?? 1 }
      )
    : [];
  const mapUrl = property.map_image_url || property.image_url;
  const customerPref = (property.customer_preferences as any)?.preference;
  const customerPrefNotes = (property.customer_preferences as any)?.notes;

  const content = (
    <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">
      {/* Property header card */}
      <Card>
        <CardContent className="p-4 flex items-start gap-3">
          {property.image_url && (
            <img src={property.image_url} alt={property.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-base truncate">{property.name}</h2>
            {property.address && <p className="text-xs text-muted-foreground truncate">{property.address}</p>}
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      {mapUrl && (
        <div className="rounded-xl overflow-hidden border shadow-sm bg-muted">
          <div className="aspect-[3/4] relative max-w-md mx-auto">
            {property.map_data ? (
              <ReadOnlyMapCanvas mapUrl={mapUrl} mapData={property.map_data} />
            ) : (
              <img src={mapUrl} alt={property.name} className="w-full h-full object-cover" />
            )}
          </div>
        </div>
      )}

      {/* Scope of Work */}
      {scopeOfWork.length > 0 && (
        <Card className="border-primary/20">
          <CardHeader className="pb-2 py-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              Scope of Work
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-1.5">
              {scopeOfWork.map((type, i) => (
                <div key={type} className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-sm font-medium">{type}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Equipment */}
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
                <div key={`${eq.name}-${i}`} className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                  <span className="text-sm">{eq.name}{eq.count > 1 ? ` ×${eq.count}` : ""}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Customer Preference */}
      {customerPref && (
        <div className="bg-primary/5 border border-primary/15 rounded-xl p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">Customer Preference</p>
          <p className="text-sm font-medium">🌱 {customerPref}</p>
          {customerPrefNotes && <p className="text-xs text-muted-foreground mt-1">{customerPrefNotes}</p>}
        </div>
      )}

      {/* ─── Submit Work Order ─── */}
      <Card className="border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            Submit a Work Order
          </CardTitle>
          <p className="text-xs text-muted-foreground">Tell us what's going on and we'll schedule service.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Unit / Area */}
          <div>
            <Label className="text-sm">Unit or Area *</Label>
            {knownUnits.length > 0 ? (
              <div className="space-y-1">
                <Select value={unitNumber} onValueChange={setUnitNumber}>
                  <SelectTrigger><SelectValue placeholder="Select or type unit / area" /></SelectTrigger>
                  <SelectContent>
                    {knownUnits.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    <SelectItem value="__other">Other (type below)...</SelectItem>
                  </SelectContent>
                </Select>
                {unitNumber === "__other" && (
                  <Input
                    placeholder="Type unit or area (e.g. Pool deck, Unit 204)"
                    onChange={e => setUnitNumber(e.target.value)}
                  />
                )}
              </div>
            ) : (
              <Input
                placeholder="Type unit or area (e.g. Unit 204, Lobby)"
                value={unitNumber}
                onChange={e => setUnitNumber(e.target.value)}
              />
            )}
          </div>

          {/* Pest type */}
          <div>
            <Label className="text-sm">What are you dealing with? *</Label>
            <Select value={pestType} onValueChange={setPestType}>
              <SelectTrigger><SelectValue placeholder="Select pest type" /></SelectTrigger>
              <SelectContent>
                {PEST_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Location */}
          <div>
            <Label className="text-sm">Where is the issue?</Label>
            <div className="flex gap-2 mt-1">
              {["Interior", "Exterior", "Both"].map(loc => (
                <button key={loc}
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm border transition-colors flex-1 ${locationType === loc ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                  onClick={() => setLocationType(loc)}
                >{loc}</button>
              ))}
            </div>
          </div>

          {/* Preferred day */}
          <div>
            <Label className="text-sm">Preferred Day</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {([
                { key: "next", label: "Next service" },
                { key: "few-weeks", label: "Next few weeks" },
                { key: "other", label: "Other" },
              ] as const).map(opt => (
                <button key={opt.key}
                  type="button"
                  className={`px-3 py-2 rounded-lg text-xs border transition-colors ${preferredDateChoice === opt.key ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                  onClick={() => setPreferredDateChoice(opt.key)}
                >{opt.label}</button>
              ))}
            </div>
            {preferredDateChoice === "other" && (
              <Input
                className="mt-2"
                placeholder="Tell us when works (e.g. Tuesday afternoon, after the 15th)"
                value={preferredDateCustom}
                onChange={e => setPreferredDateCustom(e.target.value)}
              />
            )}
          </div>

          {/* Additional details */}
          <div>
            <Label className="text-sm">Additional Details</Label>
            <Textarea
              placeholder="Any extra context — where exactly you're seeing the issue, severity, etc."
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
            />
          </div>

          <Button className="w-full" size="lg" onClick={submitRequest}
            disabled={!unitNumber.trim() || unitNumber === "__other" || !pestType || submitting}>
            <Send className="w-4 h-4 mr-2" />Submit Work Order
          </Button>
        </CardContent>
      </Card>

      {/* ─── Past Work Orders ─── */}
      {requests.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Your Previous Work Orders</h3>
          <div className="space-y-2">
            {requests.map(r => (
              <Card key={r.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(r.status)}
                      <Badge variant="outline" className="text-xs">
                        {r.status === "in_progress" ? "In Progress" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>
                  </div>
                  {r.unit_number && <p className="text-xs text-muted-foreground">{r.unit_number}</p>}
                  <p className="text-sm mt-1">{r.description}</p>
                  {r.response_notes && (
                    <div className="mt-2 bg-muted rounded-md p-2">
                      <p className="text-xs font-medium text-muted-foreground mb-0.5">Response from Crest:</p>
                      <p className="text-sm">{r.response_notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ─── Prep Sheets ─── */}
      <Card>
        <CardHeader className="pb-2 py-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="w-4 h-4 text-muted-foreground" />
            Prep Sheets
          </CardTitle>
          <p className="text-xs text-muted-foreground">View, download, or copy a link to share with tenants.</p>
        </CardHeader>
        <CardContent className="pt-0">
          {prepSheets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No prep sheets available yet.</p>
          ) : (
            <div className="space-y-2">
              {prepSheets.map(sheet => (
                <div key={sheet.id} className="border rounded-lg p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{sheet.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <Badge variant="outline" className="text-xs">{sheet.treatment_type}</Badge>
                        {sheet.description && <span className="text-xs text-muted-foreground">{sheet.description}</span>}
                      </div>
                    </div>
                  </div>
                  {sheet.file_url ? (
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" className="h-8" asChild>
                        <a href={sheet.file_url} target="_blank" rel="noopener noreferrer">
                          <Eye className="w-3.5 h-3.5 mr-1" />View
                        </a>
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => downloadPrep(sheet)}>
                        <Download className="w-3.5 h-3.5 mr-1" />Download
                      </Button>
                      <Button size="sm" variant="outline" className="h-8" onClick={() => copyPrepLink(sheet.file_url!)}>
                        <Copy className="w-3.5 h-3.5 mr-1" />Copy Link
                      </Button>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">No file available — contact Crest for a copy.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header — NO back/home button (PMs cannot navigate to other properties) */}
      <div className="bg-card border-b px-4 py-3 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <img src={crestLogo} alt="Crest Pest Control" className="h-9" />
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-base truncate">{property.name}</h1>
            <p className="text-xs text-muted-foreground">Property Manager Portal</p>
          </div>
        </div>
      </div>

      {content}

      <div className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
        <p className="flex items-center justify-center gap-3">
          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />949-424-5000</span>
          <span className="flex items-center gap-1"><Mail className="w-3 h-3" />office@crestpestco.com</span>
        </p>
        <p className="mt-1">© {new Date().getFullYear()} Crest Pest Control</p>
      </div>
    </div>
  );
};

export default PMPortalView;
