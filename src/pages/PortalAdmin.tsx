import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Plus, Copy, ExternalLink, Trash2, Building2, Link2, MapPin, ClipboardList, FileText, MessageSquare } from "lucide-react";
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
  service_type: string;
  technician: string | null;
  status: string;
  summary: string | null;
  findings: string | null;
  notes: string | null;
  products_used: any;
  follow_up_recommended: boolean | null;
  scheduling_status: string | null;
  unit_details: any;
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
  property_name: string | null;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
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
  const [activeTab, setActiveTab] = useState("clients");

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
    }
  }, [selectedClient]);

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
    const { error } = await supabase.from("portal_services").insert({
      property_id: newService.property_id,
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

  const getPropertyName = (propertyId: string) => {
    return properties.find(p => p.id === propertyId)?.name || "Unknown";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-card border-b px-4 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <img src={crestLogo} alt="Crest" className="h-8" />
        <h1 className="text-lg font-bold">Client Portal Admin</h1>
      </div>

      <div className="p-4 max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="clients"><Building2 className="w-4 h-4 mr-1" />Clients</TabsTrigger>
            <TabsTrigger value="prep-sheets"><FileText className="w-4 h-4 mr-1" />Prep Sheets</TabsTrigger>
            <TabsTrigger value="messages"><MessageSquare className="w-4 h-4 mr-1" />Messages</TabsTrigger>
          </TabsList>

          {/* ====== CLIENTS TAB ====== */}
          <TabsContent value="clients">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Client list */}
              <Card className="lg:col-span-1">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Clients</CardTitle>
                  <Dialog open={showAddClient} onOpenChange={setShowAddClient}>
                    <DialogTrigger asChild>
                      <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add</Button>
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
                <CardContent className="p-0">
                  {clients.length === 0 ? (
                    <p className="text-sm text-muted-foreground p-4">No clients yet</p>
                  ) : (
                    <div className="divide-y max-h-[60vh] overflow-y-auto">
                      {clients.map(c => (
                        <div
                          key={c.id}
                          className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedClient?.id === c.id ? "bg-primary/10" : ""}`}
                          onClick={() => setSelectedClient(c)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm">{c.name}</p>
                              {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                            </div>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteClient(c.id); }}>
                              <Trash2 className="w-3.5 h-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Client detail */}
              <div className="lg:col-span-2 space-y-4">
                {!selectedClient ? (
                  <Card><CardContent className="p-8 text-center text-muted-foreground">Select a client to manage</CardContent></Card>
                ) : (
                  <>
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{selectedClient.name} {selectedClient.company && <span className="text-muted-foreground font-normal">— {selectedClient.company}</span>}</CardTitle>
                      </CardHeader>
                      <CardContent className="text-sm space-y-1">
                        {selectedClient.email && <p>Email: {selectedClient.email}</p>}
                        {selectedClient.phone && <p>Phone: {selectedClient.phone}</p>}
                        {selectedClient.notes && <p className="text-muted-foreground">{selectedClient.notes}</p>}
                      </CardContent>
                    </Card>

                    {/* Access Links */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
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
                      <CardContent>
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

                    {/* Properties */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm flex items-center gap-1"><MapPin className="w-4 h-4" />Properties</CardTitle>
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
                      </CardHeader>
                      <CardContent>
                        {properties.length === 0 ? <p className="text-xs text-muted-foreground">No properties</p> : (
                          <div className="space-y-2">
                            {properties.map(p => (
                              <div key={p.id} className="flex items-center justify-between text-sm border rounded-md p-2">
                                <div>
                                  <p className="font-medium">{p.name}</p>
                                  {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
                                </div>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteProperty(p.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Services */}
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm flex items-center gap-1"><ClipboardList className="w-4 h-4" />Services</CardTitle>
                        <Dialog open={showAddService} onOpenChange={setShowAddService}>
                          <DialogTrigger asChild><Button size="sm" variant="outline" disabled={properties.length === 0}><Plus className="w-3 h-3 mr-1" />Add Service</Button></DialogTrigger>
                          <DialogContent>
                            <DialogHeader><DialogTitle>Add Service</DialogTitle></DialogHeader>
                            <div className="space-y-3">
                              <div>
                                <Label>Property *</Label>
                                <Select value={newService.property_id} onValueChange={v => setNewService({ ...newService, property_id: v })}>
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
                              <Button onClick={addService} disabled={!newService.property_id || !newService.service_type} className="w-full">Add Service</Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </CardHeader>
                      <CardContent>
                        {services.length === 0 ? <p className="text-xs text-muted-foreground">No services</p> : (
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Property</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {services.map(s => (
                                <TableRow key={s.id}>
                                  <TableCell className="text-xs">{s.service_date || "—"}</TableCell>
                                  <TableCell className="text-xs">{getPropertyName(s.property_id)}</TableCell>
                                  <TableCell className="text-xs">{s.service_type}</TableCell>
                                  <TableCell><Badge variant={s.status === "completed" ? "default" : "secondary"} className="text-xs">{s.status}</Badge></TableCell>
                                  <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteService(s.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button></TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
              </div>
            </div>
          </TabsContent>

          {/* ====== PREP SHEETS TAB ====== */}
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
                      <div><Label>Treatment Type *</Label><Input placeholder="e.g. Bed Bug, Roach, General Pest" value={newPrepSheet.treatment_type} onChange={e => setNewPrepSheet({ ...newPrepSheet, treatment_type: e.target.value })} /></div>
                      <div><Label>Description</Label><Textarea value={newPrepSheet.description} onChange={e => setNewPrepSheet({ ...newPrepSheet, description: e.target.value })} /></div>
                      <div><Label>File URL</Label><Input placeholder="https://..." value={newPrepSheet.file_url} onChange={e => setNewPrepSheet({ ...newPrepSheet, file_url: e.target.value })} /></div>
                      <Button onClick={addPrepSheet} disabled={!newPrepSheet.title || !newPrepSheet.treatment_type} className="w-full">Add Prep Sheet</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {prepSheets.length === 0 ? <p className="text-sm text-muted-foreground">No prep sheets</p> : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Title</TableHead>
                        <TableHead>Treatment Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {prepSheets.map(ps => (
                        <TableRow key={ps.id}>
                          <TableCell className="font-medium text-sm">{ps.title}</TableCell>
                          <TableCell><Badge variant="outline">{ps.treatment_type}</Badge></TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-xs truncate">{ps.description || "—"}</TableCell>
                          <TableCell><Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePrepSheet(ps.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ====== MESSAGES TAB ====== */}
          <TabsContent value="messages">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Client Messages</CardTitle>
              </CardHeader>
              <CardContent>
                {messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages</p> : (
                  <div className="space-y-3">
                    {messages.map(m => (
                      <div key={m.id} className={`border rounded-lg p-3 ${!m.is_read ? "border-primary/50 bg-primary/5" : ""}`}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="font-medium text-sm">{m.subject}</p>
                          {!m.is_read && <Badge className="text-xs">New</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mb-2">From: {m.sender_name} {m.sender_email && `(${m.sender_email})`} {m.property_name && `• ${m.property_name}`}</p>
                        <p className="text-sm">{m.message}</p>
                        <p className="text-xs text-muted-foreground mt-2">{new Date(m.created_at).toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default PortalAdmin;
