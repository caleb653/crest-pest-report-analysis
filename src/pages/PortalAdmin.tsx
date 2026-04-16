import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PropertyDashboard from "@/components/portal/PropertyDashboard";
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
import { ArrowLeft, Plus, Copy, ExternalLink, Trash2, Building2, Link2, MapPin, ClipboardList, FileText, MessageSquare, ChevronRight, Calendar, Phone, Mail, Download, Settings, Send, Edit, Image, X, Users, Inbox, Check } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import crestLogo from "@/assets/crest-logo.png";

interface PortalClient {
  id: string; name: string; company: string | null; email: string | null; phone: string | null; notes: string | null; created_at: string;
}
interface PortalProperty {
  id: string; client_id: string; name: string; address: string | null; notes: string | null; image_url: string | null;
  equipment: any; customer_preferences: any; map_data: any; map_image_url: string | null;
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
  frequency_days?: number | null;
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

const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];

const PREFERENCE_OPTIONS = [
  "Green / Eco-Friendly Products",
  "Standard Products",
  "No Preference",
  "Interior Treatment Only",
  "Exterior Treatment Only",
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

  // Reset tab when view mode changes
  useEffect(() => {
    if (viewMode === "tenant") setPortalTab("requests");
    else setPortalTab("past");
  }, [viewMode]);

  // Auto-create PM link when entering a property
  useEffect(() => {
    if (selectedProperty && selectedClient) {
      ensurePropertyLink(selectedProperty.id, selectedProperty.name);
    }
  }, [selectedProperty]);

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
    if (data) {
      setLinks(data);
      // Auto-create master link if none exists
      const hasMaster = data.some(l => l.link_type === "master");
      if (!hasMaster) {
        const client = clients.find(c => c.id === clientId);
        await supabase.from("portal_links").insert({
          client_id: clientId, link_type: "master",
          label: `${client?.company || client?.name || "Client"} Portal`,
        });
        const { data: refreshed } = await supabase.from("portal_links").select("*").eq("client_id", clientId);
        if (refreshed) setLinks(refreshed);
      }
    }
  };

  // Auto-create a PM link for a property if none exists
  const ensurePropertyLink = async (propertyId: string, propertyName: string) => {
    const existing = links.find(l => l.link_type === "sub" && l.assigned_property_ids && (l.assigned_property_ids as string[]).includes(propertyId));
    if (!existing && selectedClient) {
      await supabase.from("portal_links").insert({
        client_id: selectedClient.id, link_type: "sub",
        label: `${propertyName} — PM Link`,
        assigned_property_ids: [propertyId],
      });
      const { data: refreshed } = await supabase.from("portal_links").select("*").eq("client_id", selectedClient.id);
      if (refreshed) setLinks(refreshed);
    }
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

  const deleteMessage = async (msgId: string) => {
    const { error } = await supabase.from("portal_messages").delete().eq("id", msgId);
    if (!error && selectedClient) loadClientChat(selectedClient.id);
  };

  const addClient = async () => {
    const { error } = await supabase.from("portal_clients").insert({ name: newClient.name, company: newClient.company || null, email: newClient.email || null, phone: newClient.phone || null, notes: newClient.notes || null });
    if (!error) { toast({ title: "Client added" }); setShowAddClient(false); setNewClient({ name: "", company: "", email: "", phone: "", notes: "" }); loadClients(); }
  };

  const uploadPropertyImage = async (file: File): Promise<string | null> => {
    setUploadingPropertyImage(true);
    try {
      // Compress image before upload
      const compressed = await new Promise<Blob>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxW = 1600, maxH = 1600;
          let w = img.width, h = img.height;
          if (w > maxW || h > maxH) {
            const ratio = Math.min(maxW / w, maxH / h);
            w = Math.round(w * ratio);
            h = Math.round(h * ratio);
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d")!;
          ctx.drawImage(img, 0, 0, w, h);
          canvas.toBlob((blob) => resolve(blob!), "image/jpeg", 0.8);
        };
        img.src = URL.createObjectURL(file);
      });
      const path = `portal-properties/${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("report-images").upload(path, compressed, { contentType: "image/jpeg" });
      if (error) { toast({ title: "Upload failed", variant: "destructive" }); return null; }
      const { data: pub } = supabase.storage.from("report-images").getPublicUrl(path);
      return pub.publicUrl;
    } catch (err) {
      console.error("Upload error:", err);
      toast({ title: "Upload failed", variant: "destructive" });
      return null;
    } finally {
      setUploadingPropertyImage(false);
    }
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

  // Create a new service and open Appointment Report in new tab
  const createAndOpenReport = async (status: string) => {
    const propId = selectedProperty?.id || (properties.length === 1 ? properties[0].id : "");
    if (!propId) {
      toast({ title: "Select a property first", variant: "destructive" });
      return;
    }
    const { data, error } = await supabase.from("portal_services").insert({
      property_id: propId,
      service_type: "General Pest Control",
      status,
      service_date: status === "scheduled" ? null : new Date().toISOString().split("T")[0],
    }).select("id").single();
    if (error || !data) {
      toast({ title: "Failed to create service", variant: "destructive" });
      return;
    }
    const prop = properties.find(p => p.id === propId);
    const stateData = {
      propertyName: prop?.name || "",
      propertyAddress: prop?.address || "",
      propertyId: propId,
      clientName: selectedClient?.company || selectedClient?.name,
      returnTo: "/portal-admin",
      propertyEquipment: Array.isArray(prop?.equipment) ? prop.equipment : [],
      customerPreference: (prop?.customer_preferences as any)?.preference || "",
      customerPreferenceNotes: (prop?.customer_preferences as any)?.notes || "",
    };
    sessionStorage.setItem(`appointment-report-${data.id}`, JSON.stringify(stateData));
    window.open(`/appointment-report/${data.id}`, "_blank");
    if (selectedClient) loadProperties(selectedClient.id);
  };

  const openServiceReport = (s: PortalService) => {
    const prop = properties.find(p => p.id === s.property_id);
    const stateData = {
      serviceData: s,
      propertyName: prop?.name || "",
      propertyAddress: prop?.address || "",
      propertyId: s.property_id,
      clientName: selectedClient?.company || selectedClient?.name,
      returnTo: "/portal-admin",
      propertyEquipment: Array.isArray(prop?.equipment) ? prop.equipment : [],
      customerPreference: (prop?.customer_preferences as any)?.preference || "",
      customerPreferenceNotes: (prop?.customer_preferences as any)?.notes || "",
    };
    sessionStorage.setItem(`appointment-report-${s.id}`, JSON.stringify(stateData));
    window.open(`/appointment-report/${s.id}`, "_blank");
  };
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
            if (selectedProperty) { setSelectedProperty(null); }
            else setSelectedClient(null);
          }}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            {selectedProperty ? "All Properties" : "All Clients"}
          </Button>
          <span className="text-background/60">Crest Admin View</span>
        </div>
        <div className="flex items-center gap-2">
          {masterLink && (
            <Button variant="ghost" size="sm" className="text-background hover:text-background/80 h-7 px-2" onClick={() => copyLink(masterLink.token, "master")}>
              <Copy className="w-3.5 h-3.5 mr-1" />Copy Master Link
            </Button>
          )}
        </div>
      </div>

      {/* Page header with breadcrumb */}
      <div className="bg-card border-b px-4 py-4">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                <span className="cursor-pointer hover:text-foreground" onClick={() => { setSelectedProperty(null); setSelectedClient(null); }}>Clients</span>
                <ChevronRight className="w-3 h-3" />
                <span className={`${!selectedProperty ? "text-foreground font-medium" : "cursor-pointer hover:text-foreground"}`} onClick={() => setSelectedProperty(null)}>
                  {selectedClient.company || selectedClient.name}
                </span>
                {selectedProperty && (
                  <>
                    <ChevronRight className="w-3 h-3" />
                    <span className="text-foreground font-medium">{selectedProperty.name}</span>
                  </>
                )}
              </div>
              <h1 className="text-xl font-bold">
                {selectedProperty ? selectedProperty.name : (selectedClient.company || selectedClient.name)}
              </h1>
              {selectedProperty?.address && <p className="text-sm text-muted-foreground">{selectedProperty.address}</p>}
              {!selectedProperty && (
                <p className="text-sm text-muted-foreground">
                  {properties.length} {properties.length === 1 ? "property" : "properties"} · {services.length} total services
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Admin management panel — client level only */}
      {!selectedProperty && (
        <div className="bg-muted/50 border-b">
          <div className="max-w-5xl mx-auto px-4 py-4 space-y-4">
            <div className="flex gap-4 text-xs text-muted-foreground">
              {selectedClient.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{selectedClient.email}</span>}
              {selectedClient.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{selectedClient.phone}</span>}
            </div>

            {/* Client Portal Link — single master link */}
            {(() => {
              const masterLink = links.find(l => l.link_type === "master");
              return masterLink ? (
                <div className="flex items-center gap-2 text-sm border rounded-md p-3 bg-background">
                  <Link2 className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{masterLink.label || `${selectedClient.company || selectedClient.name} Portal`}</span>
                    <p className="text-xs text-muted-foreground">Client portal link — share this with {selectedClient.company || selectedClient.name}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyLink(masterLink.token, "master")}><Copy className="w-3.5 h-3.5 mr-1" />Copy</Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openPortal(masterLink.token, "master")}><ExternalLink className="w-3.5 h-3.5" /></Button>
                </div>
              ) : null;
            })()}

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
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className={`${selectedProperty ? 'max-w-7xl' : 'max-w-5xl'} mx-auto px-4 py-4`}>

        {/* ======= CLIENT LEVEL: Properties Grid ======= */}
        {!selectedProperty && (
          <>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" />Properties
              <span className="text-muted-foreground font-normal">({properties.length})</span>
            </h3>
            {properties.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="font-medium">No properties yet</p>
                <p className="text-xs mt-1">Add a property to start tracking services</p>
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {properties.map(p => {
                  const propServices = services.filter(s => s.property_id === p.id);
                  const propPast = propServices.filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
                  const propFuture = propServices.filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today));
                  return (
                    <Card key={p.id} className="cursor-pointer hover:border-primary/40 transition-colors overflow-hidden group" onClick={() => setSelectedProperty(p)}>
                      {p.image_url && (
                        <div className="relative h-32 w-full">
                          <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" />
                          {(
                            <label className="absolute bottom-1 right-1 bg-background/80 rounded p-1 cursor-pointer hover:bg-background opacity-0 group-hover:opacity-100 transition-opacity">
                              <Image className="w-4 h-4" />
                              <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) { e.stopPropagation(); updatePropertyImage(p.id, f); } }} onClick={e => e.stopPropagation()} />
                            </label>
                          )}
                        </div>
                      )}
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{p.name}</p>
                            {p.address && <p className="text-xs text-muted-foreground mt-0.5">{p.address}</p>}
                          </div>
                          <ChevronRight className="w-5 h-5 text-muted-foreground" />
                        </div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <span>{propPast.length} past</span>
                          <span>·</span>
                          <span>{propFuture.length} upcoming</span>
                        </div>
                        {(
                          <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!p.image_url && (
                              <label className="cursor-pointer" onClick={e => e.stopPropagation()}>
                                <Button variant="ghost" size="icon" className="h-7 w-7 pointer-events-none"><Image className="w-3.5 h-3.5" /></Button>
                                <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) updatePropertyImage(p.id, f); }} />
                              </label>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteProperty(p.id); }}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Client-level chat — compact collapsible */}
            <details className="border rounded-lg bg-card">
              <summary className="cursor-pointer px-4 py-3 flex items-center gap-2 text-sm font-medium hover:bg-muted/50 transition-colors">
                <MessageSquare className="w-4 h-4" /> Chat with {selectedClient.company || selectedClient.name}
                {chatMessages.length > 0 && <Badge variant="secondary" className="text-xs ml-auto">{chatMessages.length}</Badge>}
              </summary>
              <div className="flex flex-col" style={{ height: "280px" }}>
                <div className="flex-1 overflow-y-auto p-3 space-y-2 border-t">
                  {chatMessages.length === 0 && <div className="text-center text-xs text-muted-foreground py-4"><p>No messages yet.</p></div>}
                  {chatMessages.map(msg => (
                    <div key={msg.id} className={`group flex items-start gap-1 ${msg.sender_type === "admin" ? "justify-end" : "justify-start"}`}>
                      {msg.sender_type === "admin" && (
                        <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 p-1 rounded hover:bg-destructive/10" title="Delete message">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      )}
                      <div className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${msg.sender_type === "admin" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                        {msg.sender_type === "client" && <p className="text-xs font-medium mb-0.5 opacity-70">{msg.sender_name}</p>}
                        <p className="whitespace-pre-wrap text-[13px]">{msg.message}</p>
                        <p className={`text-[10px] mt-0.5 ${msg.sender_type === "admin" ? "opacity-70" : "text-muted-foreground"}`}>
                          {new Date(msg.created_at).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                        </p>
                      </div>
                      {msg.sender_type !== "admin" && (
                        <button onClick={() => deleteMessage(msg.id)} className="opacity-0 group-hover:opacity-100 transition-opacity mt-1 p-1 rounded hover:bg-destructive/10" title="Delete message">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </button>
                      )}
                    </div>
                  ))}
                  <div ref={adminChatEndRef} />
                </div>
                <div className="border-t p-2 shrink-0">
                  <form onSubmit={e => { e.preventDefault(); sendAdminChat(); }} className="flex gap-2">
                    <Input placeholder="Type a message..." value={adminChatInput} onChange={e => setAdminChatInput(e.target.value)} disabled={sendingChat} className="flex-1 h-8 text-sm" />
                    <Button type="submit" size="icon" className="h-8 w-8" disabled={!adminChatInput.trim() || sendingChat}><Send className="w-3.5 h-3.5" /></Button>
                  </form>
                </div>
              </div>
            </details>
          </>
        )}

        {/* ======= PROPERTY LEVEL: Summary + Tabs ======= */}
        {selectedProperty && (
          <PropertyDashboard
            property={selectedProperty}
            services={services}
            links={links}
            clientName={selectedClient.company || selectedClient.name}
            clientId={selectedClient.id}
            onRefresh={() => { if (selectedClient) loadProperties(selectedClient.id); }}
            onOpenServiceReport={openServiceReport}
            onEditService={(s) => openServiceDialog(s)}
            onDeleteService={deleteService}
            onUpdatePropertyImage={updatePropertyImage}
            uploadingPropertyImage={uploadingPropertyImage}
            onCopyLink={copyLink}
            onOpenPortal={openPortal}
            onAddUpcomingService={() => createAndOpenReport("scheduled")}
          />
        )}
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
                      const prop = properties.find(p => p.id === selectedService.property_id);
                      const url = `/appointment-report/${selectedService.id}`;
                      // Store state in sessionStorage for new tab access
                      const stateData = {
                        serviceData: selectedService,
                        propertyName: prop?.name || "",
                        propertyAddress: prop?.address || "",
                        propertyId: selectedService.property_id,
                        clientName: selectedClient?.company || selectedClient?.name,
                        returnTo: "/portal-admin",
                      };
                      sessionStorage.setItem(`appointment-report-${selectedService.id}`, JSON.stringify(stateData));
                      window.open(url, "_blank");
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
