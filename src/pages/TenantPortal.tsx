import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Send, Plus, Clock, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import crestLogo from "@/assets/crest-logo.png";

interface RequestData {
  id: string;
  request_type: string;
  description: string;
  status: string;
  response_notes: string | null;
  unit_number: string | null;
  created_at: string;
}

const REQUEST_TYPES = [
  "Service Request",
  "Pest Issue Report",
  "Schedule Change",
  "Question",
  "Other",
];

const TenantPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkData, setLinkData] = useState<any>(null);
  const [propertyName, setPropertyName] = useState("");
  const [requests, setRequests] = useState<RequestData[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [newRequest, setNewRequest] = useState({
    request_type: "Service Request",
    description: "",
    unit_number: "",
  });

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

    // Get property name
    if (link.assigned_property_ids && Array.isArray(link.assigned_property_ids) && link.assigned_property_ids.length > 0) {
      const { data: prop } = await supabase
        .from("portal_properties")
        .select("name")
        .eq("id", String(link.assigned_property_ids[0]))
        .single();
      if (prop) setPropertyName(prop.name);
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
    if (!newRequest.description.trim() || !linkData) return;
    setSubmitting(true);

    const propertyId = linkData.assigned_property_ids?.[0] || null;

    const { error: err } = await supabase.from("portal_requests").insert({
      link_id: linkData.id,
      property_id: propertyId,
      unit_number: newRequest.unit_number || linkData.unit_number || null,
      request_type: newRequest.request_type,
      description: newRequest.description.trim(),
    });

    if (!err) {
      toast({ title: "Request submitted", description: "We'll get back to you soon." });
      setNewRequest({ request_type: "Service Request", description: "", unit_number: "" });
      setShowForm(false);
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

  const getStatusColor = (status: string) => {
    switch (status) {
      case "pending": return "bg-yellow-100 text-yellow-800 border-yellow-300";
      case "in_progress": return "bg-blue-100 text-blue-800 border-blue-300";
      case "resolved": return "bg-green-100 text-green-800 border-green-300";
      default: return "";
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
            <h1 className="text-lg font-bold">Tenant Portal</h1>
            {propertyName && <p className="text-sm text-muted-foreground">{propertyName}</p>}
            {(linkData?.unit_number || linkData?.label) && (
              <p className="text-xs text-muted-foreground">
                {linkData.unit_number ? `Unit ${linkData.unit_number}` : linkData.label}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Submit Request Button */}
        {!showForm && (
          <Button className="w-full" size="lg" onClick={() => setShowForm(true)}>
            <Plus className="w-5 h-5 mr-2" />Submit a Request
          </Button>
        )}

        {/* Request Form */}
        {showForm && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">New Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Request Type</Label>
                <Select value={newRequest.request_type} onValueChange={v => setNewRequest(r => ({ ...r, request_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REQUEST_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!linkData?.unit_number && (
                <div>
                  <Label>Unit Number (optional)</Label>
                  <Input
                    placeholder="e.g. 204"
                    value={newRequest.unit_number}
                    onChange={e => setNewRequest(r => ({ ...r, unit_number: e.target.value }))}
                  />
                </div>
              )}
              <div>
                <Label>Description *</Label>
                <Textarea
                  placeholder="Describe your request or issue..."
                  value={newRequest.description}
                  onChange={e => setNewRequest(r => ({ ...r, description: e.target.value }))}
                  rows={4}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button className="flex-1" onClick={submitRequest} disabled={!newRequest.description.trim() || submitting}>
                  <Send className="w-4 h-4 mr-1" />Submit
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Past Requests */}
        <div>
          <h2 className="text-sm font-semibold mb-2">Your Requests</h2>
          {requests.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center text-muted-foreground text-sm">
                No requests yet. Submit your first request above.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {requests.map(r => (
                <Card key={r.id}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(r.status)}
                        <Badge variant="outline" className={`text-xs ${getStatusColor(r.status)}`}>
                          {r.status === "in_progress" ? "In Progress" : r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </Badge>
                        <Badge variant="secondary" className="text-xs">{r.request_type}</Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    {r.unit_number && (
                      <p className="text-xs text-muted-foreground mb-1">Unit {r.unit_number}</p>
                    )}
                    <p className="text-sm">{r.description}</p>
                    {r.response_notes && (
                      <div className="mt-2 bg-muted rounded-md p-2">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Response from Crest:</p>
                        <p className="text-sm">{r.response_notes}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
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
