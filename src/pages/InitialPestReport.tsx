import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Home,
  Share2,
  Loader2,
  Send,
  FileDown,
  X,
  ChevronDown,
  Sparkles,
  Mail,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Plus,
  Minus,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MapCanvas } from "@/components/MapCanvas";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import crestLogo from "@/assets/crest-logo.png";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TECHNICIANS = [
  { name: "Alexis Rodriguez", license: "RA 68916" },
  { name: "Darrell Tanner", license: "FR 62523" },
  { name: "Marcus Reynolds", license: "FR 41031" },
  { name: "Jesse Angulo", license: "FR 51548" },
  { name: "Jake Shubin", license: "RA 71439" },
  { name: "Caleb Whalen", license: "RA 71438" },
];

const PEST_OPTIONS = ['Ants', 'Roaches', 'Crickets', 'Earwigs', 'Spiders', 'Silverfish', 'Centipedes', 'Wasps', 'Rodents', 'Fleas & Ticks', 'Bed Bugs', 'Bees', 'Mosquitoes', 'Millipedes', 'Box Elder Bugs', 'Clover Mites', 'American Roaches', 'Other'];

const PRODUCT_OPTIONS = ['Alpine WSG', 'Bifen I/T', 'Essentria IC Pro', 'Temprid FX', 'Termidor SC', 'Phantom', 'Onslaught', 'Gentrol IGR', 'Nyguard IGR', 'PT Wasp Freeze II', 'Gentrol Aerosol', 'Shockwave 1', 'Essentria G', 'Bifen LP', 'Advion Ant Gel Bait', 'Advion Cockroach Gel Bait', 'Contrac All Weather Blox', 'DeltaDust', 'Maxforce FC Ant Gel', 'Other'];

const EQUIPMENT_OPTIONS = ['Rodent Bait Stations', 'Rodent Traps', 'Mosquito Buckets', 'Fly Light', 'Pest Monitors'];

const InitialPestReport = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { reportId } = useParams();
  const isMobile = useIsMobile();
  const {
    technicianName,
    customerName,
    address,
    notes,
    screenshots,
    serviceDate,
    licenseNumber,
    targetPests,
    productsUsed,
  } = location.state || {};

  const [extractedAddress, setExtractedAddress] = useState<string>("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [editableTech, setEditableTech] = useState(technicianName || "");
  const [editableCustomer, setEditableCustomer] = useState(customerName || "");
  const [editableServiceDate, setEditableServiceDate] = useState(serviceDate || new Date().toISOString().split("T")[0]);
  const [editableLicenseNumber, setEditableLicenseNumber] = useState(licenseNumber || "");
  const [editableAddress, setEditableAddress] = useState(address || "");
  const [editableTitle, setEditableTitle] = useState("Initial Pest Report");
  const [editableNotes, setEditableNotes] = useState(notes || "");

  const handleTechnicianChange = (techName: string) => {
    setEditableTech(techName);
    const tech = TECHNICIANS.find(t => t.name === techName);
    if (tech) {
      setEditableLicenseNumber(tech.license);
    }
  };

  const [editableTargetPests, setEditableTargetPests] = useState<string[]>(targetPests?.filter((p: string) => p) || []);
  const [editableProductsUsed, setEditableProductsUsed] = useState<string[]>(productsUsed?.filter((p: string) => p) || []);
  const [editableEquipment, setEditableEquipment] = useState<string[]>([]);
  const [editableFindings, setEditableFindings] = useState<string[]>([]);

  const [pestsDropdownOpen, setPestsDropdownOpen] = useState(false);
  const [productsDropdownOpen, setProductsDropdownOpen] = useState(false);
  const [equipmentDropdownOpen, setEquipmentDropdownOpen] = useState(false);
  const pestsDropdownRef = useRef<HTMLDivElement>(null);
  const productsDropdownRef = useRef<HTMLDivElement>(null);
  const equipmentDropdownRef = useRef<HTMLDivElement>(null);

  const [mapData, setMapData] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(20);
  const [staticMapUrl, setStaticMapUrl] = useState<string | null>(null);
  const [customMapImage, setCustomMapImage] = useState<string | null>(null);
  const latestMapDataRef = useRef<string | null>(null);
  const [propertyImages, setPropertyImages] = useState<Array<{ image: string; caption?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpandingFindings, setIsExpandingFindings] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [customerSignature, setCustomerSignature] = useState<string | null>(null);

  const expandWithAI = async (text: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setIsExpandingFindings(true);
    try {
      const { data, error } = await supabase.functions.invoke('expand-findings', {
        body: { text, type: 'findings' }
      });
      if (error) throw error;
      if (data?.expandedText) {
        setter([data.expandedText]);
        toast.success('Text expanded!');
      }
    } catch (error: any) {
      console.error('Error expanding text:', error);
      toast.error('Failed to expand text');
    } finally {
      setIsExpandingFindings(false);
    }
  };

  useEffect(() => {
    if (reportId) {
      loadReport();
    } else if (screenshots && screenshots.length > 0) {
      processScreenshots();
      analyzeFindings();
    } else if (address) {
      geocodeAddress(address);
    }
  }, [reportId]);

  useEffect(() => {
    latestMapDataRef.current = mapData;
  }, [mapData]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pestsDropdownRef.current && !pestsDropdownRef.current.contains(event.target as Node)) {
        setPestsDropdownOpen(false);
      }
      if (productsDropdownRef.current && !productsDropdownRef.current.contains(event.target as Node)) {
        setProductsDropdownOpen(false);
      }
      if (equipmentDropdownRef.current && !equipmentDropdownRef.current.contains(event.target as Node)) {
        setEquipmentDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (coordinates) {
      fetchStaticMap();
    }
  }, [coordinates, zoomLevel]);

  const fetchStaticMap = async () => {
    if (!coordinates) return;
    try {
      const { data, error } = await supabase.functions.invoke("static-map", {
        body: {
          lat: coordinates.lat,
          lng: coordinates.lng,
          zoom: zoomLevel,
          width: 275,
          height: 1005,
          marker: "1",
        },
      });
      if (error) {
        console.error("Error fetching static map:", error);
        return;
      }
      if (data?.dataUrl) {
        setStaticMapUrl(data.dataUrl);
      }
    } catch (error) {
      console.error("Error fetching static map:", error);
    }
  };

  const loadReport = async () => {
    if (!reportId) return;
    try {
      const { data, error } = await supabase.from("reports").select("*").eq("id", reportId).single();
      if (error) throw error;
      setEditableTech(data.technician_name);
      setEditableCustomer(data.customer_name || "");
      setExtractedAddress(data.address || "");
      setEditableFindings((data.findings as string[]) || []);
      setMapData(data.map_data ? JSON.stringify(data.map_data) : null);
      if (data.custom_map_url) {
        setCustomMapImage(data.custom_map_url);
      }
      if (data.property_images) {
        setPropertyImages(data.property_images as Array<{ image: string; caption?: string }>);
      }
      if (data.map_url) {
        const latMatch = data.map_url.match(/mlat=([-\d.]+)/);
        const lngMatch = data.map_url.match(/mlon=([-\d.]+)/);
        if (latMatch && lngMatch) {
          setCoordinates({
            lat: parseFloat(latMatch[1]),
            lng: parseFloat(lngMatch[1]),
          });
        }
      } else if (data.address) {
        geocodeAddress(data.address);
      }
    } catch (error: any) {
      toast.error("Failed to load report");
      console.error(error);
    }
  };

  const processScreenshots = async () => {
    setIsProcessing(true);
    try {
      const imagePromises = screenshots.map((file: File) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });
      const imageDataUrls = await Promise.all(imagePromises);
      extractCustomerName(imageDataUrls);
      const { data, error } = await supabase.functions.invoke("extract-address", {
        body: { images: imageDataUrls },
      });
      if (error) {
        console.error("Error extracting address:", error);
        return;
      }
      if (data.address && data.address !== "Address not found") {
        setExtractedAddress(data.address);
        if (data.coordinates) {
          setCoordinates(data.coordinates);
        }
      }
    } catch (error) {
      console.error("Error processing screenshots:", error);
    } finally {
      setIsProcessing(false);
    }
  };

  const extractCustomerName = async (imageDataUrls: string[]) => {
    try {
      const { data, error } = await supabase.functions.invoke("extract-customer-info", {
        body: { images: imageDataUrls.slice(0, 3) },
      });
      if (!error && data?.customerName) {
        setEditableCustomer(data.customerName);
        toast.success(`Customer name found: ${data.customerName}`);
      }
    } catch (error) {
      console.error("Error extracting customer name:", error);
    }
  };

  const analyzeFindings = async () => {
    setIsAnalyzing(true);
    try {
      const imagePromises = screenshots.map((file: File) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });
      const imageDataUrls = await Promise.all(imagePromises);
      const { data, error } = await supabase.functions.invoke("analyze-findings", {
        body: {
          images: imageDataUrls,
          address: extractedAddress || address,
        },
      });
      if (error) {
        console.error("Error analyzing findings:", error);
        return;
      }
      if (data?.findings) {
        setEditableFindings(data.findings);
      }
      toast.success("Report generated!");
    } catch (error) {
      console.error("Error analyzing findings:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const geocodeAddress = async (addr: string) => {
    try {
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}`;
      const response = await fetch(geocodeUrl, {
        headers: { "User-Agent": "PestProReports/1.0" },
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          setCoordinates({
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon),
          });
          setExtractedAddress(addr);
        }
      }
    } catch (error) {
      console.error("Geocoding error:", error);
    }
  };

  const handleSubmit = async () => {
    if (!editableTech) {
      toast.error("Please enter technician name");
      return;
    }
    setIsSaving(true);
    try {
      const rawMap = latestMapDataRef.current ?? mapData;
      let mapPayload: any = null;
      if (rawMap) {
        try {
          mapPayload = JSON.parse(rawMap);
        } catch (e) {
          console.error("Failed to parse map data:", e);
          mapPayload = rawMap;
        }
      }
      const reportData = {
        technician_name: editableTech,
        customer_name: editableCustomer,
        address: editableAddress || extractedAddress || address,
        notes: editableNotes,
        findings: editableFindings,
        recommendations: [],
        next_steps: [],
        map_url: coordinates
          ? `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=17/${coordinates.lat}/${coordinates.lng}`
          : null,
        map_data: mapPayload,
        custom_map_url: customMapImage,
        property_images: propertyImages,
      };
      if (reportId) {
        const { error } = await supabase.from("reports").update(reportData).eq("id", reportId);
        if (error) throw error;
        toast.success("Report updated successfully!");
      } else {
        const { error } = await supabase.from("reports").insert([reportData]);
        if (error) throw error;
        toast.success("Report submitted successfully!");
        setTimeout(() => navigate("/"), 2000);
      }
    } catch (error: any) {
      toast.error("Failed to save report");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "Initial Pest Report",
          text: `Report for ${editableCustomer || "Customer"} at ${extractedAddress || address || "location"}`,
        });
      } catch {
        console.log("Share cancelled");
      }
    } else {
      toast.info("Sharing not supported on this device");
    }
  };

  const exportToPDF = async () => {
    try {
      const toasts = document.querySelectorAll('[role="status"], .sonner, [data-sonner-toaster]');
      toasts.forEach((toastEl) => {
        (toastEl as HTMLElement).style.display = "none";
      });
      await new Promise((r) => setTimeout(r, 150));
      window.print();
      setTimeout(() => {
        toasts.forEach((toastEl) => {
          (toastEl as HTMLElement).style.display = "";
        });
      }, 500);
    } catch (e) {
      toast.error("Print failed");
    }
  };

  const handleSendEmail = async () => {
    if (!customerEmail) {
      toast.error("Please enter customer email address");
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(customerEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setIsSendingEmail(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-report-email', {
        body: {
          customerEmail,
          customerName: editableCustomer,
          technicianName: editableTech,
          address: extractedAddress || address || "",
          findings: editableFindings,
          targetPests: editableTargetPests,
          productsUsed: editableProductsUsed,
          equipment: editableEquipment,
          reportUrl: reportId ? `${window.location.origin}/initial-pest-report/${reportId}` : "",
        }
      });
      if (error) throw error;
      toast.success(`Report sent to ${customerEmail}`);
    } catch (error: any) {
      console.error('Error sending email:', error);
      toast.error("Failed to send email. Please try again.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  const updateItem = (index: number, value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter((prev) => {
      const newArr = [...prev];
      newArr[index] = value;
      return newArr;
    });
  };

  const mapUrl = staticMapUrl || "";
  const handleZoomIn = () => setZoomLevel((prev) => Math.min(prev + 1, 22));
  const handleZoomOut = () => setZoomLevel((prev) => Math.max(prev - 0.5, 15));

  const panBy = (dxPx: number, dyPx: number) => {
    setCoordinates((prev) => {
      if (!prev) return prev;
      const latRad = (prev.lat * Math.PI) / 180;
      const metersPerPixel = (156543.03392 * Math.cos(latRad)) / Math.pow(2, zoomLevel);
      const metersX = dxPx * metersPerPixel;
      const metersY = dyPx * metersPerPixel;
      const deltaLng = metersX / (111320 * Math.cos(latRad));
      const deltaLat = -metersY / 110540;
      return { lat: prev.lat + deltaLat, lng: prev.lng + deltaLng };
    });
  };

  const handleCustomMapUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${reportId || 'temp'}/custom-map/${fileName}`;
      const { error: uploadError } = await supabase.storage
        .from('report-images')
        .upload(filePath, file, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage
        .from('report-images')
        .getPublicUrl(filePath);
      setCustomMapImage(publicUrl);
      toast.success('Custom map image uploaded');
    } catch (error) {
      console.error('Error uploading map:', error);
      toast.error('Failed to upload map image');
    }
  };

  const handlePropertyImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const fileArray = Array.from(files).slice(0, 5);
    if (fileArray.some(file => !file.type.startsWith('image/'))) {
      toast.error('Please upload only image files');
      return;
    }
    try {
      const uploadPromises = fileArray.map(async (file) => {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${reportId || 'temp'}/property/${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('report-images')
          .upload(filePath, file, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage
          .from('report-images')
          .getPublicUrl(filePath);
        return { image: publicUrl, caption: '' };
      });
      const uploadedImages = await Promise.all(uploadPromises);
      setPropertyImages(uploadedImages);
      toast.success(`${fileArray.length} image(s) uploaded`);
    } catch (error) {
      console.error('Error uploading images:', error);
      toast.error('Failed to upload images');
    }
  };

  const updateImageCaption = (index: number, caption: string) => {
    setPropertyImages(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], caption };
      return updated;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {isMobile && (
        <div className="print-header bg-gradient-primary border-b-2 border-foreground px-4 py-3 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <img src={crestLogo} alt="Crest" className="h-10" />
            <div className="flex gap-2 no-print">
              <Button size="sm" variant="default" onClick={exportToPDF} className="h-9">
                <FileDown className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="secondary" onClick={handleShare} className="h-9">
                <Share2 className="w-4 h-4" />
              </Button>
              <Button size="sm" onClick={() => navigate("/")} variant="outline" className="h-9">
                <Home className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobile && (
        <div className="print-header bg-card shadow-md border-b border-border px-6 py-2.5">
          <div className="max-w-[1800px] mx-auto">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-6 flex-1">
                <div className="flex flex-col items-center">
                  <img src={crestLogo} alt="Crest Pest Control" className="h-20 w-auto" />
                  <span className="text-xs text-muted-foreground mt-1">PR #9859</span>
                </div>
                <div className="flex-1 ml-4">
                  <Input
                    value={editableTitle}
                    onChange={(e) => setEditableTitle(e.target.value)}
                    className="text-xl font-bold text-foreground mb-2 bg-transparent border-b border-border px-1 h-8 focus-visible:ring-0"
                  />
                  <div className="flex gap-8">
                    <div className="flex-[2]">
                      <p className="font-semibold text-foreground text-xs mb-1">Customer Information:</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-20">Name:</span>
                          <Input
                            value={editableCustomer}
                            onChange={(e) => setEditableCustomer(e.target.value)}
                            placeholder="Customer name"
                            className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 focus-visible:ring-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-20">Address:</span>
                          <Input
                            value={editableAddress || extractedAddress}
                            onChange={(e) => setEditableAddress(e.target.value)}
                            placeholder="Enter address"
                            className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-6 text-xs flex-1 focus-visible:ring-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-20">Service Date:</span>
                          <Input
                            type="date"
                            value={editableServiceDate}
                            onChange={(e) => setEditableServiceDate(e.target.value)}
                            className="bg-transparent border-b border-border text-foreground px-1 h-6 text-xs w-32 focus-visible:ring-0"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-foreground text-xs mb-1">Technician Information:</p>
                      <div className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-24">Name:</span>
                          <Select value={editableTech} onValueChange={handleTechnicianChange}>
                            <SelectTrigger className="bg-transparent border-b border-border text-foreground h-7 text-xs flex-1 focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
                              <SelectValue placeholder="Select technician" />
                            </SelectTrigger>
                            <SelectContent>
                              {TECHNICIANS.map((tech) => (
                                <SelectItem key={tech.name} value={tech.name} className="text-xs">
                                  {tech.name} ({tech.license})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-24 whitespace-nowrap">License Number:</span>
                          <span className="text-foreground">{editableLicenseNumber || "—"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 no-print">
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Customer email"
                  className="w-48 h-9 text-xs"
                />
                <Button 
                  onClick={handleSendEmail} 
                  disabled={isSendingEmail || !customerEmail}
                  variant="secondary"
                  size="sm"
                >
                  {isSendingEmail ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3 mr-1" />}
                  Send
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving} size="sm">
                  {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                  {reportId ? "Update" : "Submit"}
                </Button>
                <Button onClick={exportToPDF} variant="outline" size="sm">
                  <FileDown className="w-3 h-3 mr-1" />
                  PDF
                </Button>
                <Button onClick={() => navigate("/")} variant="outline" size="sm">
                  <Home className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Page 1 - Service Report Content */}
      <div className={isMobile ? "flex flex-col" : "p-3 max-w-[1800px] mx-auto"}>
        <div className={isMobile ? "flex-1 overflow-y-auto pb-32" : "grid grid-cols-[1fr_2fr] gap-2"}>
          {/* Mobile: Customer & Technician */}
          {isMobile && (
            <Card className="p-4">
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium mb-1 block">Customer Name</label>
                  <Input
                    value={editableCustomer}
                    onChange={(e) => setEditableCustomer(e.target.value)}
                    placeholder="Enter customer name"
                    className="text-base"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium mb-1 block">Technician Name</label>
                  <Input
                    value={editableTech}
                    onChange={(e) => setEditableTech(e.target.value)}
                    placeholder="Enter technician name"
                    className="text-base"
                  />
                </div>
              </div>
            </Card>
          )}

          {/* Left Column - Target Pests, Products, Equipment */}
          <div className="space-y-1.5">
            {/* Target Pests */}
            <Card className="print-section p-0 overflow-visible rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                <span>Target Pest(s)</span>
              </div>
              <div className="relative" ref={pestsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setPestsDropdownOpen(!pestsDropdownOpen)}
                  className="w-full flex items-center justify-between cursor-pointer py-1 px-2 bg-card hover:bg-muted/50 transition-colors no-print"
                >
                  <span className="text-xs text-muted-foreground">Click to select pests...</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${pestsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {pestsDropdownOpen && (
                  <div 
                    className="absolute z-50 w-full mt-0 bg-background border border-input rounded-b-md shadow-lg max-h-48 overflow-y-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {PEST_OPTIONS.map((pest) => (
                      <button
                        key={pest}
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditableTargetPests(prev => 
                            prev.includes(pest) ? prev.filter(p => p !== pest) : [...prev, pest]
                          );
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-muted flex items-center justify-between ${
                          editableTargetPests.includes(pest) ? 'bg-primary/10 text-primary font-medium' : ''
                        }`}
                      >
                        {pest}
                        {editableTargetPests.includes(pest) && <span className="text-primary">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-1.5 bg-card">
                {editableTargetPests.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {editableTargetPests.map((pest) => (
                      <span
                        key={pest}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground"
                      >
                        {pest}
                        <button
                          type="button"
                          onClick={() => setEditableTargetPests(prev => prev.filter(p => p !== pest))}
                          className="hover:bg-primary-foreground/20 rounded-full p-0.5 no-print"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  placeholder="Add custom pest..."
                  className="h-7 text-xs no-print mt-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !editableTargetPests.includes(value)) {
                        setEditableTargetPests(prev => [...prev, value]);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              </div>
            </Card>

            {/* Products Used */}
            <Card className="print-section p-0 overflow-visible rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                <span>Products Used</span>
              </div>
              <div className="relative" ref={productsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setProductsDropdownOpen(!productsDropdownOpen)}
                  className="w-full flex items-center justify-between cursor-pointer py-1 px-2 bg-card hover:bg-muted/50 transition-colors no-print"
                >
                  <span className="text-xs text-muted-foreground">Click to select products...</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${productsDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {productsDropdownOpen && (
                  <div 
                    className="absolute z-50 w-full mt-0 bg-background border border-input rounded-b-md shadow-lg max-h-48 overflow-y-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {PRODUCT_OPTIONS.map((product) => (
                      <button
                        key={product}
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditableProductsUsed(prev => 
                            prev.includes(product) ? prev.filter(p => p !== product) : [...prev, product]
                          );
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-muted flex items-center justify-between ${
                          editableProductsUsed.includes(product) ? 'bg-primary/10 text-primary font-medium' : ''
                        }`}
                      >
                        {product}
                        {editableProductsUsed.includes(product) && <span className="text-primary">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-1.5 bg-card">
                {editableProductsUsed.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {editableProductsUsed.map((product) => (
                      <span
                        key={product}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground"
                      >
                        {product}
                        <button
                          type="button"
                          onClick={() => setEditableProductsUsed(prev => prev.filter(p => p !== product))}
                          className="hover:bg-secondary-foreground/20 rounded-full p-0.5 no-print"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  placeholder="Add custom product..."
                  className="h-7 text-xs no-print mt-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !editableProductsUsed.includes(value)) {
                        setEditableProductsUsed(prev => [...prev, value]);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              </div>
            </Card>

            {/* Equipment Used */}
            <Card className="print-section p-0 overflow-visible rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                <span>Equipment Used</span>
              </div>
              <div className="relative" ref={equipmentDropdownRef}>
                <button
                  type="button"
                  onClick={() => setEquipmentDropdownOpen(!equipmentDropdownOpen)}
                  className="w-full flex items-center justify-between cursor-pointer py-1 px-2 bg-card hover:bg-muted/50 transition-colors no-print"
                >
                  <span className="text-xs text-muted-foreground">Click to select equipment...</span>
                  <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${equipmentDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {equipmentDropdownOpen && (
                  <div 
                    className="absolute z-50 w-full mt-0 bg-background border border-input rounded-b-md shadow-lg max-h-48 overflow-y-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {EQUIPMENT_OPTIONS.map((item) => (
                      <button
                        key={item}
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditableEquipment(prev => 
                            prev.includes(item) ? prev.filter(p => p !== item) : [...prev, item]
                          );
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-muted flex items-center justify-between ${
                          editableEquipment.includes(item) ? 'bg-primary/10 text-primary font-medium' : ''
                        }`}
                      >
                        {item}
                        {editableEquipment.includes(item) && <span className="text-primary">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-1.5 bg-card">
                {editableEquipment.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {editableEquipment.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground"
                      >
                        {item}
                        <button
                          type="button"
                          onClick={() => setEditableEquipment(prev => prev.filter(p => p !== item))}
                          className="hover:bg-muted-foreground/20 rounded-full p-0.5 no-print"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <Input
                  placeholder="Add custom equipment..."
                  className="h-7 text-xs no-print mt-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const value = (e.target as HTMLInputElement).value.trim();
                      if (value && !editableEquipment.includes(value)) {
                        setEditableEquipment(prev => [...prev, value]);
                        (e.target as HTMLInputElement).value = '';
                      }
                    }
                  }}
                />
              </div>
            </Card>

            {/* Pesticide Notice */}
            <Card className="print-section p-0 overflow-hidden rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                <span className="text-[10px] font-bold">Pesticide Notice</span>
              </div>
              <div className="p-2.5">
                <div className="text-[7px] leading-tight text-foreground space-y-1">
                  <p>State law requires that you be given the following information: CAUTION--PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency.</p>
                  <p>If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately.</p>
                  <p className="font-medium">For further information, contact: Your Pest Control Company (949-424-5000); Health Questions: County Health Department (800-564-8448); Application Information: County Agricultural Commissioner (714-955-0100); Regulatory Information: Structural Pest Control Board (800-737-8188).</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Column - Findings & Signature */}
          <div className="space-y-1.5">
            {/* Service Findings */}
            <Card className="print-section p-0 flex flex-col overflow-hidden rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                <span className="text-xs font-bold">Service Findings</span>
              </div>
              <div className="p-3 flex-1 flex flex-col">
                {isAnalyzing ? (
                  <div className="text-center py-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Analyzing...</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col space-y-1">
                    <Textarea
                      value={editableFindings[0] || ""}
                      onChange={(e) => updateItem(0, e.target.value, setEditableFindings)}
                      placeholder="Enter service findings, observations, and areas of pest activity..."
                      className="text-xs flex-1 min-h-[150px] leading-relaxed resize-none"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => expandWithAI(editableFindings[0] || '', setEditableFindings)}
                      disabled={isExpandingFindings}
                      className="no-print h-6 text-xs"
                    >
                      {isExpandingFindings ? (
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3 mr-1" />
                      )}
                      Expand with AI
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Service Notes */}
            <Card className="print-section p-0 overflow-hidden rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                <span className="text-xs font-bold">Service Notes</span>
              </div>
              <div className="p-3">
                <Textarea
                  value={editableNotes}
                  onChange={(e) => setEditableNotes(e.target.value)}
                  placeholder="Additional notes, recommendations, follow-up actions..."
                  className="text-xs min-h-[100px] leading-relaxed resize-none"
                />
              </div>
            </Card>

            {/* Customer Signature */}
            <Card className="print-section p-0 overflow-hidden rounded-lg">
              <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                <span className="text-xs font-bold">Customer Signature</span>
              </div>
              <div className="p-2.5">
                <SignatureCanvas 
                  onSave={setCustomerSignature} 
                  initialData={customerSignature}
                  label=""
                />
                <div className="mt-2 text-[10px] text-muted-foreground">
                  <span className="font-medium text-foreground">Date:</span> {new Date().toLocaleDateString()}
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Page 2 - Map & Property Images */}
      <div className="print-page-break bg-background">
        <div className={isMobile ? "p-4" : "p-4 max-w-[1800px] mx-auto"}>
          <div className="flex items-center justify-between mb-4 pb-2 border-b-2 border-border">
            <div className="flex items-center gap-3">
              <img src={crestLogo} alt="Crest Pest Control" className="h-12" />
              <h1 className="text-xl font-bold text-foreground">Property Map & Images</h1>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[45%_55%] gap-4 h-[700px] print:h-[calc(100vh-120px)]">
            {/* Map Section */}
            <div className="flex flex-col h-full">
              <div className="flex-1 w-full relative rounded-lg overflow-hidden border-2 border-border max-h-[650px] print:max-h-none">
                {isProcessing && (
                  <div className="no-print absolute inset-0 bg-background/80 flex items-center justify-center z-10">
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                      <p className="text-foreground font-semibold">Processing Map...</p>
                    </div>
                  </div>
                )}

                {mapUrl || customMapImage ? (
                  <div className="relative h-full w-full">
                    <MapCanvas 
                      key={customMapImage ? `custom-${customMapImage}` : `map-${mapUrl}`}
                      mapUrl={customMapImage || mapUrl} 
                      onSave={setMapData} 
                      initialData={mapData} 
                    />
                    <div className="no-print absolute top-4 right-4 z-20">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => document.getElementById('custom-map-upload')?.click()}
                        title="Upload custom map image"
                      >
                        <FileDown className="w-4 h-4 mr-2" />
                        Upload Map
                      </Button>
                      <input
                        id="custom-map-upload"
                        type="file"
                        accept="image/*"
                        onChange={handleCustomMapUpload}
                        className="hidden"
                      />
                    </div>
                    {coordinates && !customMapImage && (
                      <div className="no-print absolute bottom-4 left-4 flex gap-3 z-20">
                        <div className="flex flex-col gap-2">
                          <Button size="icon" variant="secondary" onClick={() => panBy(0, -100)} title="Pan up">
                            <ArrowUp className="w-4 h-4" />
                          </Button>
                          <div className="flex gap-2">
                            <Button size="icon" variant="secondary" onClick={() => panBy(-100, 0)} title="Pan left">
                              <ArrowLeft className="w-4 h-4" />
                            </Button>
                            <Button size="icon" variant="secondary" onClick={() => panBy(100, 0)} title="Pan right">
                              <ArrowRight className="w-4 h-4" />
                            </Button>
                          </div>
                          <Button size="icon" variant="secondary" onClick={() => panBy(0, 100)} title="Pan down">
                            <ArrowDown className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button size="icon" variant="default" onClick={handleZoomIn} aria-label="Zoom in" title="Zoom in">
                            <Plus className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="secondary" onClick={handleZoomOut} aria-label="Zoom out" title="Zoom out">
                            <Minus className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="h-full w-full bg-muted flex items-center justify-center">
                    {coordinates ? (
                      <p className="text-muted-foreground">Loading satellite view...</p>
                    ) : (
                      <div className="text-center p-8">
                        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                          <FileDown className="w-8 h-8 text-primary" />
                        </div>
                        <p className="text-lg font-semibold text-foreground mb-2">No Map Image</p>
                        <p className="text-sm text-muted-foreground mb-4">Upload a property map or satellite image</p>
                        <Button
                          variant="default"
                          onClick={() => document.getElementById('custom-map-upload-empty')?.click()}
                        >
                          <FileDown className="w-4 h-4 mr-2" />
                          Upload Map Image
                        </Button>
                        <input
                          id="custom-map-upload-empty"
                          type="file"
                          accept="image/*"
                          onChange={handleCustomMapUpload}
                          className="hidden"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Property Images Section */}
            <div>
              <div className="no-print mb-4">
                <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="sm">
                  <FileDown className="w-4 h-4 mr-2" />
                  Upload Images (up to 5)
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePropertyImagesUpload}
                  className="hidden"
                />
              </div>
              {propertyImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {propertyImages.map((item, index) => (
                    <div key={index} className="space-y-1">
                      <div className="aspect-square rounded-lg overflow-hidden border-2 border-border bg-muted">
                        <img
                          src={item.image}
                          alt={`Property ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <Input
                        value={item.caption || ""}
                        onChange={(e) => updateImageCaption(index, e.target.value)}
                        placeholder="Caption"
                        className="no-print text-xs h-7"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground border-2 border-dashed border-border rounded-lg">
                  <p className="text-sm text-center px-4">No images uploaded yet.<br/>Click the button above to upload up to 5 images.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InitialPestReport;
