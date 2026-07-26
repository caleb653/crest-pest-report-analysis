import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import PropertyDashboard from "@/components/portal/PropertyDashboard";
import CommercialDashboardView from "@/components/portal/CommercialDashboardView";
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
import { ArrowLeft, Plus, Copy, ExternalLink, Trash2, Building2, Link2, MapPin, ClipboardList, FileText, MessageSquare, ChevronRight, Calendar, Phone, Mail, Download, Settings, Send, Edit, Image, X, Users, Inbox, Check, Eye, EyeOff, DollarSign } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import crestLogo from "@/assets/crest-logo.png";
import BillingDashboard from "@/components/portal/BillingDashboard";
import NotificationBell from "@/components/NotificationBell";
import RegionalManagersTab from "@/components/portal/RegionalManagersTab";
import { STAFF_NAMES } from "@/lib/staffRoster";
import { InlineEditableText } from "@/components/portal/InlineEditableText";
import { PropertyDocuments } from "@/components/portal/PropertyDocuments";
import { downloadBlankRightToTreatPdf } from "@/lib/rightToTreatPdf";

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

type PropertyType = "apartments" | "hoa" | "commercial";
const PROPERTY_TYPES: { value: PropertyType; label: string }[] = [
  { value: "apartments", label: "Apartments" },
  { value: "hoa", label: "HOA" },
  { value: "commercial", label: "Commercial" },
];
const getPropertyType = (p: PortalProperty): PropertyType => {
  const t = (p.customer_preferences as any)?.property_type;
  if (t === "hoa" || t === "commercial" || t === "apartments") return t;
  return "apartments";
};

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
  "Crossfire Bedbug Concentrate",
];

const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];

const PortalAdmin = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState<PortalClient[]>([]);
  const [allProperties, setAllProperties] = useState<PortalProperty[]>([]);
  const [allServices, setAllServices] = useState<PortalService[]>([]);
  const [allLinks, setAllLinks] = useState<PortalLink[]>([]);
  const [prepSheets, setPrepSheets] = useState<PortalPrepSheet[]>([]);
  const [messages, setMessages] = useState<PortalMessage[]>([]);

  const [selectedProperty, setSelectedProperty] = useState<PortalProperty | null>(null);
  const [deletePropertyId, setDeletePropertyId] = useState<string | null>(null);
  const [deletePropertyPw, setDeletePropertyPw] = useState("");
  const [selectedService, setSelectedService] = useState<PortalService | null>(null);
  const [globalTab, setGlobalTab] = useState("properties");
  // Unified admin view: render the editable PropertyDashboard directly so
  // admins can edit services in place without an extra overlay step.

  const [showAddClient, setShowAddClient] = useState(false);
  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddPrepSheet, setShowAddPrepSheet] = useState(false);
  const [editingService, setEditingService] = useState<PortalService | null>(null);
  const [editingPrepSheet, setEditingPrepSheet] = useState<PortalPrepSheet | null>(null);

  const [newClient, setNewClient] = useState({ name: "", company: "", email: "", phone: "", notes: "" });
  const [newProperty, setNewProperty] = useState<{ name: string; address: string; notes: string; image_url: string; client_id: string; property_type: PropertyType }>({ name: "", address: "", notes: "", image_url: "", client_id: "", property_type: "apartments" });
  const [newPropertyOwnerTech, setNewPropertyOwnerTech] = useState<string>("");
  const [newPrepSheet, setNewPrepSheet] = useState({ title: "", description: "", treatment_type: "", file_url: "" });
  const [propertySubTab, setPropertySubTab] = useState<PropertyType>("apartments");

  const emptyServiceForm = {
    property_id: "", service_date: "", service_time: "", service_type: "", technician: "",
    status: "completed", summary: "", findings: "", notes: "", scheduling_status: "confirmed",
    products_used: [] as string[], follow_up_recommended: false, follow_up_notes: "",
    prep_required: false, prep_notes: "", special_notes: "",
    unit_details: [] as UnitDetail[],
  };
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [uploadingPropertyImage, setUploadingPropertyImage] = useState(false);

  // Restore selected property from sessionStorage on mount
  useEffect(() => {
    loadAll().then(() => {
      const savedPropId = sessionStorage.getItem("portal-admin-selected-property");
      if (savedPropId) {
        sessionStorage.removeItem("portal-admin-selected-property");
      }
    });
  }, []);

  // Realtime: keep admin in sync with PM portal submissions and any other
  // client touching portal_services / portal_requests / portal_properties.
  // Without this, if a PM submits a work order or schedules a unit, the
  // admin would not see it until manual refresh — which can lead to the
  // two portals showing different units for the same upcoming service.
  useEffect(() => {
    // Debounce realtime-triggered reloads so a flurry of writes (e.g. a
    // tech typing into findings / products, which debounce-saves on every
    // keystroke) doesn't trigger a refetch storm that re-renders the
    // entire portal mid-keystroke and feels like phantom backspaces.
    let t: any = null;
    const debouncedReload = () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => loadAll(), 1500);
    };
    const channel = supabase
      .channel("portal-admin-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_services" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_requests" }, debouncedReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "portal_properties" }, debouncedReload)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(channel); };
  }, []);

  // Deferred property restore after data is loaded
  useEffect(() => {
    const savedPropId = sessionStorage.getItem("portal-admin-selected-property");
    if (savedPropId && allProperties.length > 0 && !selectedProperty) {
      const prop = allProperties.find(p => p.id === savedPropId);
      if (prop) {
        setSelectedProperty(prop);
        ensurePropertyLink(prop);
        sessionStorage.removeItem("portal-admin-selected-property");
      }
    }
  }, [allProperties]);

  // Keep `selectedProperty` in sync with the latest row from `allProperties`
  // whenever `loadAll` refreshes the list. Without this, saves performed via
  // the dashboard (site map upload, equipment edits, etc.) write to the DB
  // and refresh the list — but the dashboard keeps rendering the stale prop.
  useEffect(() => {
    if (!selectedProperty) return;
    const fresh = allProperties.find(p => p.id === selectedProperty.id);
    if (fresh && fresh !== selectedProperty) {
      setSelectedProperty(fresh);
    }
  }, [allProperties]);

  const loadAll = async () => {
    const [{ data: c }, { data: p }, { data: s }, { data: l }, { data: ps }, { data: m }] = await Promise.all([
      supabase.from("portal_clients").select("*").order("created_at", { ascending: false }),
      supabase.from("portal_properties").select("*").is("archived_at", null).order("name"),
      supabase.from("portal_services").select("*").order("service_date", { ascending: false }),
      supabase.from("portal_links").select("*"),
      supabase.from("portal_prep_sheets").select("*").order("title"),
      supabase.from("portal_messages").select("*").order("created_at", { ascending: false }),
    ]);
    if (c) setClients(c);
    if (p) setAllProperties(p);
    if (s) setAllServices(s);
    if (l) setAllLinks(l);
    if (ps) setPrepSheets(ps);
    if (m) setMessages(m);
  };

  const getClientName = (clientId: string) => {
    const c = clients.find(cl => cl.id === clientId);
    return c?.company || c?.name || "Unknown";
  };
  const getClient = (clientId: string) => clients.find(c => c.id === clientId);

  // Ensure a PM link exists for a property
  const ensurePropertyLink = async (property: PortalProperty) => {
    const existing = allLinks.find(l => l.link_type === "sub" && l.assigned_property_ids && (l.assigned_property_ids as string[]).includes(property.id));
    if (!existing) {
      await supabase.from("portal_links").insert({
        client_id: property.client_id, link_type: "sub",
        label: `${property.name} — PM Link`,
        assigned_property_ids: [property.id],
      });
      const { data } = await supabase.from("portal_links").select("*");
      if (data) setAllLinks(data);
    }
  };

  const loadPrepSheets = async () => {
    const { data } = await supabase.from("portal_prep_sheets").select("*").order("title");
    if (data) setPrepSheets(data);
  };

  const addClient = async () => {
    const { error } = await supabase.from("portal_clients").insert({ name: newClient.name, company: newClient.company || null, email: newClient.email || null, phone: newClient.phone || null, notes: newClient.notes || null });
    if (!error) { toast({ title: "Client added" }); setShowAddClient(false); setNewClient({ name: "", company: "", email: "", phone: "", notes: "" }); loadAll(); }
  };

  const uploadPropertyImage = async (file: File): Promise<string | null> => {
    setUploadingPropertyImage(true);
    try {
      const compressed = await new Promise<Blob>((resolve) => {
        const img = new window.Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const maxW = 1600, maxH = 1600;
          let w = img.width, h = img.height;
          if (w > maxW || h > maxH) { const ratio = Math.min(maxW / w, maxH / h); w = Math.round(w * ratio); h = Math.round(h * ratio); }
          canvas.width = w; canvas.height = h;
          canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
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
      toast({ title: "Upload failed", variant: "destructive" }); return null;
    } finally { setUploadingPropertyImage(false); }
  };

  const addProperty = async () => {
    if (!newProperty.client_id) return;
    const { error } = await supabase.from("portal_properties").insert({
      client_id: newProperty.client_id, name: newProperty.name, address: newProperty.address || null,
      notes: newProperty.notes || null, image_url: newProperty.image_url || null,
      customer_preferences: { property_type: newProperty.property_type },
      owner_tech: newPropertyOwnerTech || null,
    });
    if (!error) {
      toast({ title: "Property added" });
      setShowAddProperty(false);
      setPropertySubTab(newProperty.property_type);
      setNewProperty({ name: "", address: "", notes: "", image_url: "", client_id: "", property_type: "apartments" });
      setNewPropertyOwnerTech("");
      loadAll();
    }
  };

  const updatePropertyImage = async (propId: string, file: File) => {
    const url = await uploadPropertyImage(file);
    if (url) {
      // Site Map tab: write to map_image_url so it takes precedence over the
      // property photo and shows immediately. Keep image_url as a fallback.
      const { error } = await supabase.from("portal_properties")
        .update({ map_image_url: url, image_url: url })
        .eq("id", propId);
      if (error) {
        console.error("Update map image failed:", error);
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        return;
      }
      // Immediately reflect the new map image on the currently-open property
      // dashboard. `loadAll` refreshes the `allProperties` list, but the
      // `selectedProperty` state still points at the stale object — without
      // this the Site Map tab keeps showing the old image (or no image at
      // all) until the user navigates away and back.
      setSelectedProperty(prev =>
        prev && prev.id === propId
          ? ({ ...prev, map_image_url: url, image_url: url } as PortalProperty)
          : prev,
      );
      loadAll();
      toast({ title: "Site map updated" });
    }
  };

  const updatePropertyMapData = async (propId: string, mapData: string) => {
    const { error } = await supabase.from("portal_properties")
      .update({ map_data: mapData })
      .eq("id", propId);
    if (error) {
      console.error("Update map data failed:", error);
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setSelectedProperty(prev =>
      prev && prev.id === propId
        ? ({ ...prev, map_data: mapData } as PortalProperty)
        : prev,
    );
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
      loadAll();
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

  const deleteClient = async (id: string) => { await supabase.from("portal_clients").delete().eq("id", id); loadAll(); toast({ title: "Client deleted" }); };
  const deleteProperty = async (id: string) => {
    setDeletePropertyId(id);
    setDeletePropertyPw("");
  };
  const confirmDeleteProperty = async () => {
    if (deletePropertyPw !== "18444") {
      toast({ title: "Incorrect password", variant: "destructive" });
      return;
    }
    const id = deletePropertyId!;
    await supabase.from("portal_properties").update({ archived_at: new Date().toISOString() } as any).eq("id", id);
    if (selectedProperty?.id === id) setSelectedProperty(null);
    setDeletePropertyId(null);
    setDeletePropertyPw("");
    loadAll();
    toast({ title: "Property hidden", description: "It can be restored from the database if needed." });
  };
  const renameProperty = async (id: string, name: string) => {
    const { error } = await supabase.from("portal_properties").update({ name }).eq("id", id);
    if (error) { toast({ title: "Rename failed", description: error.message, variant: "destructive" }); return; }
    // optimistic local update so the header / list reflect the change immediately
    setAllProperties(prev => prev.map(p => p.id === id ? { ...p, name } : p));
    if (selectedProperty?.id === id) setSelectedProperty(prev => prev ? { ...prev, name } : prev);
    toast({ title: "Property renamed", duration: 1500 });
  };
  const updatePropertyAddress = async (id: string, address: string) => {
    const { error } = await supabase.from("portal_properties").update({ address }).eq("id", id);
    if (error) { toast({ title: "Address update failed", description: error.message, variant: "destructive" }); return; }
    setAllProperties(prev => prev.map(p => p.id === id ? { ...p, address } : p));
    if (selectedProperty?.id === id) setSelectedProperty(prev => prev ? { ...prev, address } : prev);
    toast({ title: "Address updated", duration: 1500 });
  };
  /**
   * Rename the client/owner shown under the property name. We update the field
   * that `getClientName` reads from first (`company` if it exists, otherwise
   * `name`) so the change is reflected everywhere the helper is used.
   */
  const renameClient = async (clientId: string, next: string) => {
    const c = clients.find(cl => cl.id === clientId);
    if (!c) return;
    const patch: { company?: string; name?: string } = c.company
      ? { company: next }
      : { name: next };
    const { error } = await supabase.from("portal_clients").update(patch).eq("id", clientId);
    if (error) { toast({ title: "Rename failed", description: error.message, variant: "destructive" }); return; }
    setClients(prev => prev.map(cl => cl.id === clientId ? { ...cl, ...patch } : cl));
    toast({ title: "Owner renamed", duration: 1500 });
  };
  const deleteService = async (id: string) => { await supabase.from("portal_services").delete().eq("id", id); loadAll(); toast({ title: "Service deleted" }); };
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

  const createAndOpenReport = async (status: string) => {
    if (!selectedProperty) return;
    const { data, error } = await supabase.from("portal_services").insert({
      property_id: selectedProperty.id,
      service_type: "General Pest Control",
      status,
      service_date: status === "scheduled" ? null : new Date().toISOString().split("T")[0],
    }).select("id").single();
    if (error || !data) { toast({ title: "Failed to create service", variant: "destructive" }); return; }
    // Save selected property for back navigation
    sessionStorage.setItem("portal-admin-selected-property", selectedProperty.id);
    const client = getClient(selectedProperty.client_id);
    const stateData = {
      propertyName: selectedProperty.name,
      propertyAddress: selectedProperty.address || "",
      propertyId: selectedProperty.id,
      clientName: client?.company || client?.name,
      returnTo: "/portal-admin",
      propertyEquipment: Array.isArray(selectedProperty.equipment) ? selectedProperty.equipment : [],
      customerPreference: (selectedProperty.customer_preferences as any)?.preference || "",
      customerPreferenceNotes: (selectedProperty.customer_preferences as any)?.notes || "",
    };
    sessionStorage.setItem(`appointment-report-${data.id}`, JSON.stringify(stateData));
    window.open(`/appointment-report/${data.id}`, "_blank");
    loadAll();
  };

  const openServiceReport = async (s: PortalService) => {
    const prop = allProperties.find(p => p.id === s.property_id);
    const client = prop ? getClient(prop.client_id) : null;

    // Save selected property for back navigation
    if (prop) sessionStorage.setItem("portal-admin-selected-property", prop.id);

    // Gather units from units_planned, past services, and pending work orders
    const propServices = allServices.filter(sv => sv.property_id === s.property_id);
    const pastCompleted = propServices
      .filter(sv => sv.status === "completed")
      .sort((a, b) => (b.service_date || "").localeCompare(a.service_date || ""));

    // Planned units stored on this service (already merged from past + follow-ups by dashboard)
    const unitsPlanned = Array.isArray(s.units_planned) ? s.units_planned as string[] : [];

    // Units flagged for follow-up from most recent past service.
    // The checkbox is the ONLY valid trigger; status text alone must never
    // roll a unit into a future service.
    const followUpUnits: string[] = [];
    if (pastCompleted.length > 0) {
      const recent = pastCompleted[0];
      if (Array.isArray(recent.unit_details)) {
        (recent.unit_details as any[]).forEach((u: any) => {
          if (u.unit_number && u.follow_up_needed === true) {
            followUpUnits.push(u.unit_number);
          }
        });
      }
    }

    // Pest data from most recent past service (context only; not scheduling).
    const recentPestData: Record<string, { findings?: string; pest_activity?: string; products_used?: string }> = {};
    if (pastCompleted.length > 0) {
      const recent = pastCompleted[0];
      if (Array.isArray(recent.unit_details)) {
        (recent.unit_details as any[]).forEach((u: any) => {
          if (u.unit_number) {
            recentPestData[u.unit_number] = {
              findings: u.findings || "",
              pest_activity: u.pest_activity || "",
              products_used: u.products_used || "",
            };
          }
        });
      }
    }

    // Pull pending work orders for this property — include those units + pest info
    const { data: pendingReqs } = await supabase
      .from("portal_requests")
      .select("*")
      .eq("property_id", s.property_id)
      .in("status", ["pending", "in_progress"]);

    const workOrderUnits: string[] = [];
    if (Array.isArray(pendingReqs)) {
      pendingReqs.forEach((r: any) => {
        if (r.unit_number) {
          workOrderUnits.push(r.unit_number);
          // Merge work order pest info — prefer existing recent data, then add WO context
          const existing = recentPestData[r.unit_number] || {};
          const woFindings = [r.pest_type, r.location_type, r.description].filter(Boolean).join(" - ");
          recentPestData[r.unit_number] = {
            findings: existing.findings ? `${existing.findings}\nWork Order: ${woFindings}` : `Work Order: ${woFindings}`,
            pest_activity: existing.pest_activity || r.pest_type || "",
            products_used: existing.products_used || "",
          };
        }
      });
    }

    // Merge all actionable units. Do NOT add every recent unit — that would
    // create accidental future follow-up work when the checkbox was not checked.
    const allUnitNumbers = Array.from(new Set([
      ...unitsPlanned,
      ...followUpUnits,
      ...workOrderUnits,
    ])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const stateData = {
      serviceData: s,
      propertyName: prop?.name || "",
      propertyAddress: prop?.address || "",
      propertyId: s.property_id,
      clientName: client?.company || client?.name,
      returnTo: "/portal-admin",
      propertyEquipment: Array.isArray(prop?.equipment) ? prop.equipment : [],
      customerPreference: (prop?.customer_preferences as any)?.preference || "",
      customerPreferenceNotes: (prop?.customer_preferences as any)?.notes || "",
      prePopulatedUnits: allUnitNumbers,
      followUpUnits,
      recentPestData,
      pendingWorkOrders: pendingReqs || [],
    };
    sessionStorage.setItem(`appointment-report-${s.id}`, JSON.stringify(stateData));
    window.open(`/appointment-report/${s.id}`, "_blank");
  };

  const today = new Date().toISOString().split("T")[0];

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
                <SelectContent>{allProperties.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
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
          <div><Label>Summary</Label><Textarea placeholder="Brief overview..." value={serviceForm.summary} onChange={e => setServiceForm(f => ({ ...f, summary: e.target.value }))} /></div>
          <div><Label>Findings</Label><Textarea placeholder="What was found..." value={serviceForm.findings} onChange={e => setServiceForm(f => ({ ...f, findings: e.target.value }))} /></div>
          <div><Label>Notes</Label><Textarea placeholder="Additional notes..." value={serviceForm.notes} onChange={e => setServiceForm(f => ({ ...f, notes: e.target.value }))} /></div>
          <div>
            <Label className="mb-2 block">Products Used</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRODUCTS.map(p => (
                <Badge key={p} variant={serviceForm.products_used.includes(p) ? "default" : "outline"}
                  className="cursor-pointer text-xs" onClick={() => toggleProduct(p)}>{p}</Badge>
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Units Treated</Label>
              <Button type="button" variant="outline" size="sm" onClick={addUnit}><Plus className="w-3 h-3 mr-1" />Add Unit</Button>
            </div>
            {serviceForm.unit_details.map((unit, i) => (
              <Card key={i} className="mb-2">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Input placeholder="Unit #" value={unit.unit_number} onChange={e => updateUnit(i, "unit_number", e.target.value)} className="w-40" />
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeUnit(i)}><X className="w-3.5 h-3.5" /></Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Findings" value={unit.findings} onChange={e => updateUnit(i, "findings", e.target.value)} />
                    <Input placeholder="Pest activity" value={unit.pest_activity} onChange={e => updateUnit(i, "pest_activity", e.target.value)} />
                  </div>
                  <Input placeholder="Products used" value={unit.products_used} onChange={e => updateUnit(i, "products_used", e.target.value)} />
                  <Input placeholder="Notes" value={unit.notes} onChange={e => updateUnit(i, "notes", e.target.value)} />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <Switch checked={serviceForm.follow_up_recommended} onCheckedChange={v => setServiceForm(f => ({ ...f, follow_up_recommended: v }))} />
            <Label>Follow-up Recommended</Label>
          </div>
          {serviceForm.follow_up_recommended && <Textarea placeholder="Follow-up details..." value={serviceForm.follow_up_notes} onChange={e => setServiceForm(f => ({ ...f, follow_up_notes: e.target.value }))} />}
          <div className="flex items-center gap-3">
            <Switch checked={serviceForm.prep_required} onCheckedChange={v => setServiceForm(f => ({ ...f, prep_required: v }))} />
            <Label>Prep Required</Label>
          </div>
          {serviceForm.prep_required && <Textarea placeholder="Prep instructions..." value={serviceForm.prep_notes} onChange={e => setServiceForm(f => ({ ...f, prep_notes: e.target.value }))} />}
          <div><Label>Special Notes</Label><Textarea placeholder="Any special notes..." value={serviceForm.special_notes} onChange={e => setServiceForm(f => ({ ...f, special_notes: e.target.value }))} /></div>
          <Button onClick={saveService} disabled={!serviceForm.service_type || !(serviceForm.property_id || selectedProperty?.id)} className="w-full">
            {editingService ? "Update Service" : "Add Service"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  // ============ PROPERTY LIST VIEW ============
  if (!selectedProperty) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-card border-b px-4 py-3 flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-5 h-5" /></Button>
          <img src={crestLogo} alt="Crest" className="h-8" />
          <h1 className="text-lg font-bold flex-1">Client Portal Admin</h1>
          {/* <NotificationBell /> hidden to prevent crashes */}
        </div>

        <div className="p-4 max-w-7xl mx-auto">
          <Tabs value={globalTab} onValueChange={setGlobalTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="properties"><MapPin className="w-4 h-4 mr-1" />Properties</TabsTrigger>
              <TabsTrigger value="billing"><DollarSign className="w-4 h-4 mr-1" />Billing &amp; Schedule</TabsTrigger>
              <TabsTrigger value="regional"><Users className="w-4 h-4 mr-1" />Regional Managers</TabsTrigger>
            </TabsList>

            <TabsContent value="properties">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-base">Properties</CardTitle>
                  <div className="flex gap-2">
                    <Dialog open={showAddClient} onOpenChange={setShowAddClient}>
                      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="w-4 h-4 mr-1" />Add Client</Button></DialogTrigger>
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
                    <Dialog open={showAddProperty} onOpenChange={setShowAddProperty}>
                      <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Property</Button></DialogTrigger>
                      <DialogContent>
                        <DialogHeader><DialogTitle>Add Property</DialogTitle></DialogHeader>
                        <div className="space-y-3">
                          <div>
                            <Label>Client / Owner *</Label>
                            <Select value={newProperty.client_id} onValueChange={v => setNewProperty(p => ({ ...p, client_id: v }))}>
                              <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                              <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Property Type *</Label>
                            <Select value={newProperty.property_type} onValueChange={v => setNewProperty(p => ({ ...p, property_type: v as PropertyType }))}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PROPERTY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div><Label>Property Name *</Label><Input value={newProperty.name} onChange={e => setNewProperty({ ...newProperty, name: e.target.value })} /></div>
                          <div><Label>Address</Label><Input value={newProperty.address} onChange={e => setNewProperty({ ...newProperty, address: e.target.value })} /></div>
                          {(newProperty.property_type === "hoa" || newProperty.property_type === "apartments") && (
                            <div>
                              <Label>Client Owner (Crest staff)</Label>
                              <Select value={newPropertyOwnerTech} onValueChange={setNewPropertyOwnerTech}>
                                <SelectTrigger><SelectValue placeholder="Assign a Crest team member" /></SelectTrigger>
                                <SelectContent>
                                  {STAFF_NAMES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                          <div><Label>Notes</Label><Textarea value={newProperty.notes} onChange={e => setNewProperty({ ...newProperty, notes: e.target.value })} /></div>
                          <div>
                            <Label>Property Image</Label>
                            <Input type="file" accept="image/*" onChange={async e => {
                              const f = e.target.files?.[0];
                              if (f) { const url = await uploadPropertyImage(f); if (url) setNewProperty(p => ({ ...p, image_url: url })); }
                            }} />
                            {newProperty.image_url && <img src={newProperty.image_url} alt="" className="mt-2 rounded h-24 object-cover" />}
                          </div>
                          <Button onClick={addProperty} disabled={!newProperty.name || !newProperty.client_id} className="w-full">Add Property</Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs value={propertySubTab} onValueChange={(v) => setPropertySubTab(v as PropertyType)} className="mb-4">
                    <TabsList>
                      {PROPERTY_TYPES.map(t => {
                        const count = allProperties.filter(p => getPropertyType(p) === t.value).length;
                        return (
                          <TabsTrigger key={t.value} value={t.value}>
                            {t.label}
                            <span className="ml-1.5 text-xs text-muted-foreground">({count})</span>
                          </TabsTrigger>
                        );
                      })}
                    </TabsList>
                  </Tabs>
                  {(() => {
                    const filtered = allProperties.filter(p => getPropertyType(p) === propertySubTab);
                    return filtered.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium">No {PROPERTY_TYPES.find(t => t.value === propertySubTab)?.label} properties yet</p>
                      <p className="text-xs mt-1">Click "Add Property" and choose this type</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {filtered.map(p => {
                        const propServices = allServices.filter(s => s.property_id === p.id);
                        const propPast = propServices.filter(s => s.status === "completed" || (s.service_date && s.service_date <= today));
                        const propFuture = propServices.filter(s => s.status === "scheduled" && (!s.service_date || s.service_date > today));
                        return (
                          <div key={p.id} className="flex items-center justify-between border rounded-lg p-4 cursor-pointer hover:border-primary/40 hover:bg-muted/30 transition-colors group"
                            onClick={() => { setSelectedProperty(p); ensurePropertyLink(p); }}>
                            <div className="flex items-center gap-3">
                              <div>
                                <p className="font-medium" onClick={(e) => e.stopPropagation()}>
                                  <InlineEditableText
                                    value={p.name}
                                    onSave={(next) => renameProperty(p.id, next)}
                                    inputClassName="text-sm font-medium"
                                  />
                                </p>
                                <p className="text-sm text-muted-foreground">{getClientName(p.client_id)}</p>
                                {p.address && <p className="text-xs text-muted-foreground">{p.address}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right text-xs text-muted-foreground">
                                <p>{propPast.length} past · {propFuture.length} upcoming</p>
                              </div>
                              <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => { e.stopPropagation(); deleteProperty(p.id); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                              <ChevronRight className="w-5 h-5 text-muted-foreground" />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                  })()}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Billing & Schedule tab — admin-only revenue + overage tracking */}
            <TabsContent value="billing">
              <BillingDashboard
                clients={clients}
                properties={allProperties}
                services={allServices}
              />
            </TabsContent>

            <TabsContent value="regional">
              <div className="-mx-4 sm:-mx-6 xl:-mx-16 2xl:-mx-28">
                <RegionalManagersTab />
              </div>
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
                            <div key={key} className="border rounded-lg p-3 cursor-pointer hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium text-sm">{mc?.name || data.clientName}</p>
                                  <p className="text-xs text-muted-foreground truncate max-w-xs mt-1">{data.lastMessage.message}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  {data.unread > 0 && <Badge className="text-xs">{data.unread}</Badge>}
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

  // ============ PROPERTY DETAIL VIEW ============
  const propServices = allServices.filter(s => s.property_id === selectedProperty.id);
  const propLinks = allLinks.filter(l => l.assigned_property_ids && (l.assigned_property_ids as string[]).includes(selectedProperty.id));
  const client = getClient(selectedProperty.client_id);

  return (
    <div className="min-h-screen bg-background">
      {/* Admin bar */}
      <div className="bg-foreground text-background px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" className="text-background hover:text-background/80 h-7 px-2" onClick={() => { setSelectedProperty(null); }}>
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />All Properties
          </Button>
          <span className="text-background/60 font-medium">
            Admin Portal — Full View
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {propLinks[0] && (
            <>
              <span className="hidden sm:inline text-background/60 font-mono text-[10px] truncate max-w-[260px]">
                {window.location.origin}/pm/{propLinks[0].token}
              </span>
              <Button variant="ghost" size="sm" className="text-background hover:text-background/80 h-7 px-2"
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/pm/${propLinks[0].token}`);
                  toast({ title: "Customer portal link copied" });
                }}>
                <Copy className="w-3.5 h-3.5 mr-1" />Copy Customer Link
              </Button>
              <Button variant="ghost" size="sm" className="text-background hover:text-background/80 h-7 px-2"
                onClick={() => window.open(`/pm/${propLinks[0].token}`, "_blank")}>
                <ExternalLink className="w-3.5 h-3.5 mr-1" />Open Customer Portal
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Page header */}
      <div className="bg-card border-b px-4 py-4">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center gap-3">
            <img src={crestLogo} alt="Crest Pest Control" className="h-10" />
            <div className="flex-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
                <span className="cursor-pointer hover:text-foreground" onClick={() => { setSelectedProperty(null); }}>Properties</span>
                <ChevronRight className="w-3 h-3" />
                <span className="text-foreground font-medium">{selectedProperty.name}</span>
              </div>
                <h1 className="text-xl font-bold">
                  <InlineEditableText
                    value={selectedProperty.name}
                    onSave={(next) => renameProperty(selectedProperty.id, next)}
                    inputClassName="text-xl font-bold h-9"
                  />
                </h1>
              <p className="text-sm text-muted-foreground">
                <InlineEditableText
                  value={selectedProperty.address || ""}
                  onSave={(next) => updatePropertyAddress(selectedProperty.id, next)}
                  placeholder="Add address"
                  inputClassName="text-sm h-7"
                />
              </p>
              <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
                <span>Owner:</span>
                <InlineEditableText
                  value={getClientName(selectedProperty.client_id)}
                  onSave={(next) => renameClient(selectedProperty.client_id, next)}
                  placeholder="Owner"
                  inputClassName="text-xs h-6"
                />
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-[1600px] mx-auto px-4 py-4">
        {getPropertyType(selectedProperty) === "commercial" ? (
          <CommercialDashboardView
            property={selectedProperty as any}
            services={propServices as any}
            links={propLinks as any}
            clientName={client?.company || client?.name || ""}
            onEditService={(s) => openServiceDialog(s as any)}
            onDeleteService={deleteService}
            onCopyLink={copyLink}
            onOpenPortal={openPortal}
            onRefresh={loadAll}
            onUpdatePropertyImage={updatePropertyImage}
            uploadingPropertyImage={uploadingPropertyImage}
            onUpdatePropertyMapData={updatePropertyMapData}
          />
        ) : (
        <PropertyDashboard
          property={selectedProperty}
          services={propServices}
          links={propLinks}
          clientName={client?.company || client?.name || ""}
          clientId={selectedProperty.client_id}
          onRefresh={loadAll}
          onOpenServiceReport={openServiceReport}
          onEditService={(s) => openServiceDialog(s)}
          onDeleteService={deleteService}
          onUpdatePropertyImage={updatePropertyImage}
          uploadingPropertyImage={uploadingPropertyImage}
          onCopyLink={copyLink}
          onOpenPortal={openPortal}
          onAddUpcomingService={() => createAndOpenReport("scheduled")}
          propertyType={getPropertyType(selectedProperty)}
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
                  <div>
                    <p className="text-xs text-muted-foreground">Date</p>
                    {/* Upcoming (scheduled) visits store a NULL service_date until
                        they're completed — default the display to TODAY so the
                        dialog never shows "—" for the next visit. */}
                    <p>{(() => {
                      const iso = selectedService.service_date || (selectedService.status === "scheduled" ? new Date().toISOString().slice(0, 10) : null);
                      return iso ? new Date(iso + "T00:00:00").toLocaleDateString() : "—";
                    })()}</p>
                  </div>
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
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { setSelectedService(null); openServiceDialog(selectedService); }}><Edit className="w-3.5 h-3.5 mr-1" />Edit</Button>
                  <Button variant="secondary" size="sm" className="flex-1" onClick={() => { openServiceReport(selectedService); }}>
                    <FileText className="w-3.5 h-3.5 mr-1" />Appointment Report
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => { deleteService(selectedService.id); setSelectedService(null); }}>Delete</Button>
                </div>
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

      {/* Delete Property Password Dialog */}
      <Dialog open={!!deletePropertyId} onOpenChange={(o) => { if (!o) { setDeletePropertyId(null); setDeletePropertyPw(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Hide Property</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Enter the admin password to hide this property. It will no longer appear in the admin list but can be restored later.</p>
            <div>
              <Label>Admin Password</Label>
              <Input
                type="password"
                autoFocus
                value={deletePropertyPw}
                onChange={e => setDeletePropertyPw(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") confirmDeleteProperty(); }}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => { setDeletePropertyId(null); setDeletePropertyPw(""); }}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDeleteProperty} disabled={!deletePropertyPw}>Hide Property</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer */}
      <div className="border-t mt-8 py-4 text-center text-xs text-muted-foreground space-y-1">
        <p>© {new Date().getFullYear()} Crest Pest Control • 949-424-5000 • office@crestpestcontrol.com</p>
        <p>
          <a
            href="https://search.dca.ca.gov/details/8400/PR/9859/ccd5c9c9bf593119ba12f0de94b26b73"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            PR # 9859
          </a>
        </p>
      </div>
    </div>
  );
};

export default PortalAdmin;
