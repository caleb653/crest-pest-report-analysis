import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ArrowLeft, Plus, Copy, ExternalLink, Trash2, Building2, Link2, MapPin, ClipboardList, FileText, MessageSquare, ChevronRight, Calendar, Phone, Mail, Download, Settings, Send } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import crestLogo from "@/assets/crest-logo.png";

interface PortalClient {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  created_at: string;
}

interface PortalProperty {
  id: string;
  client_id: string;
  name: string;
  address: string | null;
  notes: string | null;
}

interface PortalLink {
  id: string;
  client_id: string;
  token: string;
  link_type: string;
  label: string | null;
  assigned_property_ids: any;
  is_active: boolean;
}

interface PortalService {
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
  follow_up_recommended: boolean | null;
  follow_up_notes: string | null;
  scheduling_status: string | null;
  prep_required: boolean | null;
  prep_notes: string | null;
  unit_details: any;
  special_notes: string | null;
}

interface PortalPrepSheet {
  id: string;
  title: string;
  description: string | null;
  treatment_type: string;
  file_url: string | null;
}

interface PortalMessage {
  id: string;
  sender_name: string;
  sender_email: string | null;
  sender_type: string;
  property_name: string | null;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
  client_id: string | null;
}

const PortalAdmin = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<PortalClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<PortalClient | null>(null);
  const [properties, setProperties] = useState<PortalProperty[]>([]);
  const [links, setLinks] = useState<PortalLink[]>([]);
  const [services, setServices] = useState<PortalService[]>([]);
  const [prepSheets, setPrepSheets] = useState<PortalPrepSheet[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);

  // Client portal view state
  const [selectedProperty, setSelectedProperty] = useState<PortalProperty | null>(null);
  const [selectedService, setSelectedService] = useState<PortalService | null>(null);
  const [portalTab, setPortalTab] = useState("past");
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Global admin tab (when no client selected)
  const [globalTab, setGlobalTab] = useState("clients");

  // Chat state
  const [chatMessages, setChatMessages] = useState<PortalMessage[]>([]);
  const [adminChatInput, setAdminChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const [messagesClientId, setMessagesClientId] = useState<string | null>(null);
  const adminChatEndRef = useRef<HTMLDivElement>(null);

  // Dialog states
  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddPrepSheet, setShowAddPrepSheet] = useState(false);

  // Form states
  const [newClient, setNewClient] = useState({ name: "", company: "", email: "", phone: "", notes: "" });
  const [newProperty, setNewProperty] = useState({ name: "", address: "", notes: "" });
  const [newLink, setNewLink] = useState({ link_type: "sub", label: "", assigned_property_ids: [] as string[] });
  const [newService, setNewService] = useState({ property_id: "", service_date: "", service_type: "", technician: "", status: "scheduled", summary: "", findings: "", notes: "", scheduling_status: "confirmed" });
  const [newPrepSheet, setNewPrepSheet] = useState({ title: "", description: "", treatment_type: "", file_url: "" });

  useEffect(() => {
    loadClients();
    loadPrepSheets();
    loadMessages();
  }, []);

  useEffect(() => {
    if (selectedClient) {
      loadProperties(selectedClient.id);
      loadLinks(selectedClient.id);
      loadClientChat(selectedClient.id);
      setSelectedProperty(null);
      setSelectedService(null);
      setPortalTab("past");
    }
  }, [selectedClient]);

  // Poll for new messages when viewing a client
  useEffect(() => {
    if (!selectedClient) return;
    const interval = setInterval(() => loadClientChat(selectedClient.id), 10000);
    return () => clearInterval(interval);
  }, [selectedClient]);

  useEffect(() => {
    adminChatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const loadClients = async () => {
    const { data } = await supabase.from("portal_clients").select("*").order("created_at", { ascending: false });
    if (data) setClients(data);
  };

  const loadProperties = async (clientId: string) => {
    const { data } = await supabase.from("portal_properties").select("*").eq("client_id", clientId);
    if (data) {
      setProperties(data);
      const propertyIds = data.map(p => p.id);
      if (propertyIds.length > 0) {
        const { data: svcData } = await supabase.from("portal_services").select("*").in("property_id", propertyIds).order("service_date", { ascending: false });
        if (svcData) setServices(svcData);
      } else {
        setServices([]);
      }
    }
  };

  const loadLinks = async (clientId: string) => {
    const { data } = await supabase.from("portal_links").select("*").eq("client_id", clientId);
    if (data) setLinks(data);
  };

  const loadPrepSheets = async () => {
    const { data } = await supabase.from("portal_prep_sheets").select("*").order("title");
    if (data) setPrepSheets(data);
  };

  const loadMessages = async () => {
    const { data } = await supabase.from("portal_messages").select("*").order("created_at", { ascending: false });
    if (data) setMessages(data);
  };

  const loadClientChat = async (clientId: string) => {
    const { data } = await supabase
      .from("portal_messages")
      .select("*")
      .eq("client_id", clientId)
      .order("created_at", { ascending: true });
    if (data) setChatMessages(data);
  };

  const sendAdminChat = async () => {
    if (!adminChatInput.trim() || !selectedClient) return;
    setSendingChat(true);
    const { error: err } = await supabase.from("portal_messages").insert({
      client_id: selectedClient.id,
      sender_name: "Crest Pest Control",
      sender_type: "admin",
      subject: "Portal Chat",
      message: adminChatInput.trim(),
    });
    if (!err) {
      setAdminChatInput("");
      loadClientChat(selectedClient.id);
    }
    setSendingChat(false);
  };

  const addClient = async () => {
    const { error } = await supabase.from("portal_clients").insert({ name: newClient.name, company: newClient.company || null, email: newClient.email || null, phone: newClient.phone || null, notes: newClient.notes || null });
    if (!error) {
      toast({ title: "Client added" });
      setShowAddClient(false);
      setNewClient({ name: "", company: "", email: "", phone: "", notes: "" });
      loadClients();
    }
  };

  const addProperty = async () => {
    if (!selectedClient) return;
    const { error } = await supabase.from("portal_properties").insert({ client_id: selectedClient.id, name: newProperty.name, address: newProperty.address || null, notes: newProperty.notes || null });
    if (!error) {
      toast({ title: "Property added" });
      setShowAddProperty(false);
      setNewProperty({ name: "", address: "", notes: "" });
      loadProperties(selectedClient.id);
    }
  };

  const addLink = async () => {
    if (!selectedClient) return;
    const { error } = await supabase.from("portal_links").insert({
      client_id: selectedClient.id,
      link_type: newLink.link_type,
      label: newLink.label || null,
      assigned_property_ids: newLink.assigned_property_ids.length > 0 ? newLink.assigned_property_ids : null,
    });
    if (!error) {
      toast({ title: "Link created" });
      setShowAddLink(false);
      setNewLink({ link_type: "sub", label: "", assigned_property_ids: [] });
      loadLinks(selectedClient.id);
    }
  };

  const addService = async () => {
    const propId = newService.property_id || (selectedProperty?.id) || "";
    if (!propId) return;
    const { error } = await supabase.from("portal_services").insert({
      property_id: propId,
      service_date: newService.service_date || null,
      service_type: newService.service_type,
      technician: newService.technician || null,
      status: newService.status,
      summary: newService.summary || null,
      findings: newService.findings || null,
      notes: newService.notes || null,
      scheduling_status: newService.scheduling_status || "confirmed",
    });
    if (!error) {
      toast({ title: "Service added" });
      setShowAddService(false);
      setNewService({ property_id: "", service_date: "", service_type: "", technician: "", status: "scheduled", summary: "", findings: "", notes: "", scheduling_status: "confirmed" });
      if (selectedClient) loadProperties(selectedClient.id);
    }
  };

  const addPrepSheet = async () => {
    const { error } = await supabase.from("portal_prep_sheets").insert({
      title: newPrepSheet.title,
      description: newPrepSheet.description || null,
      treatment_type: newPrepSheet.treatment_type,
      file_url: newPrepSheet.file_url || null,
    });
    if (!error) {
      toast({ title: "Prep sheet added" });
      setShowAddPrepSheet(false);
      setNewPrepSheet({ title: "", description: "", treatment_type: "", file_url: "" });
      loadPrepSheets();
    }
  };

  const deleteClient = async (id: string) => {
    await supabase.from("portal_clients").delete().eq("id", id);
    if (selectedClient?.id === id) setSelectedClient(null);
    loadClients();
    toast({ title: "Client deleted" });
  };

  const deleteProperty = async (id: string) => {
    await supabase.from("portal_properties").delete().eq("id", id);
    if (selectedProperty?.id === id) setSelectedProperty(null);
    if (selectedClient) loadProperties(selectedClient.id);
    toast({ title: "Property deleted" });
  };

  const deleteLink = async (id: string) => {
    await supabase.from("portal_links").delete().eq("id", id);
    if (selectedClient) loadLinks(selectedClient.id);
    toast({ title: "Link deleted" });
  };

  const deleteService = async (id: string) => {
    await supabase.from("portal_services").delete().eq("id", id);
    if (selectedClient) loadProperties(selectedClient.id);
    toast({ title: "Service deleted" });
  };

  const deletePrepSheet = async (id: string) => {
    await supabase.from("portal_prep_sheets").delete().eq("id", id);
    loadPrepSheets();
    toast({ title: "Prep sheet deleted" });
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/portal/${token}`;
    navigator.clipboard.writeText(url);
    toast({ title: "Link copied to clipboard" });
  };

  const openPortal = (token: string) => {
    window.open(`/portal/${token}`, "_blank");
  };

  const getPropertyName = (propertyId: string) => properties.find(p => p.id === propertyId)?.name || "Unknown";

  const today = new Date().toISOString().split("T")[0];

  // Filter services based on selected property or show all
  const visibleServices = selectedProperty
    ? services.filter(s => s.property_id === selectedProperty.id)
    : services;

  const pastServices = visibleServices.filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
  const futureServices = visibleServices.filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today));

  const masterLink = links.find(l => l.link_type === "master");

  // ============ CLIENT LIST VIEW ============
  if (!selectedClient) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={crestLogo} alt="Crest" className="h-8" />
          <h1 className="text-lg font-bold">Client Portal Admin</h1>
        </div>

        <div className="p-4 max-w-5xl mx-auto">
          <Tabs value={globalTab} onValueChange={setGlobalTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="clients"><Building2 className="w-4 h-4 mr-1" />Clients</TabsTrigger>
              <TabsTrigger value="prep-sheets"><FileText className="w-4 h-4 mr-1" />Prep Sheets</TabsTrigger>
              <TabsTrigger value="messages"><MessageSquare className="w-4 h-4 mr-1" />Messages</TabsTrigger>
            </TabsList>

            <TabsContent value="clients">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Clients</CardTitle>
                  <Dialog open={showAddClient} onOpenChange={setShowAddClient}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Client</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add Client</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div><Label>Name *</Label><Input value={newClient.name} onChange={e => setNewClient({ ...newClient, name: e.target.value })} /></div>
                        <div><Label>Company</Label><Input value={newClient.company} onChange={e => setNewClient({ ...newClient, company: e.target.value })} /></div>
                        <div><Label>Email</Label><Input value={newClient.email} onChange={e => setNewClient({ ...newClient, email: e.target.value })} /></div>
                        <div><Label>Phone</Label><Input value={newClient.phone} onChange={e => setNewClient({ ...newClient, phone: e.target.value })} /></div>
                        <div><Label>Notes</Label><Textarea value={newClient.notes} onChange={e => setNewClient({ ...newClient, notes: e.target.value })} /></div>
                        <Button onClick={addClient} disabled={!newClient.name} className="w-full">Add Client</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {clients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No clients yet. Add your first client above.</p>
                  ) : (
                    <div className="space-y-2">
                      {clients.map(c => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between border rounded-lg p-4 cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors"
                          onClick={() => setSelectedClient(c)}
                        >
                          <div>
                            <p className="font-medium">{c.name}</p>
                            {c.company && <p className="text-sm text-muted-foreground">{c.company}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); deleteClient(c.id); }}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                            <ChevronRight className="w-5 h-5 text-muted-foreground" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Prep Sheets tab */}
            <TabsContent value="prep-sheets">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Prep Sheets</CardTitle>
                  <Dialog open={showAddPrepSheet} onOpenChange={setShowAddPrepSheet}>
                    <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle>Add Prep Sheet</DialogTitle></DialogHeader>
                      <div className="space-y-3">
                        <div><Label>Title *</Label><Input value={newPrepSheet.title} onChange={e => setNewPrepSheet({ ...newPrepSheet, title: e.target.value })} /></div>
                        <div><Label>Treatment Type *</Label><Input placeholder="e.g. Bed Bug, Roach" value={newPrepSheet.treatment_type} onChange={e => setNewPrepSheet({ ...newPrepSheet, treatment_type: e.target.value })} /></div>
                        <div><Label>Description</Label><Textarea value={newPrepSheet.description} onChange={e => setNewPrepSheet({ ...newPrepSheet, description: e.target.value })} /></div>
                        <div><Label>File URL</Label><Input placeholder="https://..." value={newPrepSheet.file_url} onChange={e => setNewPrepSheet({ ...newPrepSheet, file_url: e.target.value })} /></div>
                        <Button onClick={addPrepSheet} disabled={!newPrepSheet.title || !newPrepSheet.treatment_type} className="w-full">Add Prep Sheet</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  {prepSheets.length === 0 ? <p className="text-sm text-muted-foreground">No prep sheets</p> : (
                    <div className="space-y-2">
                      {prepSheets.map(ps => (
                        <div key={ps.id} className="flex items-center justify-between border rounded-md p-3">
                          <div>
                            <p className="font-medium text-sm">{ps.title}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge variant="outline" className="text-xs">{ps.treatment_type}</Badge>
                              {ps.description && <span className="text-xs text-muted-foreground">{ps.description}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {ps.file_url && (
                              <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                <a href={ps.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a>
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePrepSheet(ps.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Messages tab — grouped by client */}
            <TabsContent value="messages">
              <Card>
                <CardHeader><CardTitle className="text-base">Client Messages</CardTitle></CardHeader>
                <CardContent>
                  {messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet</p> : (() => {
                    // Group messages by client_id and show latest per client
                    const clientMap = new Map<string, { clientName: string; lastMessage: PortalMessage; unread: number }>();
                    messages.forEach(m => {
                      const key = m.client_id || m.sender_name;
                      if (!clientMap.has(key)) {
                        clientMap.set(key, { clientName: m.sender_name, lastMessage: m, unread: m.is_read ? 0 : 1 });
                      } else {
                        const existing = clientMap.get(key)!;
                        if (!m.is_read) existing.unread++;
                      }
                    });
                    return (
                      <div className="space-y-2">
                        {Array.from(clientMap.entries()).map(([key, data]) => {
                          const matchingClient = clients.find(c => c.id === key);
                          return (
                            <div
                              key={key}
                              className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                if (matchingClient) setSelectedClient(matchingClient);
                              }}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">{matchingClient?.name || data.clientName}</p>
                                  <p className="text-xs text-muted-foreground truncate max-w-xs mt-1">{data.lastMessage.message}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {data.unread > 0 && <Badge className="text-xs">{data.unread}</Badge>}
                                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                                </div>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{new Date(data.lastMessage.created_at).toLocaleString()}</p>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    );
  }

  // ============ CLIENT PORTAL VIEW (Admin impersonation) ============
  return (
    <div className="min-h-screen bg-background">
      {/* Admin bar */}
      <div className="bg-foreground text-background px-4 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-background hover:text-background/80 h-7 px-2" onClick={() => {
            if (selectedProperty) { setSelectedProperty(null); setSelectedService(null); }
            else setSelectedClient(null);
          }}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            {selectedProperty ? "All Properties" : "All Clients"}
          </Button>
          <span className="text-background/60">Admin View</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-background hover:text-background/80 h-7 px-2" onClick={() => setShowAdminPanel(!showAdminPanel)}>
            <Settings className="w-3.5 h-3.5 mr-1" />Manage
          </Button>
          {masterLink && (
            <Button variant="ghost" size="sm" className="text-background hover:text-background/80 h-7 px-2" onClick={() => copyLink(masterLink.token)}>
              <Copy className="w-3.5 h-3.5 mr-1" />Copy Master Link
            </Button>
          )}
        </div>
      </div>

      {/* Portal header */}
      <div className="bg-card border-b px-4 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
            <div>
              <h1 className="text-lg font-bold">Client Portal</h1>
              <p className="text-sm text-muted-foreground">
                {selectedProperty
                  ? selectedProperty.name
                  : (selectedClient.company || selectedClient.name)}
              </p>
            </div>
          </div>
          {!selectedProperty && <Badge variant="outline" className="text-xs">Master View</Badge>}
        </div>
      </div>

      {/* Admin management panel (toggle) */}
      {showAdminPanel && (
        <div className="bg-muted/50 border-b">
          <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
            {/* Client info */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{selectedClient.name} {selectedClient.company && <span className="text-muted-foreground">— {selectedClient.company}</span>}</p>
                <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                  {selectedClient.email && <span>{selectedClient.email}</span>}
                  {selectedClient.phone && <span>{selectedClient.phone}</span>}
                </div>
              </div>
            </div>

            {/* Access Links */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2 py-3">
                <CardTitle className="text-sm flex items-center gap-1"><Link2 className="w-4 h-4" />Access Links</CardTitle>
                <Dialog open={showAddLink} onOpenChange={setShowAddLink}>
                  <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" />Add Link</Button></DialogTrigger>
                  <DialogContent>
                    <DialogHeader><DialogTitle>Create Access Link</DialogTitle></DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Type</Label>
                        <Select value={newLink.link_type} onValueChange={v => setNewLink({ ...newLink, link_type: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="master">Master (all properties)</SelectItem>
                            <SelectItem value="sub">Sub (specific properties)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Label</Label><Input placeholder="e.g. Building A Manager" value={newLink.label} onChange={e => setNewLink({ ...newLink, label: e.target.value })} /></div>
                      {newLink.link_type === "sub" && properties.length > 0 && (
                        <div>
                          <Label>Assigned Properties</Label>
                          <div className="space-y-1 mt-1">
                            {properties.map(p => (
                              <label key={p.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={newLink.assigned_property_ids.includes(p.id)}
                                  onChange={e => {
                                    if (e.target.checked) setNewLink({ ...newLink, assigned_property_ids: [...newLink.assigned_property_ids, p.id] });
                                    else setNewLink({ ...newLink, assigned_property_ids: newLink.assigned_property_ids.filter(id => id !== p.id) });
                                  }}
                                />
                                {p.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      <Button onClick={addLink} className="w-full">Create Link</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="pt-0">
                {links.length === 0 ? <p className="text-xs text-muted-foreground">No links created</p> : (
                  <div className="space-y-2">
                    {links.map(l => (
                      <div key={l.id} className="flex items-center gap-2 text-sm border rounded-md p-2">
                        <Badge variant={l.link_type === "master" ? "default" : "secondary"}>{l.link_type}</Badge>
                        <span className="flex-1 truncate">{l.label || "Unnamed"}</span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(l.token)}><Copy className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPortal(l.token)}><ExternalLink className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteLink(l.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Add Property / Add Service quick actions */}
            <div className="flex gap-2 flex-wrap">
              <Dialog open={showAddProperty} onOpenChange={setShowAddProperty}>
                <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" />Add Property</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Property</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Name *</Label><Input value={newProperty.name} onChange={e => setNewProperty({ ...newProperty, name: e.target.value })} /></div>
                    <div><Label>Address</Label><Input value={newProperty.address} onChange={e => setNewProperty({ ...newProperty, address: e.target.value })} /></div>
                    <div><Label>Notes</Label><Textarea value={newProperty.notes} onChange={e => setNewProperty({ ...newProperty, notes: e.target.value })} /></div>
                    <Button onClick={addProperty} disabled={!newProperty.name} className="w-full">Add Property</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={showAddService} onOpenChange={setShowAddService}>
                <DialogTrigger asChild><Button size="sm" variant="outline" disabled={properties.length === 0}><Plus className="w-3 h-3 mr-1" />Add Service</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Service</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>Property *</Label>
                      <Select value={newService.property_id || (selectedProperty?.id || "")} onValueChange={v => setNewService({ ...newService, property_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                        <SelectContent>
                          {properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Service Date</Label><Input type="date" value={newService.service_date} onChange={e => setNewService({ ...newService, service_date: e.target.value })} /></div>
                    <div><Label>Service Type *</Label><Input placeholder="e.g. General Pest Control" value={newService.service_type} onChange={e => setNewService({ ...newService, service_type: e.target.value })} /></div>
                    <div><Label>Technician</Label><Input value={newService.technician} onChange={e => setNewService({ ...newService, technician: e.target.value })} /></div>
                    <div>
                      <Label>Status</Label>
                      <Select value={newService.status} onValueChange={v => setNewService({ ...newService, status: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scheduled">Scheduled</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="cancelled">Cancelled</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div><Label>Summary</Label><Textarea value={newService.summary} onChange={e => setNewService({ ...newService, summary: e.target.value })} /></div>
                    <div><Label>Findings</Label><Textarea value={newService.findings} onChange={e => setNewService({ ...newService, findings: e.target.value })} /></div>
                    <div><Label>Notes</Label><Textarea value={newService.notes} onChange={e => setNewService({ ...newService, notes: e.target.value })} /></div>
                    <Button onClick={addService} disabled={!(newService.property_id || selectedProperty?.id) || !newService.service_type} className="w-full">Add Service</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      )}

      {/* Portal content */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Quick summary */}
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
                {futureServices.length > 0 && futureServices[0]?.service_date
                  ? new Date(futureServices[0].service_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : "—"}
              </p>
              <p className="text-xs text-muted-foreground">Next Service</p>
            </CardContent>
          </Card>
        </div>

        {/* Properties list (when not drilled into a property) */}
        {!selectedProperty && properties.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><MapPin className="w-4 h-4" />Properties</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {properties.map(p => (
                <Card key={p.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelectedProperty(p)}>
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
                      <p className="text-xs text-muted-foreground mt-1">
                        {services.filter(s => s.property_id === p.id).length} services
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {showAdminPanel && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteProperty(p.id); }}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Service Tabs */}
        <Tabs value={portalTab} onValueChange={setPortalTab}>
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
                          {!selectedProperty && <span>{getPropertyName(s.property_id)}</span>}
                          {s.technician && <span>Tech: {s.technician}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {showAdminPanel && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteService(s.id); }}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
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
                          {!selectedProperty && <span>{getPropertyName(s.property_id)}</span>}
                          {s.prep_required && <Badge variant="outline" className="text-xs">Prep Required</Badge>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {showAdminPanel && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteService(s.id); }}>
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
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

          {/* Chat with this client */}
          <TabsContent value="message">
            <Card className="flex flex-col" style={{ height: "480px" }}>
              <CardHeader className="pb-2 border-b shrink-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" /> Chat with {selectedClient.company || selectedClient.name}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && (
                  <div className="text-center text-sm text-muted-foreground py-8">
                    <p>No messages yet with this client.</p>
                  </div>
                )}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                      msg.sender_type === "admin"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted"
                    }`}>
                      {msg.sender_type === "client" && (
                        <p className="text-xs font-medium mb-1 opacity-70">{msg.sender_name}</p>
                      )}
                      <p className="whitespace-pre-wrap">{msg.message}</p>
                      <p className={`text-xs mt-1 ${msg.sender_type === "admin" ? "opacity-70" : "text-muted-foreground"}`}>
                        {new Date(msg.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
                <div ref={adminChatEndRef} />
              </CardContent>
              <div className="border-t p-3 shrink-0">
                <form onSubmit={e => { e.preventDefault(); sendAdminChat(); }} className="flex gap-2">
                  <Input
                    placeholder="Type a message to this client..."
                    value={adminChatInput}
                    onChange={e => setAdminChatInput(e.target.value)}
                    disabled={sendingChat}
                    className="flex-1"
                  />
                  <Button type="submit" size="icon" disabled={!adminChatInput.trim() || sendingChat}>
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

                {showAdminPanel && (
                  <Button variant="destructive" size="sm" className="w-full" onClick={() => { deleteService(selectedService.id); setSelectedService(null); }}>
                    Delete Service
                  </Button>
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

export default PortalAdmin;
