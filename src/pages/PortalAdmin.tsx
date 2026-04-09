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
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Copy, ExternalLink, Trash2, Building2, Link2, MapPin, ClipboardList, FileText, MessageSquare, ChevronRight, Calendar, Phone, Mail, Download, Settings, Send, Edit, Image, X, Users, Inbox } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import crestLogo from "@/assets/crest-logo.png";

interface PortalClient {
  id: string; name: string; company: string | null; email: string | null; phone: string | null; notes: string | null; created_at: string;
}
interface PortalProperty {
  id: string; client_id: string; name: string; address: string | null; notes: string | null; image_url: string | null;
}
interface PortalLink {
  id: string; client_id: string; token: string; link_type: string; label: string | null; assigned_property_ids: any; is_active: boolean;
}
interface PortalService {
  id: string; property_id: string; service_date: string | null; service_time: string | null; service_type: string;
  technician: string | null; status: string; summary: string | null; findings: string | null; notes: string | null;
  products_used: any; follow_up_recommended: boolean | null; follow_up_notes: string | null;
  scheduling_status: string | null; prep_required: boolean | null; prep_notes: string | null;
  unit_details: any; special_notes: string | null; photos: any; units_planned: any;
}
interface PortalPrepSheet {
  id: string; title: string; description: string | null; treatment_type: string; file_url: string | null;
}
interface PortalMessage {
  id: string; sender_name: string; sender_email: string | null; sender_type: string;
  property_name: string | null; subject: string; message: string; is_read: boolean; created_at: string; client_id: string | null;
}
interface UnitDetail {
  unit_number: string; findings: string; notes: string; pest_activity: string; products_used: string; status: string;
  [key: string]: string;
}

const SERVICE_TYPES = [
  "General Pest Control", "Commercial General Pest Control", "Rodent Trapping",
  "Rodent Exclusion", "Rodent Trapping & Exclusion", "Rodent Bait Boxes",
  "Mosquito Service", "Attic Services", "Dewebbing",
];

const PRODUCTS = [
  "Alpine WSG", "Bifen I/T", "Essentria IC Pro", "Temprid FX", "Termidor SC",
  "Phantom", "ExciteR", "Gentrol IGR", "Nyguard IGR", "PT Wasp Freeze",
  "PT Alpine Flea & Bed Bug", "Advion Ant Gel Bait", "Maxforce FC Ant Gel",
  "Advion Cockroach Gel Bait", "Contrac California", "Delta Dust", "In2Care Mix",
  "OneGuard", "Advion Microflow", "Optigard", "Bifen LP", "MasterLine B MaxxPro",
];

const PortalAdmin = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<PortalClient[]>([]);
  const [selectedClient, setSelectedClient] = useState<PortalClient | null>(null);
  const [properties, setProperties] = useState<PortalProperty[]>([]);
  const [links, setLinks] = useState<PortalLink[]>([]);
  const [services, setServices] = useState<PortalService[]>([]);
  const [prepSheets, setPrepSheets] = useState<PortalPrepSheet[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [tenantRequests, setTenantRequests] = useState<any[]>([]);

  const [selectedProperty, setSelectedProperty] = useState<PortalProperty | null>(null);
  const [selectedService, setSelectedService] = useState<PortalService | null>(null);
  const [portalTab, setPortalTab] = useState("past");
  const [viewMode, setViewMode] = useState<"admin" | "pm" | "tenant">("admin");
  const [globalTab, setGlobalTab] = useState("clients");

  const [chatMessages, setChatMessages] = useState<PortalMessage[]>([]);
  const [adminChatInput, setAdminChatInput] = useState("");
  const [sendingChat, setSendingChat] = useState(false);
  const adminChatEndRef = useRef<HTMLDivElement>(null);

  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddLink, setShowAddLink] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddPrepSheet, setShowAddPrepSheet] = useState(false);
  const [editingService, setEditingService] = useState<PortalService | null>(null);
  const [editingPrepSheet, setEditingPrepSheet] = useState<PortalPrepSheet | null>(null);

  const [newClient, setNewClient] = useState({ name: "", company: "", email: "", phone: "", notes: "" });
  const [newProperty, setNewProperty] = useState({ name: "", address: "", notes: "", image_url: "" });
  const [newLink, setNewLink] = useState({ link_type: "sub", label: "", assigned_property_ids: [] as string[], unit_number: "" });
  const [newPrepSheet, setNewPrepSheet] = useState({ title: "", description: "", treatment_type: "", file_url: "" });

  // Rich service form
  const emptyServiceForm = {
    property_id: "", service_date: "", service_time: "", service_type: "", technician: "",
    status: "completed", summary: "", findings: "", notes: "", scheduling_status: "confirmed",
    products_used: [] as string[], follow_up_recommended: false, follow_up_notes: "",
    prep_required: false, prep_notes: "", special_notes: "",
    unit_details: [] as UnitDetail[],
  };
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [uploadingPropertyImage, setUploadingPropertyImage] = useState(false);

  useEffect(() => { loadClients(); loadPrepSheets(); loadMessages(); }, []);

  useEffect(() => {
    if (selectedClient) {
      loadProperties(selectedClient.id);
      loadLinks(selectedClient.id);
      loadClientChat(selectedClient.id);
      loadTenantRequests(selectedClient.id);
      setSelectedProperty(null); setSelectedService(null); setPortalTab("past");
    }
  }, [selectedClient]);

  useEffect(() => {
    if (!selectedClient) return;
    const interval = setInterval(() => loadClientChat(selectedClient.id), 10000);
    return () => clearInterval(interval);
  }, [selectedClient]);

  useEffect(() => { adminChatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatMessages]);

  const loadClients = async () => {
    const { data } = await supabase.from("portal_clients").select("*").order("created_at", { ascending: false });
    if (data) setClients(data);
  };
  const loadProperties = async (clientId: string) => {
    const { data } = await supabase.from("portal_properties").select("*").eq("client_id", clientId);
    if (data) {
      setProperties(data);
      const ids = data.map(p => p.id);
      if (ids.length > 0) {
        const { data: svcData } = await supabase.from("portal_services").select("*").in("property_id", ids).order("service_date", { ascending: false });
        if (svcData) setServices(svcData);
      } else setServices([]);
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
    const { data } = await supabase.from("portal_messages").select("*").eq("client_id", clientId).order("created_at", { ascending: true });
    if (data) setChatMessages(data);
  };
  const loadTenantRequests = async (clientId: string) => {
    // Load requests for all links belonging to this client
    const { data: clientLinks } = await supabase.from("portal_links").select("id").eq("client_id", clientId).eq("link_type", "tenant");
    if (clientLinks && clientLinks.length > 0) {
      const linkIds = clientLinks.map(l => l.id);
      const { data } = await supabase.from("portal_requests").select("*").in("link_id", linkIds).order("created_at", { ascending: false });
      if (data) setTenantRequests(data);
      else setTenantRequests([]);
    } else {
      setTenantRequests([]);
    }
  };

  const sendAdminChat = async () => {
    if (!adminChatInput.trim() || !selectedClient) return;
    setSendingChat(true);
    const { error: err } = await supabase.from("portal_messages").insert({
      client_id: selectedClient.id, sender_name: "Crest Pest Control", sender_type: "admin", subject: "Portal Chat", message: adminChatInput.trim(),
    });
    if (!err) { setAdminChatInput(""); loadClientChat(selectedClient.id); }
    setSendingChat(false);
  };

  const addClient = async () => {
    const { error } = await supabase.from("portal_clients").insert({ name: newClient.name, company: newClient.company || null, email: newClient.email || null, phone: newClient.phone || null, notes: newClient.notes || null });
    if (!error) { toast({ title: "Client added" }); setShowAddClient(false); setNewClient({ name: "", company: "", email: "", phone: "", notes: "" }); loadClients(); }
  };

  const uploadPropertyImage = async (file: File): Promise<string | null> => {
    setUploadingPropertyImage(true);
    const ext = file.name.split(".").pop();
    const path = `portal-properties/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("report-images").upload(path, file, { contentType: file.type });
    setUploadingPropertyImage(false);
    if (error) { toast({ title: "Upload failed", variant: "destructive" }); return null; }
    const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
    return pub.publicUrl;
  };

  const addProperty = async () => {
    if (!selectedClient) return;
    const { error } = await supabase.from("portal_properties").insert({
      client_id: selectedClient.id, name: newProperty.name, address: newProperty.address || null,
      notes: newProperty.notes || null, image_url: newProperty.image_url || null,
    });
    if (!error) { toast({ title: "Property added" }); setShowAddProperty(false); setNewProperty({ name: "", address: "", notes: "", image_url: "" }); loadProperties(selectedClient.id); }
  };

  const updatePropertyImage = async (propId: string, file: File) => {
    const url = await uploadPropertyImage(file);
    if (url) {
      await supabase.from("portal_properties").update({ image_url: url }).eq("id", propId);
      if (selectedClient) loadProperties(selectedClient.id);
      toast({ title: "Property image updated" });
    }
  };

  const addLink = async () => {
    if (!selectedClient) return;
    const { error } = await supabase.from("portal_links").insert({
      client_id: selectedClient.id, link_type: newLink.link_type, label: newLink.label || null,
      assigned_property_ids: newLink.assigned_property_ids.length > 0 ? newLink.assigned_property_ids : null,
      unit_number: newLink.unit_number || null,
    });
    if (!error) { toast({ title: "Link created" }); setShowAddLink(false); setNewLink({ link_type: "sub", label: "", assigned_property_ids: [], unit_number: "" }); loadLinks(selectedClient.id); }
  };

  const openServiceDialog = (forEdit?: PortalService) => {
    if (forEdit) {
      setServiceForm({
        property_id: forEdit.property_id, service_date: forEdit.service_date || "", service_time: forEdit.service_time || "",
        service_type: forEdit.service_type, technician: forEdit.technician || "", status: forEdit.status,
        summary: forEdit.summary || "", findings: forEdit.findings || "", notes: forEdit.notes || "",
        scheduling_status: forEdit.scheduling_status || "confirmed",
        products_used: Array.isArray(forEdit.products_used) ? forEdit.products_used : [],
        follow_up_recommended: forEdit.follow_up_recommended || false, follow_up_notes: forEdit.follow_up_notes || "",
        prep_required: forEdit.prep_required || false, prep_notes: forEdit.prep_notes || "",
        special_notes: forEdit.special_notes || "",
        unit_details: Array.isArray(forEdit.unit_details) ? forEdit.unit_details : [],
      });
      setEditingService(forEdit);
    } else {
      setServiceForm({ ...emptyServiceForm, property_id: selectedProperty?.id || "" });
      setEditingService(null);
    }
    setShowAddService(true);
  };

  const saveService = async () => {
    const propId = serviceForm.property_id || selectedProperty?.id || "";
    if (!propId || !serviceForm.service_type) return;
    const payload = {
      property_id: propId, service_date: serviceForm.service_date || null, service_time: serviceForm.service_time || null,
      service_type: serviceForm.service_type, technician: serviceForm.technician || null, status: serviceForm.status,
      summary: serviceForm.summary || null, findings: serviceForm.findings || null, notes: serviceForm.notes || null,
      scheduling_status: serviceForm.scheduling_status || "confirmed",
      products_used: serviceForm.products_used.length > 0 ? serviceForm.products_used : null,
      follow_up_recommended: serviceForm.follow_up_recommended, follow_up_notes: serviceForm.follow_up_notes || null,
      prep_required: serviceForm.prep_required, prep_notes: serviceForm.prep_notes || null,
      special_notes: serviceForm.special_notes || null,
      unit_details: serviceForm.unit_details.length > 0 ? serviceForm.unit_details : null,
    };
    let error;
    if (editingService) {
      ({ error } = await supabase.from("portal_services").update(payload).eq("id", editingService.id));
    } else {
      ({ error } = await supabase.from("portal_services").insert(payload));
    }
    if (!error) {
      toast({ title: editingService ? "Service updated" : "Service added" });
      setShowAddService(false); setEditingService(null); setServiceForm(emptyServiceForm);
      if (selectedClient) loadProperties(selectedClient.id);
    }
  };

  const savePrepSheet = async () => {
    if (editingPrepSheet) {
      const { error } = await supabase.from("portal_prep_sheets").update({
        title: newPrepSheet.title, description: newPrepSheet.description || null,
        treatment_type: newPrepSheet.treatment_type, file_url: newPrepSheet.file_url || null,
      }).eq("id", editingPrepSheet.id);
      if (!error) { toast({ title: "Prep sheet updated" }); setEditingPrepSheet(null); setShowAddPrepSheet(false); setNewPrepSheet({ title: "", description: "", treatment_type: "", file_url: "" }); loadPrepSheets(); }
    } else {
      const { error } = await supabase.from("portal_prep_sheets").insert({
        title: newPrepSheet.title, description: newPrepSheet.description || null,
        treatment_type: newPrepSheet.treatment_type, file_url: newPrepSheet.file_url || null,
      });
      if (!error) { toast({ title: "Prep sheet added" }); setShowAddPrepSheet(false); setNewPrepSheet({ title: "", description: "", treatment_type: "", file_url: "" }); loadPrepSheets(); }
    }
  };

  const openEditPrepSheet = (ps: PortalPrepSheet) => {
    setEditingPrepSheet(ps);
    setNewPrepSheet({ title: ps.title, description: ps.description || "", treatment_type: ps.treatment_type, file_url: ps.file_url || "" });
    setShowAddPrepSheet(true);
  };

  const deleteClient = async (id: string) => { await supabase.from("portal_clients").delete().eq("id", id); if (selectedClient?.id === id) setSelectedClient(null); loadClients(); toast({ title: "Client deleted" }); };
  const deleteProperty = async (id: string) => { await supabase.from("portal_properties").delete().eq("id", id); if (selectedProperty?.id === id) setSelectedProperty(null); if (selectedClient) loadProperties(selectedClient.id); toast({ title: "Property deleted" }); };
  const deleteLink = async (id: string) => { await supabase.from("portal_links").delete().eq("id", id); if (selectedClient) loadLinks(selectedClient.id); toast({ title: "Link deleted" }); };
  const deleteService = async (id: string) => { await supabase.from("portal_services").delete().eq("id", id); if (selectedClient) loadProperties(selectedClient.id); toast({ title: "Service deleted" }); };
  const deletePrepSheet = async (id: string) => { await supabase.from("portal_prep_sheets").delete().eq("id", id); loadPrepSheets(); toast({ title: "Prep sheet deleted" }); };
  const copyLink = (token: string, linkType?: string) => {
    const prefix = linkType === "tenant" ? "tenant" : "portal";
    navigator.clipboard.writeText(`${window.location.origin}/${prefix}/${token}`);
    toast({ title: "Link copied to clipboard" });
  };
  const openPortal = (token: string, linkType?: string) => {
    const prefix = linkType === "tenant" ? "tenant" : "portal";
    window.open(`/${prefix}/${token}`, "_blank");
  };
  const getPropertyName = (propertyId: string) => properties.find(p => p.id === propertyId)?.name || "Unknown";
  const today = new Date().toISOString().split("T")[0];

  const visibleServices = selectedProperty ? services.filter(s => s.property_id === selectedProperty.id) : services;
  const pastServices = visibleServices.filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
  const futureServices = visibleServices.filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today));
  const masterLink = links.find(l => l.link_type === "master");

  // ---- Unit detail helpers ----
  const addUnit = () => setServiceForm(f => ({ ...f, unit_details: [...f.unit_details, { unit_number: "", findings: "", notes: "", pest_activity: "", products_used: "", status: "treated" }] }));
  const updateUnit = (i: number, field: string, val: string) => setServiceForm(f => ({ ...f, unit_details: f.unit_details.map((u, j) => j === i ? { ...u, [field]: val } : u) }));
  const removeUnit = (i: number) => setServiceForm(f => ({ ...f, unit_details: f.unit_details.filter((_, j) => j !== i) }));
  const toggleProduct = (p: string) => setServiceForm(f => ({ ...f, products_used: f.products_used.includes(p) ? f.products_used.filter(x => x !== p) : [...f.products_used, p] }));

  // ============ SERVICE FORM DIALOG ============
  const renderServiceDialog = () => (
    <Dialog open={showAddService} onOpenChange={(open) => { if (!open) { setShowAddService(false); setEditingService(null); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editingService ? "Edit Service" : "Add Service"}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Property *</Label>
              <Select value={serviceForm.property_id} onValueChange={v => setServiceForm(f => ({ ...f, property_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
                <SelectContent>{properties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Service Type *</Label>
              <Select value={serviceForm.service_type} onValueChange={v => setServiceForm(f => ({ ...f, service_type: v }))}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{SERVICE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Service Date</Label><Input type="date" value={serviceForm.service_date} onChange={e => setServiceForm(f => ({ ...f, service_date: e.target.value }))} /></div>
            <div><Label>Service Time</Label><Input type="time" value={serviceForm.service_time} onChange={e => setServiceForm(f => ({ ...f, service_time: e.target.value }))} /></div>
            <div><Label>Technician</Label><Input value={serviceForm.technician} onChange={e => setServiceForm(f => ({ ...f, technician: e.target.value }))} /></div>
            <div>
              <Label>Status</Label>
              <Select value={serviceForm.status} onValueChange={v => setServiceForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div><Label>Summary</Label><Textarea placeholder="Brief overview of what was done..." value={serviceForm.summary} onChange={e => setServiceForm(f => ({ ...f, summary: e.target.value }))} /></div>
          <div><Label>Findings</Label><Textarea placeholder="What was found during the service..." value={serviceForm.findings} onChange={e => setServiceForm(f => ({ ...f, findings: e.target.value }))} /></div>
          <div><Label>Notes</Label><Textarea placeholder="Additional notes for the client..." value={serviceForm.notes} onChange={e => setServiceForm(f => ({ ...f, notes: e.target.value }))} /></div>

          {/* Products Used */}
          <div>
            <Label className="mb-2 block">Products Used</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRODUCTS.map(p => (
                <Badge key={p} variant={serviceForm.products_used.includes(p) ? "default" : "outline"}
                  className="cursor-pointer text-xs" onClick={() => toggleProduct(p)}>
                  {p}
                </Badge>
              ))}
            </div>
          </div>

          {/* Unit Details */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Units Treated</Label>
              <Button type="button" variant="outline" size="sm" onClick={addUnit}><Plus className="w-3 h-3 mr-1" />Add Unit</Button>
            </div>
            {serviceForm.unit_details.map((unit, i) => (
              <Card key={i} className="mb-2">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Input placeholder="Unit # or name" value={unit.unit_number} onChange={e => updateUnit(i, "unit_number", e.target.value)} className="w-40" />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeUnit(i)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Findings" value={unit.findings} onChange={e => updateUnit(i, "findings", e.target.value)} />
                    <Input placeholder="Pest activity" value={unit.pest_activity} onChange={e => updateUnit(i, "pest_activity", e.target.value)} />
                  </div>
                  <Input placeholder="Products used in this unit" value={unit.products_used} onChange={e => updateUnit(i, "products_used", e.target.value)} />
                  <Input placeholder="Notes" value={unit.notes} onChange={e => updateUnit(i, "notes", e.target.value)} />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Follow-up */}
          <div className="flex items-center gap-3">
            <Switch checked={serviceForm.follow_up_recommended} onCheckedChange={v => setServiceForm(f => ({ ...f, follow_up_recommended: v }))} />
            <Label>Follow-up Recommended</Label>
          </div>
          {serviceForm.follow_up_recommended && (
            <Textarea placeholder="Follow-up details..." value={serviceForm.follow_up_notes} onChange={e => setServiceForm(f => ({ ...f, follow_up_notes: e.target.value }))} />
          )}

          {/* Prep */}
          <div className="flex items-center gap-3">
            <Switch checked={serviceForm.prep_required} onCheckedChange={v => setServiceForm(f => ({ ...f, prep_required: v }))} />
            <Label>Prep Required for Next Visit</Label>
          </div>
          {serviceForm.prep_required && (
            <Textarea placeholder="Prep instructions for the client..." value={serviceForm.prep_notes} onChange={e => setServiceForm(f => ({ ...f, prep_notes: e.target.value }))} />
          )}

          <div><Label>Special Notes</Label><Textarea placeholder="Any special notes..." value={serviceForm.special_notes} onChange={e => setServiceForm(f => ({ ...f, special_notes: e.target.value }))} /></div>

          <Button onClick={saveService} disabled={!serviceForm.service_type || !(serviceForm.property_id || selectedProperty?.id)} className="w-full">
            {editingService ? "Update Service" : "Add Service"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ============ CLIENT LIST VIEW ============
  if (!selectedClient) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></Button>
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
                    <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Client</Button></DialogTrigger>
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
                        <div key={c.id} className="flex items-center justify-between border rounded-lg p-4 cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors" onClick={() => setSelectedClient(c)}>
                          <div>
                            <p className="font-medium">{c.name}</p>
                            {c.company && <p className="text-sm text-muted-foreground">{c.company}</p>}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={e => { e.stopPropagation(); deleteClient(c.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
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
                  <Button size="sm" onClick={() => { setEditingPrepSheet(null); setNewPrepSheet({ title: "", description: "", treatment_type: "", file_url: "" }); setShowAddPrepSheet(true); }}><Plus className="w-4 h-4 mr-1" />Add</Button>
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
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPrepSheet(ps)}><Edit className="w-3.5 h-3.5" /></Button>
                            {ps.file_url && <Button variant="ghost" size="icon" className="h-7 w-7" asChild><a href={ps.file_url} target="_blank" rel="noopener noreferrer"><ExternalLink className="w-3.5 h-3.5" /></a></Button>}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deletePrepSheet(ps.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Messages tab */}
            <TabsContent value="messages">
              <Card>
                <CardHeader><CardTitle className="text-base">Client Messages</CardTitle></CardHeader>
                <CardContent>
                  {messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet</p> : (() => {
                    const clientMap = new Map<string, { clientName: string; lastMessage: PortalMessage; unread: number }>();
                    messages.forEach(m => {
                      const key = m.client_id || m.sender_name;
                      if (!clientMap.has(key)) clientMap.set(key, { clientName: m.sender_name, lastMessage: m, unread: m.is_read ? 0 : 1 });
                      else { const ex = clientMap.get(key)!; if (!m.is_read) ex.unread++; }
                    });
                    return (
                      <div className="space-y-2">
                        {Array.from(clientMap.entries()).map(([key, data]) => {
                          const mc = clients.find(c => c.id === key);
                          return (
                            <div key={key} className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => { if (mc) setSelectedClient(mc); }}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">{mc?.name || data.clientName}</p>
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

        {/* Prep Sheet Dialog */}
        <Dialog open={showAddPrepSheet} onOpenChange={(o) => { if (!o) { setShowAddPrepSheet(false); setEditingPrepSheet(null); } }}>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingPrepSheet ? "Edit Prep Sheet" : "Add Prep Sheet"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Title *</Label><Input value={newPrepSheet.title} onChange={e => setNewPrepSheet({ ...newPrepSheet, title: e.target.value })} /></div>
              <div><Label>Treatment Type *</Label><Input placeholder="e.g. Bed Bug, Roach" value={newPrepSheet.treatment_type} onChange={e => setNewPrepSheet({ ...newPrepSheet, treatment_type: e.target.value })} /></div>
              <div><Label>Description</Label><Textarea value={newPrepSheet.description} onChange={e => setNewPrepSheet({ ...newPrepSheet, description: e.target.value })} /></div>
              <div><Label>File URL</Label><Input placeholder="https://..." value={newPrepSheet.file_url} onChange={e => setNewPrepSheet({ ...newPrepSheet, file_url: e.target.value })} /></div>
              <Button onClick={savePrepSheet} disabled={!newPrepSheet.title || !newPrepSheet.treatment_type} className="w-full">
                {editingPrepSheet ? "Update Prep Sheet" : "Add Prep Sheet"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
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
            if (selectedService) { setSelectedService(null); }
            else if (selectedProperty) { setSelectedProperty(null); }
            else setSelectedClient(null);
          }}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            {selectedService ? "Back" : selectedProperty ? "All Properties" : "All Clients"}
          </Button>
          <span className="text-background/60">Admin View — {selectedClient.company || selectedClient.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white font-bold h-8 px-4 rounded-md shadow-sm" onClick={() => setViewMode(viewMode === "admin" ? "pm" : "admin")}>
            <Settings className="w-3.5 h-3.5 mr-1" />{viewMode === "admin" ? "Done Editing" : "✏️ EDIT"}
          </Button>
          {masterLink && (
            <Button variant="ghost" size="sm" className="text-background hover:text-background/80 h-7 px-2" onClick={() => copyLink(masterLink.token, "master")}>
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
              <p className="text-sm text-muted-foreground">{selectedProperty ? selectedProperty.name : (selectedClient.company || selectedClient.name)}</p>
            </div>
          </div>
          {!selectedProperty && <Badge variant="outline" className="text-xs">Master View</Badge>}
        </div>
      </div>

      {/* Admin management panel */}
      {viewMode === "admin" && (
        <div className="bg-muted/50 border-b">
          <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
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
                            <SelectItem value="sub">Property Manager (specific properties)</SelectItem>
                            <SelectItem value="tenant">Tenant (requests only)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Label</Label><Input placeholder="e.g. Building A Manager" value={newLink.label} onChange={e => setNewLink({ ...newLink, label: e.target.value })} /></div>
                      {(newLink.link_type === "sub" || newLink.link_type === "tenant") && properties.length > 0 && (
                        <div>
                          <Label>Assigned Properties</Label>
                          <div className="space-y-1 mt-1">
                            {properties.map(p => (
                              <label key={p.id} className="flex items-center gap-2 text-sm">
                                <input type="checkbox" checked={newLink.assigned_property_ids.includes(p.id)}
                                  onChange={e => { if (e.target.checked) setNewLink({ ...newLink, assigned_property_ids: [...newLink.assigned_property_ids, p.id] }); else setNewLink({ ...newLink, assigned_property_ids: newLink.assigned_property_ids.filter(id => id !== p.id) }); }} />
                                {p.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      {newLink.link_type === "tenant" && (
                        <div>
                          <Label>Unit Number</Label>
                          <Input placeholder="e.g. 204" value={newLink.unit_number} onChange={e => setNewLink({ ...newLink, unit_number: e.target.value })} />
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
                        <Badge variant={l.link_type === "master" ? "default" : l.link_type === "tenant" ? "outline" : "secondary"}>
                          {l.link_type === "sub" ? "PM" : l.link_type}
                        </Badge>
                        <span className="flex-1 truncate">
                          {l.label || "Unnamed"}
                          {l.link_type === "tenant" && (l as any).unit_number && <span className="text-muted-foreground ml-1">(Unit {(l as any).unit_number})</span>}
                        </span>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyLink(l.token, l.link_type)}><Copy className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openPortal(l.token, l.link_type)}><ExternalLink className="w-3.5 h-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteLink(l.id)}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick actions */}
            <div className="flex gap-2 flex-wrap">
              <Dialog open={showAddProperty} onOpenChange={setShowAddProperty}>
                <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" />Add Property</Button></DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add Property</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <div><Label>Name *</Label><Input value={newProperty.name} onChange={e => setNewProperty({ ...newProperty, name: e.target.value })} /></div>
                    <div><Label>Address</Label><Input value={newProperty.address} onChange={e => setNewProperty({ ...newProperty, address: e.target.value })} /></div>
                    <div><Label>Notes</Label><Textarea value={newProperty.notes} onChange={e => setNewProperty({ ...newProperty, notes: e.target.value })} /></div>
                    <div>
                      <Label>Property Image</Label>
                      <Input type="file" accept="image/*" onChange={async e => {
                        const f = e.target.files?.[0];
                        if (f) { const url = await uploadPropertyImage(f); if (url) setNewProperty(p => ({ ...p, image_url: url })); }
                      }} />
                      {newProperty.image_url && <img src={newProperty.image_url} alt="" className="mt-2 rounded h-24 object-cover" />}
                    </div>
                    <Button onClick={addProperty} disabled={!newProperty.name} className="w-full">Add Property</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Button size="sm" variant="outline" onClick={() => openServiceDialog()} disabled={properties.length === 0}>
                <Plus className="w-3 h-3 mr-1" />Add Service
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Portal content */}
      <div className="max-w-5xl mx-auto px-4 py-4">
        {/* Quick summary */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold">{pastServices.length}</p><p className="text-xs text-muted-foreground">Past Services</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold">{futureServices.length}</p><p className="text-xs text-muted-foreground">Upcoming</p></CardContent></Card>
          <Card><CardContent className="p-3 text-center"><p className="text-2xl font-bold text-sm leading-8">{futureServices.length > 0 && futureServices[0]?.service_date ? new Date(futureServices[0].service_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</p><p className="text-xs text-muted-foreground">Next Service</p></CardContent></Card>
        </div>

        {/* Properties list */}
        {!selectedProperty && properties.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1"><MapPin className="w-4 h-4" />Properties</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {properties.map(p => (
                <Card key={p.id} className="cursor-pointer hover:border-primary/40 transition-colors overflow-hidden" onClick={() => setSelectedProperty(p)}>
                  {p.image_url && (
                    <div className="relative h-32 w-full">
                      <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                      {viewMode === "admin" && (
                        <label className="absolute bottom-1 right-1 bg-background/80 rounded p-1 cursor-pointer hover:bg-background">
                          <Image className="w-4 h-4" />
                          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { e.stopPropagation(); updatePropertyImage(p.id, f); } }} onClick={e => e.stopPropagation()} />
                        </label>
                      )}
                    </div>
                  )}
                  <CardContent className="p-3 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{p.name}</p>
                      {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{services.filter(s => s.property_id === p.id).length} services</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {viewMode === "admin" && !p.image_url && (
                        <label className="cursor-pointer" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 pointer-events-none"><Image className="w-3.5 h-3.5" /></Button>
                          <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) updatePropertyImage(p.id, f); }} />
                        </label>
                      )}
                      {viewMode === "admin" && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteProperty(p.id); }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Selected property image */}
        {selectedProperty?.image_url && (
          <div className="mb-4 rounded-lg overflow-hidden relative">
            <img src={selectedProperty.image_url} alt={selectedProperty.name} className="w-full h-48 object-cover" />
            {viewMode === "admin" && (
              <label className="absolute bottom-2 right-2 bg-background/80 rounded p-1.5 cursor-pointer hover:bg-background">
                <Image className="w-4 h-4" />
                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f && selectedProperty) updatePropertyImage(selectedProperty.id, f); }} />
              </label>
            )}
          </div>
        )}

        {/* Service Tabs */}
        <Tabs value={portalTab} onValueChange={setPortalTab}>
          <TabsList className="w-full grid grid-cols-5 mb-4">
            <TabsTrigger value="past"><Calendar className="w-4 h-4 mr-1 hidden sm:inline" />Past</TabsTrigger>
            <TabsTrigger value="future"><ClipboardList className="w-4 h-4 mr-1 hidden sm:inline" />Upcoming</TabsTrigger>
            <TabsTrigger value="requests"><Inbox className="w-4 h-4 mr-1 hidden sm:inline" />Requests{tenantRequests.length > 0 ? ` (${tenantRequests.length})` : ""}</TabsTrigger>
            <TabsTrigger value="prep"><FileText className="w-4 h-4 mr-1 hidden sm:inline" />Prep</TabsTrigger>
            <TabsTrigger value="message"><MessageSquare className="w-4 h-4 mr-1 hidden sm:inline" />Chat</TabsTrigger>
          </TabsList>

          {/* Past Services */}
          <TabsContent value="past">
            {viewMode === "admin" && (
              <div className="mb-3">
                <Button size="sm" variant="outline" onClick={() => openServiceDialog()} disabled={properties.length === 0}><Plus className="w-3 h-3 mr-1" />Add Past Service</Button>
              </div>
            )}
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
                          {Array.isArray(s.unit_details) && (s.unit_details as any[]).length > 0 && (
                            <span>{(s.unit_details as any[]).length} units</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {viewMode === "admin" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openServiceDialog(s); }}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteService(s.id); }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                          </>
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
            {viewMode === "admin" && (
              <div className="mb-3">
                <Button size="sm" variant="outline" onClick={() => { setServiceForm({ ...emptyServiceForm, property_id: selectedProperty?.id || "", status: "scheduled" }); setEditingService(null); setShowAddService(true); }} disabled={properties.length === 0}>
                  <Plus className="w-3 h-3 mr-1" />Add Upcoming Service
                </Button>
              </div>
            )}
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
                        {viewMode === "admin" && (
                          <>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); openServiceDialog(s); }}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteService(s.id); }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                          </>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Tenant Requests */}
          <TabsContent value="requests">
            {tenantRequests.length === 0 ? (
              <Card><CardContent className="p-6 text-center text-muted-foreground">No tenant requests yet</CardContent></Card>
            ) : (
              <div className="space-y-2">
                {tenantRequests.map((r: any) => (
                  <Card key={r.id}>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={r.status === "resolved" ? "default" : r.status === "in_progress" ? "secondary" : "outline"} className="text-xs">
                            {r.status === "in_progress" ? "In Progress" : r.status}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">{r.request_type}</Badge>
                          {r.unit_number && <span className="text-xs text-muted-foreground">Unit {r.unit_number}</span>}
                        </div>
                        <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                      </div>
                      <p className="text-sm mb-2">{r.description}</p>
                      {viewMode === "admin" && (
                        <div className="flex gap-2 mt-2">
                          <Select value={r.status} onValueChange={async (v) => {
                            await supabase.from("portal_requests").update({ status: v }).eq("id", r.id);
                            if (selectedClient) loadTenantRequests(selectedClient.id);
                          }}>
                            <SelectTrigger className="h-7 text-xs w-32"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="in_progress">In Progress</SelectItem>
                              <SelectItem value="resolved">Resolved</SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            placeholder="Response notes..."
                            defaultValue={r.response_notes || ""}
                            className="h-7 text-xs flex-1"
                            onBlur={async (e) => {
                              if (e.target.value !== (r.response_notes || "")) {
                                await supabase.from("portal_requests").update({ response_notes: e.target.value }).eq("id", r.id);
                                if (selectedClient) loadTenantRequests(selectedClient.id);
                              }
                            }}
                          />
                        </div>
                      )}
                      {!viewMode === "admin" && r.response_notes && (
                        <div className="bg-muted rounded-md p-2 mt-2">
                          <p className="text-xs text-muted-foreground">Response: {r.response_notes}</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="prep">
            {viewMode === "admin" && (
              <div className="mb-3">
                <Button size="sm" variant="outline" onClick={() => { setEditingPrepSheet(null); setNewPrepSheet({ title: "", description: "", treatment_type: "", file_url: "" }); setShowAddPrepSheet(true); }}>
                  <Plus className="w-3 h-3 mr-1" />Add Prep Sheet
                </Button>
              </div>
            )}
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
                        <div className="flex items-center gap-1">
                          {viewMode === "admin" && <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditPrepSheet(ps)}><Edit className="w-3.5 h-3.5" /></Button>}
                          {ps.file_url && <Button variant="outline" size="sm" asChild><a href={ps.file_url} target="_blank" rel="noopener noreferrer"><Download className="w-3 h-3 mr-1" />Download</a></Button>}
                        </div>
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
                <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-4 h-4" /> Chat with {selectedClient.company || selectedClient.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
                {chatMessages.length === 0 && <div className="text-center text-sm text-muted-foreground py-8"><p>No messages yet with this client.</p></div>}
                {chatMessages.map(msg => (
                  <div key={msg.id} className={`flex ${msg.sender_type === "admin" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${msg.sender_type === "admin" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                      {msg.sender_type === "client" && <p className="text-xs font-medium mb-1 opacity-70">{msg.sender_name}</p>}
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
                  <Input placeholder="Type a message to this client..." value={adminChatInput} onChange={e => setAdminChatInput(e.target.value)} disabled={sendingChat} className="flex-1" />
                  <Button type="submit" size="icon" disabled={!adminChatInput.trim() || sendingChat}><Send className="w-4 h-4" /></Button>
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
              <DialogHeader><DialogTitle className="text-base">{selectedService.service_type}</DialogTitle></DialogHeader>
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
                  <div><p className="text-xs text-muted-foreground mb-1">Products Used</p><div className="flex flex-wrap gap-1">{(selectedService.products_used as string[]).map((p, i) => <Badge key={i} variant="outline" className="text-xs">{p}</Badge>)}</div></div>
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
                    <p className="text-xs text-muted-foreground mb-2">Units Treated ({(selectedService.unit_details as any[]).length})</p>
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

                {viewMode === "admin" && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSelectedService(null); openServiceDialog(selectedService); }}><Edit className="w-3.5 h-3.5 mr-1" />Edit</Button>
                    <Button variant="secondary" size="sm" className="flex-1" onClick={() => {
                      navigate(`/appointment-report/${selectedService.id}`, {
                        state: {
                          serviceData: selectedService,
                          propertyName: getPropertyName(selectedService.property_id),
                          clientName: selectedClient?.company || selectedClient?.name,
                          returnTo: "/portal-admin",
                        }
                      });
                    }}>
                      <FileText className="w-3.5 h-3.5 mr-1" />Appointment Report
                    </Button>
                    <Button variant="destructive" size="sm" onClick={() => { deleteService(selectedService.id); setSelectedService(null); }}>Delete</Button>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Prep Sheet Dialog */}
      <Dialog open={showAddPrepSheet} onOpenChange={(o) => { if (!o) { setShowAddPrepSheet(false); setEditingPrepSheet(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingPrepSheet ? "Edit Prep Sheet" : "Add Prep Sheet"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title *</Label><Input value={newPrepSheet.title} onChange={e => setNewPrepSheet({ ...newPrepSheet, title: e.target.value })} /></div>
            <div><Label>Treatment Type *</Label><Input placeholder="e.g. Bed Bug, Roach" value={newPrepSheet.treatment_type} onChange={e => setNewPrepSheet({ ...newPrepSheet, treatment_type: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea value={newPrepSheet.description} onChange={e => setNewPrepSheet({ ...newPrepSheet, description: e.target.value })} /></div>
            <div><Label>File URL</Label><Input placeholder="https://..." value={newPrepSheet.file_url} onChange={e => setNewPrepSheet({ ...newPrepSheet, file_url: e.target.value })} /></div>
            <Button onClick={savePrepSheet} disabled={!newPrepSheet.title || !newPrepSheet.treatment_type} className="w-full">{editingPrepSheet ? "Update Prep Sheet" : "Add Prep Sheet"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {renderServiceDialog()}

      {/* Footer */}
      <div className="border-t mt-8 py-4 text-center text-xs text-muted-foreground">
        <p>© {new Date().getFullYear()} Crest Pest Control • 949-424-5000 • office@crestpestco.com</p>
      </div>
    </div>
  );
};

export default PortalAdmin;
