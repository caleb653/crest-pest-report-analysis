import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Send, Clock, CheckCircle, AlertCircle, Bug, ClipboardList, FileText } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import crestLogo from "@/assets/crest-logo.png";

const PEST_TYPES = [
  "General Pests",
  "Ants", "Spiders", "American Roaches", "German Cockroaches", "Crickets",
  "Earwigs", "Rodents", "Bed Bugs", "Fleas", "Mosquitoes", "Wasps",
  "Silverfish", "Drain Flies", "Pantry Pests", "Other",
];

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

const TenantPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkData, setLinkData] = useState<any>(null);
  const [propertyName, setPropertyName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [unitNumber, setUnitNumber] = useState("");
  const [requestKind, setRequestKind] = useState<"treatment" | "inspection">("treatment");
  const [pestType, setPestType] = useState("");
  const [locationType, setLocationType] = useState("");
  const [occupancyStatus, setOccupancyStatus] = useState<"" | "Occupied" | "Vacant">("");
  const [description, setDescription] = useState("");
  const [preferredDate, setPreferredDate] = useState("");

  // Known units from this property
  const [knownUnits, setKnownUnits] = useState<string[]>([]);

  useEffect(() => {
    if (token) loadPortal();
  }, [token]);

  const loadPortal = async () => {
    setLoading(true);
    const { data: link } = await supabase
      .from("portal_links")
      .select("*")
      .eq("token", token)
      .eq("is_active", true)
      .single();

    if (!link) {
      setError("Invalid or expired link");
      setLoading(false);
      return;
    }
    setLinkData(link);

    // Pre-fill unit number from link
    if (link.unit_number) setUnitNumber(link.unit_number);

    // Get property name & discover units
    if (link.assigned_property_ids && Array.isArray(link.assigned_property_ids) && link.assigned_property_ids.length > 0) {
      const propId = String(link.assigned_property_ids[0]);
      const { data: prop } = await supabase
        .from("portal_properties")
        .select("name")
        .eq("id", propId)
        .single();
      if (prop) setPropertyName(prop.name);

      // Discover units from past services
      const { data: svcs } = await supabase
        .from("portal_services")
        .select("unit_details")
        .eq("property_id", propId);
      if (svcs) {
        const units = new Set<string>();
        svcs.forEach(s => {
          if (Array.isArray(s.unit_details)) {
            (s.unit_details as any[]).forEach(u => { if (u.unit_number) units.add(u.unit_number); });
          }
        });
        setKnownUnits(Array.from(units).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
      }
    }

    // NOTE: We intentionally do NOT load previous work orders on the tenant portal.
    // Tenants must never see what other tenants (or even their past selves) have submitted.
    setLoading(false);
  };

  const submitRequest = async () => {
    if (!unitNumber.trim() || !pestType || !linkData) return;
    setSubmitting(true);

    const propertyId = linkData.assigned_property_ids?.[0] || null;

    // Case-insensitive match: if the typed unit matches a known unit (any case), use the canonical version
    const typed = unitNumber.trim();
    const canonical = knownUnits.find(u => u.toLowerCase() === typed.toLowerCase()) || typed;

    const { data: inserted, error: err } = await supabase.from("portal_requests").insert({
      link_id: linkData.id,
      property_id: propertyId,
      unit_number: canonical,
      request_type: requestKind === "inspection" ? "Inspection Request" : "Service Request",
      description: `${pestType}${locationType ? ` - ${locationType}` : ""}${description ? ` - ${description}` : ""}`,
      pest_type: pestType,
      location_type: locationType || null,
      occupancy_status: occupancyStatus || null,
      preferred_date: preferredDate || null,
    } as any).select("id").maybeSingle();

    if (!err) {
      toast({ title: requestKind === "inspection" ? "Inspection request submitted" : "Work order submitted", description: "We'll get back to you soon." });
      if (inserted?.id) {
        try {
          await supabase.functions.invoke("notify-submission", {
            body: { kind: "work_order", requestId: inserted.id },
          });
        } catch (e) { console.error("notify-submission failed", e); }
      }
      setRequestKind("treatment");
      setPestType("");
      setLocationType("");
      setOccupancyStatus("");
      setDescription("");
      setPreferredDate("");
      loadPortal();
    } else {
      toast({ title: "Error", description: "Could not submit request.", variant: "destructive" });
    }
    setSubmitting(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="w-4 h-4 text-yellow-500" />;
      case "in_progress": return <AlertCircle className="w-4 h-4 text-blue-500" />;
      case "resolved": return <CheckCircle className="w-4 h-4 text-green-500" />;
      default: return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <img src={crestLogo} alt="Crest Pest Control" className="h-16 mx-auto mb-4" />
        <p className="text-muted-foreground">Loading...</p>
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
          <div>
            <h1 className="text-lg font-bold">Service Request Form</h1>
            {propertyName && <p className="text-sm text-muted-foreground">{propertyName}</p>}
            {linkData?.unit_number && (
              <p className="text-xs text-muted-foreground">Unit {linkData.unit_number}</p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
        {/* ─── Request Form ─── */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-primary" />Submit a Work Order
            </CardTitle>
            <p className="text-xs text-muted-foreground">Tell us what's going on and we'll schedule service.</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Request Type — Treatment vs Inspection */}
            <div>
              <Label className="text-sm">Request Type *</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {[
                  { v: "treatment" as const, label: "Treatment", desc: "Active pest treatment", Icon: Bug },
                  { v: "inspection" as const, label: "Inspection", desc: "Assess & investigate", Icon: FileText },
                ].map(opt => {
                  const active = requestKind === opt.v;
                  const Icon = opt.Icon;
                  return (
                    <button
                      key={opt.v}
                      type="button"
                      onClick={() => setRequestKind(opt.v)}
                      className={`px-3 py-3 rounded-lg border-2 text-center transition-colors ${
                        active
                          ? "bg-primary/10 border-primary text-primary"
                          : "bg-background border-border hover:bg-muted"
                      }`}
                    >
                      <Icon className="w-5 h-5 mx-auto mb-1" />
                      <div className="text-sm font-bold">{opt.label}</div>
                      <div className="text-[11px] text-muted-foreground">{opt.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Unit Number — free-text, case-insensitive match against known units */}
            <div>
              <Label className="text-sm">Unit, Property, or Area *</Label>
              {linkData?.unit_number ? (
                <Input value={unitNumber} disabled className="bg-muted" />
              ) : (
                <>
                  <Input
                    list="tenant-known-units"
                    placeholder="Type unit or area (e.g. 204, Lobby, Pool deck)"
                    value={unitNumber}
                    onChange={e => setUnitNumber(e.target.value)}
                    autoComplete="off"
                  />
                  {knownUnits.length > 0 && (
                    <datalist id="tenant-known-units">
                      {knownUnits.map(u => <option key={u} value={u} />)}
                    </datalist>
                  )}
                </>
              )}
            </div>

            {/* Pest Type */}
            <div>
              <Label className="text-sm">What are you dealing with? *</Label>
              <Select value={pestType} onValueChange={setPestType}>
                <SelectTrigger><SelectValue placeholder="Select pest type" /></SelectTrigger>
                <SelectContent>
                  {PEST_TYPES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Interior / Exterior */}
            <div>
              <Label className="text-sm">Where is the issue?</Label>
              <div className="flex gap-2 mt-1">
                {["Interior", "Exterior", "Both"].map(loc => (
                  <button key={loc}
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors flex-1 ${locationType === loc ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-border"}`}
                    onClick={() => setLocationType(loc)}
                  >{loc}</button>
                ))}
              </div>
            </div>

            {/* Additional comments */}
            <div>
              <Label className="text-sm">Additional Details</Label>
              <Textarea
                placeholder="Any extra context — where exactly you're seeing the issue, severity, etc."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Vacant or Occupied */}
            <div>
              <Label className="text-sm">Vacant or Occupied Unit</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                {(["Occupied", "Vacant"] as const).map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setOccupancyStatus(occupancyStatus === opt ? "" : opt)}
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                      occupancyStatus === opt
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <Button className="w-full" size="lg" onClick={submitRequest}
              disabled={!unitNumber.trim() || unitNumber === "__other" || !pestType || submitting}>
              <Send className="w-4 h-4 mr-2" />Submit {requestKind === "inspection" ? "Inspection Request" : "Work Order"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
        <p>Need urgent help? Call 949-424-5000</p>
        <p className="mt-1">© {new Date().getFullYear()} Crest Pest Control</p>
      </div>
    </div>
  );
};

export default TenantPortal;
