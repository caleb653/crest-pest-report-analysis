import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ClipboardList, FileText, MessageSquare, Phone, Mail, Building2, MapPin, ChevronRight, ExternalLink, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import crestLogo from "@/assets/crest-logo.png";

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

interface PrepSheet {
  id: string;
  title: string;
  description: string | null;
  treatment_type: string;
  file_url: string | null;
}

const ClientPortal = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [linkData, setLinkData] = useState<LinkData | null>(null);
  const [client, setClient] = useState<ClientData | null>(null);
  const [properties, setProperties] = useState<PropertyData[]>([]);
  const [services, setServices] = useState<ServiceData[]>([]);
  const [prepSheets, setPrepSheets] = useState<PrepSheet[]>([]);
  const [selectedService, setSelectedService] = useState<ServiceData | null>(null);
  const [activeTab, setActiveTab] = useState("past");
  const [selectedProperty, setSelectedProperty] = useState<string>("all");

  // Message form
  const [msgName, setMsgName] = useState("");
  const [msgEmail, setMsgEmail] = useState("");
  const [msgProperty, setMsgProperty] = useState("");
  const [msgSubject, setMsgSubject] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (token) loadPortal();
  }, [token]);

  const loadPortal = async () => {
    setLoading(true);
    // Get link
    const { data: link } = await supabase.from("portal_links").select("*").eq("token", token).eq("is_active", true).single();
    if (!link) { setError("Invalid or expired link"); setLoading(false); return; }
    setLinkData(link);

    // Get client
    const { data: c } = await supabase.from("portal_clients").select("id, name, company").eq("id", link.client_id).single();
    if (c) setClient(c);

    // Get properties
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

    // Get prep sheets
    const { data: ps } = await supabase.from("portal_prep_sheets").select("*").order("title");
    if (ps) setPrepSheets(ps);

    setLoading(false);
  };

  const sendMessage = async () => {
    if (!msgName || !msgSubject || !msgBody) return;
    setSending(true);
    const { error: err } = await supabase.from("portal_messages").insert({
      link_id: linkData?.id || null,
      sender_name: msgName,
      sender_email: msgEmail || null,
      property_name: msgProperty || null,
      subject: msgSubject,
      message: msgBody,
    });
    setSending(false);
    if (!err) {
      toast({ title: "Message sent", description: "We'll get back to you shortly." });
      setMsgName(""); setMsgEmail(""); setMsgProperty(""); setMsgSubject(""); setMsgBody("");
    } else {
      toast({ title: "Error", description: "Could not send message. Please try again.", variant: "destructive" });
    }
  };

  const today = new Date().toISOString().split("T")[0];
  const filteredServices = services.filter(s => {
    if (selectedProperty !== "all" && s.property_id !== selectedProperty) return false;
    return true;
  });
  const pastServices = filteredServices.filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
  const futureServices = filteredServices.filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today));

  const getPropertyName = (id: string) => properties.find(p => p.id === id)?.name || "";
  const getPropertyAddress = (id: string) => properties.find(p => p.id === id)?.address || "";

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <img src={crestLogo} alt="Crest Pest Control" className="h-16 mx-auto mb-4" />
        <p className="text-muted-foreground">Loading portal...</p>
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
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
            <div>
              <h1 className="text-lg font-bold">Client Portal</h1>
              {client && <p className="text-sm text-muted-foreground">{client.company || client.name}</p>}
            </div>
          </div>
          {linkData?.link_type === "master" && (
            <Badge variant="outline" className="text-xs">Master View</Badge>
          )}
        </div>
      </div>

      {/* Quick summary */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{pastServices.length}</p>
              <p className="text-xs text-muted-foreground">Past Services</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{futureServices.length}</p>
              <p className="text-xs text-muted-foreground">Upcoming</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-sm leading-8">
                {futureServices.length > 0 && futureServices[0].service_date
                  ? new Date(futureServices[0].service_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Next Service</p>
            </CardContent>
          </Card>
        </div>

        {/* Property filter */}
        {properties.length > 1 && (
          <div className="mb-4">
            <Select value={selectedProperty} onValueChange={setSelectedProperty}>
              <SelectTrigger className="w-full sm:w-64">
                <SelectValue placeholder="Filter by property" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Properties</SelectItem>
                {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="past"><Calendar className="w-4 h-4 mr-1 hidden sm:inline" />Past</TabsTrigger>
            <TabsTrigger value="future"><ClipboardList className="w-4 h-4 mr-1 hidden sm:inline" />Upcoming</TabsTrigger>
            <TabsTrigger value="prep"><FileText className="w-4 h-4 mr-1 hidden sm:inline" />Prep Sheets</TabsTrigger>
            <TabsTrigger value="message"><MessageSquare className="w-4 h-4 mr-1 hidden sm:inline" />Message</TabsTrigger>
          </TabsList>

          {/* Past Services */}
          <TabsContent value="past">
            {pastServices.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-muted-foreground">No past services on record</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {pastServices.map(s => (
                  <Card key={s.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelectedService(s)}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{s.service_type}</p>
                          <Badge variant={s.status === "completed" ? "default" : "secondary"} className="text-xs">{s.status}</Badge>
                          {s.follow_up_recommended && <Badge variant="outline" className="text-xs text-orange-600 border-orange-300">Follow-up</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{s.service_date ? new Date(s.service_date + "T00:00:00").toLocaleDateString() : "No date"}</span>
                          <span>{getPropertyName(s.property_id)}</span>
                          {s.technician && <span>Tech: {s.technician}</span>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Future Services */}
          <TabsContent value="future">
            {futureServices.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-muted-foreground">No upcoming services scheduled</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {futureServices.map(s => (
                  <Card key={s.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => setSelectedService(s)}>
                    <CardContent className="p-3 flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{s.service_type}</p>
                          <Badge variant="secondary" className="text-xs">{s.scheduling_status || "confirmed"}</Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{s.service_date ? new Date(s.service_date + "T00:00:00").toLocaleDateString() : "TBD"}</span>
                          <span>{getPropertyName(s.property_id)}</span>
                          {s.prep_required && <Badge variant="outline" className="text-xs">Prep Required</Badge>}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Prep Sheets */}
          <TabsContent value="prep">
            {prepSheets.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-muted-foreground">No prep sheets available</CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {prepSheets.map(ps => (
                  <Card key={ps.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-sm">{ps.title}</p>
                          <Badge variant="outline" className="text-xs mt-1">{ps.treatment_type}</Badge>
                          {ps.description && <p className="text-xs text-muted-foreground mt-2">{ps.description}</p>}
                        </div>
                        {ps.file_url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={ps.file_url} target="_blank" rel="noopener noreferrer"><Download className="w-3 h-3 mr-1" />Download</a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Message Crest */}
          <TabsContent value="message">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contact Crest Pest Control</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div><Label>Your Name *</Label><Input value={msgName} onChange={e => setMsgName(e.target.value)} /></div>
                  <div><Label>Email</Label><Input type="email" value={msgEmail} onChange={e => setMsgEmail(e.target.value)} /></div>
                </div>
                {properties.length > 0 && (
                  <div>
                    <Label>Property</Label>
                    <Select value={msgProperty} onValueChange={setMsgProperty}>
                      <SelectTrigger><SelectValue placeholder="Select property (optional)" /></SelectTrigger>
                      <SelectContent>
                        {properties.map(p => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Subject *</Label><Input value={msgSubject} onChange={e => setMsgSubject(e.target.value)} /></div>
                <div><Label>Message *</Label><Textarea rows={4} value={msgBody} onChange={e => setMsgBody(e.target.value)} /></div>
                <Button onClick={sendMessage} disabled={!msgName || !msgSubject || !msgBody || sending} className="w-full">
                  {sending ? "Sending..." : "Send Message"}
                </Button>
              </CardContent>
            </Card>

            <Card className="mt-4">
              <CardContent className="p-4 flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-muted-foreground" /><span>949-424-5000</span></div>
                <div className="flex items-center gap-2"><Mail className="w-4 h-4 text-muted-foreground" /><span>office@crestpestco.com</span></div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Service Detail Modal */}
      <Dialog open={!!selectedService} onOpenChange={() => setSelectedService(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedService && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{selectedService.service_type}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><p className="text-xs text-muted-foreground">Property</p><p className="font-medium">{getPropertyName(selectedService.property_id)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Date</p><p>{selectedService.service_date ? new Date(selectedService.service_date + "T00:00:00").toLocaleDateString() : "—"}</p></div>
                  {selectedService.service_time && <div><p className="text-xs text-muted-foreground">Time</p><p>{selectedService.service_time}</p></div>}
                  {selectedService.technician && <div><p className="text-xs text-muted-foreground">Technician</p><p>{selectedService.technician}</p></div>}
                  <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={selectedService.status === "completed" ? "default" : "secondary"}>{selectedService.status}</Badge></div>
                  {selectedService.scheduling_status && <div><p className="text-xs text-muted-foreground">Scheduling</p><p>{selectedService.scheduling_status}</p></div>}
                </div>

                {selectedService.summary && <div><p className="text-xs text-muted-foreground mb-1">Summary</p><p>{selectedService.summary}</p></div>}
                {selectedService.findings && <div><p className="text-xs text-muted-foreground mb-1">Findings</p><p>{selectedService.findings}</p></div>}
                {selectedService.notes && <div><p className="text-xs text-muted-foreground mb-1">Notes</p><p>{selectedService.notes}</p></div>}

                {selectedService.products_used && Array.isArray(selectedService.products_used) && selectedService.products_used.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Products Used</p>
                    <div className="flex flex-wrap gap-1">{(selectedService.products_used as string[]).map((p, i) => <Badge key={i} variant="outline" className="text-xs">{p}</Badge>)}</div>
                  </div>
                )}

                {selectedService.follow_up_recommended && (
                  <div className="bg-orange-50 border border-orange-200 rounded-md p-2">
                    <p className="text-xs font-medium text-orange-700">Follow-up Recommended</p>
                    {selectedService.follow_up_notes && <p className="text-xs text-orange-600 mt-1">{selectedService.follow_up_notes}</p>}
                  </div>
                )}

                {selectedService.prep_required && selectedService.prep_notes && (
                  <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                    <p className="text-xs font-medium text-blue-700">Prep Required</p>
                    <p className="text-xs text-blue-600 mt-1">{selectedService.prep_notes}</p>
                  </div>
                )}

                {selectedService.special_notes && <div><p className="text-xs text-muted-foreground mb-1">Special Notes</p><p>{selectedService.special_notes}</p></div>}

                {/* Unit Details */}
                {selectedService.unit_details && Array.isArray(selectedService.unit_details) && (selectedService.unit_details as any[]).length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Unit Details</p>
                    <Accordion type="multiple">
                      {(selectedService.unit_details as any[]).map((unit: any, i: number) => (
                        <AccordionItem key={i} value={`unit-${i}`}>
                          <AccordionTrigger className="text-sm py-2">
                            Unit {unit.unit_number || i + 1}
                            {unit.status && <Badge variant="outline" className="ml-2 text-xs">{unit.status}</Badge>}
                          </AccordionTrigger>
                          <AccordionContent className="text-xs space-y-1">
                            {unit.findings && <p><span className="text-muted-foreground">Findings:</span> {unit.findings}</p>}
                            {unit.notes && <p><span className="text-muted-foreground">Notes:</span> {unit.notes}</p>}
                            {unit.pest_activity && <p><span className="text-muted-foreground">Pest Activity:</span> {unit.pest_activity}</p>}
                            {unit.products_used && <p><span className="text-muted-foreground">Products:</span> {unit.products_used}</p>}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Crest Pest Control • 949-424-5000 • office@crestpestco.com</p>
      </div>
    </div>
  );
};

export default ClientPortal;
