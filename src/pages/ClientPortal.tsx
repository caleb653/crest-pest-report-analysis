import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, ClipboardList, FileText, MessageSquare, Phone, Mail, ChevronRight, Download, Send } from "lucide-react";
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
  image_url: string | null;
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

interface ChatMessage {
  id: string;
  sender_name: string;
  sender_type: string;
  message: string;
  subject: string;
  created_at: string;
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

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (token) loadPortal();
  }, [token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Poll for new messages every 10 seconds
  useEffect(() => {
    if (!linkData) return;
    const interval = setInterval(() => loadMessages(), 10000);
    return () => clearInterval(interval);
  }, [linkData]);

  const loadPortal = async () => {
    setLoading(true);
    const { data: link } = await supabase.from("portal_links").select("*").eq("token", token).eq("is_active", true).single();
    if (!link) { setError("Invalid or expired link"); setLoading(false); return; }
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

    const { data: ps } = await supabase.from("portal_prep_sheets").select("*").order("title");
    if (ps) setPrepSheets(ps);

    // Load messages for this client
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

    // Save message to DB
    const { error: err } = await supabase.from("portal_messages").insert({
      link_id: linkData.id,
      client_id: linkData.client_id,
      sender_name: senderName,
      sender_type: "client",
      subject: "Portal Chat",
      message: chatInput.trim(),
    });

    if (!err) {
      // Email the office
      try {
        await supabase.functions.invoke("send-portal-message", {
          body: {
            senderName,
            propertyName: client.company || null,
            subject: `Chat from ${senderName}`,
            message: chatInput.trim(),
          },
        });
      } catch (e) {
        console.error("Email send failed:", e);
      }

      setChatInput("");
      loadMessages();
    } else {
      toast({ title: "Error", description: "Could not send message.", variant: "destructive" });
    }
    setSending(false);
  };

  const today = new Date().toISOString().split("T")[0];
  const filteredServices = services.filter(s => {
    if (selectedProperty !== "all" && s.property_id !== selectedProperty) return false;
    return true;
  });
  const pastServices = filteredServices.filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
  const futureServices = filteredServices.filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today));

  const getPropertyName = (id: string) => properties.find(p => p.id === id)?.name || "";

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

        {/* Properties */}
        {properties.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2">Properties</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              {(selectedProperty === "all" ? properties : properties.filter(p => p.id === selectedProperty)).map(p => (
                <Card key={p.id} className={`overflow-hidden cursor-pointer transition-colors ${selectedProperty === p.id ? "border-primary" : "hover:border-primary/30"}`}
                  onClick={() => setSelectedProperty(selectedProperty === p.id ? "all" : p.id)}>
                  {p.image_url && <img src={p.image_url} alt={p.name} className="w-full h-28 object-cover" />}
                  <CardContent className="p-3">
                    <p className="font-medium text-sm">{p.name}</p>
                    {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
                    <p className="text-xs text-muted-foreground mt-1">{services.filter(s => s.property_id === p.id).length} services</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {selectedProperty !== "all" && (
              <Button variant="ghost" size="sm" onClick={() => setSelectedProperty("all")} className="text-xs">← All Properties</Button>
            )}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full grid grid-cols-4 mb-4">
            <TabsTrigger value="past"><Calendar className="w-4 h-4 mr-1 hidden sm:inline" />Past</TabsTrigger>
            <TabsTrigger value="future"><ClipboardList className="w-4 h-4 mr-1 hidden sm:inline" />Upcoming</TabsTrigger>
            <TabsTrigger value="prep"><FileText className="w-4 h-4 mr-1 hidden sm:inline" />Prep Sheets</TabsTrigger>
            <TabsTrigger value="message"><MessageSquare className="w-4 h-4 mr-1 hidden sm:inline" />Chat</TabsTrigger>
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

          {/* Chat */}
          <TabsContent value="message">
            <Card className="flex flex-col" style={{ height: "480px" }}>
              <CardHeader className="pb-2 border-b shrink-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Chat with Crest Pest Control
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    <p>No messages yet. Send a message below to get started.</p>
                    <div className="flex items-center justify-center gap-4 mt-3 text-xs">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />949-424-5000</span>
                      <span className="flex items-center gap-1"><Mail className="w-3 h-3" />office@crestpestco.com</span>
                    </div>
                  </div>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === "client" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      msg.sender_type === "client"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {msg.sender_type === "admin" && (
                        <p className="text-xs font-medium mb-1 opacity-70">Crest Pest Control</p>
                      )}
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <p className={`text-xs mt-1 ${msg.sender_type === "client" ? "opacity-70" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </CardContent>
              <div className="border-t p-3 shrink-0">
                <form onSubmit={e => { e.preventDefault(); sendChatMessage(); }} className="flex gap-2">
                  <Input
                    placeholder="Type a message..."
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    disabled={sending}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={!chatInput.trim() || sending}>
                    <Send className="w-4 h-4" />
                  </Button>
                </form>
              </div>
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
