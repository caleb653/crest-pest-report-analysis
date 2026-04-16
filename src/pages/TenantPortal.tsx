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
import { Send, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import crestLogo from "@/assets/crest-logo.png";

const PEST_TYPES = [
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
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [unitNumber, setUnitNumber] = useState("");
  const [pestType, setPestType] = useState("");
  const [locationType, setLocationType] = useState("Interior");
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

    if (!link || link.link_type !== "tenant") {
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

    // Load requests for this link
    const { data: reqs } = await supabase
      .from("portal_requests")
      .select("*")
      .eq("link_id", link.id)
      .order("created_at", { ascending: false });
    if (reqs) setRequests(reqs);

    setLoading(false);
  };

  const submitRequest = async () => {
    if (!unitNumber.trim() || !pestType || !linkData) return;
    setSubmitting(true);

    const propertyId = linkData.assigned_property_ids?.[0] || null;

    const { error: err } = await supabase.from("portal_requests").insert({
      link_id: linkData.id,
      property_id: propertyId,
      unit_number: unitNumber.trim(),
      request_type: "Service Request",
      description: `${pestType} - ${locationType}${description ? ` - ${description}` : ""}`,
      pest_type: pestType,
      location_type: locationType,
      preferred_date: preferredDate || null,
    } as any);

    if (!err) {
      toast({ title: "Request submitted", description: "We'll get back to you soon." });
      setPestType("");
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
            <CardTitle className="text-base">Submit a Service Request</CardTitle>
            <p className="text-xs text-muted-foreground">Tell us what you're dealing with and we'll schedule service</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Unit Number */}
            <div>
              <Label className="text-sm">Unit Number *</Label>
              {linkData?.unit_number ? (
                <Input value={unitNumber} disabled className="bg-muted" />
              ) : knownUnits.length > 0 ? (
                <Select value={unitNumber} onValueChange={setUnitNumber}>
                  <SelectTrigger><SelectValue placeholder="Select your unit" /></SelectTrigger>
                  <SelectContent>
                    {knownUnits.map(u => <SelectItem key={u} value={u}>Unit {u}</SelectItem>)}
                    <SelectItem value="__other">Other...</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input placeholder="e.g. 204" value={unitNumber} onChange={e => setUnitNumber(e.target.value)} />
              )}
              {unitNumber === "__other" && (
                <Input className="mt-1" placeholder="Enter your unit number" onChange={e => setUnitNumber(e.target.value)} />
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

            {/* When ready */}
            <div>
              <Label className="text-sm">When are you available for service?</Label>
              <Input type="date" value={preferredDate} onChange={e => setPreferredDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]} />
              <p className="text-xs text-muted-foreground mt-0.5">Leave blank if any time works</p>
            </div>

            {/* Additional comments */}
            <div>
              <Label className="text-sm">Additional Details</Label>
              <Textarea
                placeholder="Where exactly are you seeing the issue? Any other details..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            <Button className="w-full" size="lg" onClick={submitRequest}
              disabled={!unitNumber.trim() || unitNumber === "__other" || !pestType || submitting}>
              <Send className="w-4 h-4 mr-2" />Submit Request
            </Button>
          </CardContent>
        </Card>

        {/* ─── Past Requests ─── */}
        {requests.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold mb-2">Your Previous Requests</h2>
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
                    {r.unit_number && <p className="text-xs text-muted-foreground">Unit {r.unit_number}</p>}
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
