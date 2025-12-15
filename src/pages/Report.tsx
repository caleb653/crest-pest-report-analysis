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
  Plus,
  Minus,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  X,
  ChevronDown,
  Sparkles,
  Mail,
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

// Service configuration with auto-population data
const SERVICE_CONFIG: Record<string, {
  frequency: number;
  targetPests: string[];
  proposedServices: string;
}> = {
  'Monthly Services': {
    frequency: 30,
    targetPests: ['Ants', 'Roaches', 'Crickets', 'Earwigs', 'Spiders', 'Silverfish', 'Centipedes', 'Wasps'],
    proposedServices: 'Inspect interior and exterior for pest activity and entry points. Apply targeted treatments, de-webbing, and interior/exterior barriers. Maintain protection over time; complimentary retreat available.',
  },
  'Bi-Monthly Services': {
    frequency: 60,
    targetPests: ['Ants', 'Roaches', 'Crickets', 'Earwigs', 'Spiders', 'Silverfish', 'Centipedes', 'Wasps'],
    proposedServices: 'Inspect interior and exterior for pest activity and entry points. Apply targeted treatments, de-webbing, and interior/exterior barriers. Maintain protection over time; complimentary retreat available.',
  },
  'Quarterly Services': {
    frequency: 90,
    targetPests: ['Ants', 'Roaches', 'Crickets', 'Earwigs', 'Spiders', 'Silverfish', 'Centipedes', 'Wasps'],
    proposedServices: 'Inspect interior and exterior for pest activity and entry points. Apply targeted treatments, de-webbing, and interior/exterior barriers. Maintain protection over time; complimentary retreat available.',
  },
  'Commercial General Pest': {
    frequency: 30,
    targetPests: ['Ants', 'Roaches', 'Spiders', 'Rodents'],
    proposedServices: 'Inspect interior and exterior areas (common areas, restrooms, break rooms, lounges) for pest activity. Treat inspected areas, place and monitor insect monitors, and apply targeted interior and exterior treatments as needed. Provide ongoing service with regular inspections, monitoring, treatments, and clear communication with management.',
  },
  'Rodent Exclusion': {
    frequency: 0,
    targetPests: ['Rodents'],
    proposedServices: 'Identify and clearly communicate all rodent entry points discovered during the inspection. Seal gaps, vents, utility penetrations, and other vulnerabilities using industry-grade materials such as steel mesh and weatherproof sealants. Customize every exclusion to the structure of the home to prevent future rodent entry.',
  },
  'Rodent Trapping': {
    frequency: 30,
    targetPests: ['Rodents'],
    proposedServices: 'Determine the most effective trapping method based on the specific rodent activity identified. Strategically place traps in areas of highest activity to quickly reduce rodent populations. Monitor and adjust trap placement as needed to ensure effective control.',
  },
  'Rodent Trapping and Exclusion': {
    frequency: 30,
    targetPests: ['Rodents'],
    proposedServices: 'Eliminate active rodent populations through targeted trapping inside the home and on the property. Reinforce the home\'s protective barriers by sealing entry points and structural weaknesses. Provide long-term protection by preventing re-entry while reducing current rodent activity.',
  },
};

const SERVICE_TYPE_OPTIONS = Object.keys(SERVICE_CONFIG);

const FREQUENCY_OPTIONS = [
  { label: 'One-time', days: 0 },
  { label: '1 month', days: 30 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
];

interface AnalysisData {
  findings: string[];
  recommendations: string[];
  nextSteps: string[];
}

const Report = () => {
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
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [editableTech, setEditableTech] = useState(technicianName || "");
  const [editableCustomer, setEditableCustomer] = useState(customerName || "");
  const [editableServiceDate, setEditableServiceDate] = useState(serviceDate || new Date().toISOString().split("T")[0]);
  const [editableLicenseNumber, setEditableLicenseNumber] = useState(licenseNumber || "");

  // Auto-set license when technician changes
  const handleTechnicianChange = (techName: string) => {
    setEditableTech(techName);
    const tech = TECHNICIANS.find(t => t.name === techName);
    if (tech) {
      setEditableLicenseNumber(tech.license);
    }
  };

  // Auto-populate when service type changes
  const handleServiceTypeChange = (newServiceType: string) => {
    setServiceType(newServiceType);
    const config = SERVICE_CONFIG[newServiceType];
    if (config) {
      setFrequency(config.frequency);
      setEditableTargetPests(config.targetPests);
      setEditableFindings([config.proposedServices]);
    }
  };

  const [editableTargetPests, setEditableTargetPests] = useState<string[]>(targetPests?.filter((p: string) => p) || []);
  const [editableProductsUsed, setEditableProductsUsed] = useState<string[]>(
    productsUsed?.filter((p: string) => p) || [],
  );
  const [editableEquipment, setEditableEquipment] = useState<string[]>([]);
  const [editableFindings, setEditableFindings] = useState<string[]>([]);
  const [serviceType, setServiceType] = useState<string>("");
  const [initialPrice, setInitialPrice] = useState<string>("");
  const [recurringPrice, setRecurringPrice] = useState<string>("");
  const [frequency, setFrequency] = useState<number>(30);
  const [equipmentDropdownOpen, setEquipmentDropdownOpen] = useState(false);
  const equipmentDropdownRef = useRef<HTMLDivElement>(null);
  const [mapData, setMapData] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(20);
  const [staticMapUrl, setStaticMapUrl] = useState<string | null>(null);
  const [pestsDropdownOpen, setPestsDropdownOpen] = useState(false);
  const [productsDropdownOpen, setProductsDropdownOpen] = useState(false);
  const pestsDropdownRef = useRef<HTMLDivElement>(null);
  const productsDropdownRef = useRef<HTMLDivElement>(null);
  const [customMapImage, setCustomMapImage] = useState<string | null>(null);
  const latestMapDataRef = useRef<string | null>(null);
  const [propertyImages, setPropertyImages] = useState<Array<{ image: string; caption?: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExpandingFindings, setIsExpandingFindings] = useState(false);
  const [isExpandingExpect, setIsExpandingExpect] = useState(false);
  const [customerEmail, setCustomerEmail] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [customerSignature, setCustomerSignature] = useState<string | null>(null);

  const expandWithAI = async (text: string, type: 'findings' | 'expect', setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    if (type === 'findings') setIsExpandingFindings(true);
    else setIsExpandingExpect(true);

    try {
      const { data, error } = await supabase.functions.invoke('expand-findings', {
        body: { text, type }
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
      setIsExpandingExpect(false);
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
    if (analysis) {
      setEditableFindings(analysis.findings || []);
    }
  }, [analysis]);

  useEffect(() => {
    latestMapDataRef.current = mapData;
  }, [mapData]);

  // Close dropdowns when clicking outside
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

  // Fetch static 2D satellite map whenever coordinates or zoom change
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
          width: 1100,
          height: 700,
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

      console.log("Loading report map_data:", {
        hasMapData: !!data.map_data,
        mapDataType: typeof data.map_data,
        mapDataPreview: data.map_data ? JSON.stringify(data.map_data).substring(0, 150) : "null",
      });

      setMapData(data.map_data ? JSON.stringify(data.map_data) : null);

      // Load custom map and property images
      if (data.custom_map_url) {
        setCustomMapImage(data.custom_map_url);
      }
      
      if (data.property_images) {
        setPropertyImages(data.property_images as Array<{ image: string; caption?: string }>);
      }

      // Extract coordinates from map_url if available, otherwise geocode
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

      // Extract customer name from images
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
        body: { images: imageDataUrls.slice(0, 3) }, // Only use first 3 images
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

      setAnalysis(data);
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
        headers: {
          "User-Agent": "PestProReports/1.0",
        },
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
      console.log("Submitting report with map data:", {
        hasRawMap: !!rawMap,
        rawMapLength: rawMap?.length,
        rawMapPreview: rawMap ? rawMap.substring(0, 150) : "null",
      });

      let mapPayload: any = null;
      if (rawMap) {
        try {
          mapPayload = JSON.parse(rawMap);
          console.log("Parsed map payload:", {
            hasObjects: !!mapPayload.objects,
            objectCount: mapPayload.objects?.objects?.length,
          });
        } catch (e) {
          console.error("Failed to parse map data:", e);
          mapPayload = rawMap;
        }
      }

      const reportData = {
        technician_name: editableTech,
        customer_name: editableCustomer,
        address: extractedAddress || address,
        notes: notes,
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
          title: "Pest Control Report",
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
          reportUrl: reportId ? `${window.location.origin}/report/${reportId}` : "",
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

  const displayAddress = extractedAddress || address || "Not provided";

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
      
      const { error: uploadError, data } = await supabase.storage
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
        <div className="print-header bg-card shadow-md border-b border-border px-6 py-3">
          <div className="max-w-[1800px] mx-auto">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-6 flex-1">
                <div className="flex flex-col items-center">
                  <img src={crestLogo} alt="Crest Pest Control" className="h-20 w-auto" />
                  <span className="text-xs text-muted-foreground mt-1">PR #9859</span>
                </div>
                <div className="flex-1 ml-4">
                  <h1 className="text-xl font-bold text-foreground mb-2">
                    Pest Inspection Report
                  </h1>

                  <div className="flex gap-8">
                    <div className="flex-[2]">
                      <p className="font-semibold text-foreground text-xs mb-1">Customer Information:</p>
                      <div className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-20">Name:</span>
                          <Input
                            value={editableCustomer}
                            onChange={(e) => setEditableCustomer(e.target.value)}
                            placeholder="Customer name"
                            className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 text-xs flex-1 focus-visible:ring-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-20">Address:</span>
                          <span className="text-foreground">{displayAddress}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-20">Service Date:</span>
                          <Input
                            type="date"
                            value={editableServiceDate}
                            onChange={(e) => setEditableServiceDate(e.target.value)}
                            className="bg-transparent border-b border-border text-foreground px-1 h-5 text-xs w-32 focus-visible:ring-0"
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
                            <SelectTrigger className="bg-transparent border-b border-border text-foreground h-6 text-xs flex-1 focus:ring-0 [&>svg]:h-3 [&>svg]:w-3">
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
                  className="w-48 h-8 text-xs"
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

      {/* Page 1 - Contract/Form Content */}
      <div className={isMobile ? "flex flex-col" : "p-4 max-w-[1800px] mx-auto"}>
        {/* Two Column Layout for Desktop */}
        <div className={isMobile ? "flex-1 overflow-y-auto pb-32" : "grid grid-cols-[1fr_2fr] gap-4"}>
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

            {/* Service Type, Pricing & Frequency - Full Width at Top */}
            <Card className="print-section p-2 col-span-2">
              <div className="grid grid-cols-[1.5fr_1.5fr_1fr_2fr] gap-4 items-start">
                <div>
                  <h2 className="text-xs font-bold mb-1">Service Type</h2>
                  <Select value={serviceType} onValueChange={handleServiceTypeChange}>
                    <SelectTrigger className="h-7 text-xs">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {SERVICE_TYPE_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option} className="text-xs">
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-bold mb-1 block">Initial $</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={initialPrice}
                        onChange={(e) => setInitialPrice(e.target.value)}
                        placeholder="0.00"
                        className="h-7 text-xs pl-5"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-bold mb-1 block">Recurring $</label>
                    <div className="relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                      <Input
                        type="number"
                        value={recurringPrice}
                        onChange={(e) => setRecurringPrice(e.target.value)}
                        placeholder="0.00"
                        className="h-7 text-xs pl-5"
                      />
                    </div>
                  </div>
                </div>
                <div>
                  <h2 className="text-xs font-bold mb-1">Frequency</h2>
                  <Select 
                    value={frequency.toString()} 
                    onValueChange={(val) => setFrequency(parseInt(val))}
                  >
                    <SelectTrigger className="h-7 text-xs w-24">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      {FREQUENCY_OPTIONS.map((option) => (
                        <SelectItem key={option.days} value={option.days.toString()} className="text-xs">
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <h2 className="text-xs font-bold mb-1">Schedule</h2>
                  {frequency > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {Array.from({ length: 12 }, (_, i) => {
                        const serviceDate = new Date();
                        serviceDate.setDate(serviceDate.getDate() + (i * frequency));
                        const isFirst = i === 0;
                        return (
                          <span
                            key={i}
                            className={`px-2 py-1 rounded text-xs ${
                              isFirst ? 'bg-primary text-primary-foreground font-medium' : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {serviceDate.toLocaleDateString('en-US', { month: 'short' })}
                          </span>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">One-time only</p>
                  )}
                </div>
              </div>
            </Card>

            {/* Target Pests - Left Column */}
            <Card className="print-section p-0 overflow-visible">
              <div className="relative" ref={pestsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setPestsDropdownOpen(!pestsDropdownOpen)}
                  className="print-section-header text-sm font-bold w-full flex items-center justify-between cursor-pointer py-2 px-3"
                >
                  <span>Target Pest(s)</span>
                  <ChevronDown className={`w-4 h-4 text-primary-foreground transition-transform no-print ${pestsDropdownOpen ? 'rotate-180' : ''}`} />
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
                            prev.includes(pest) 
                              ? prev.filter(p => p !== pest)
                              : [...prev, pest]
                          );
                        }}
                        className={`w-full px-3 py-1.5 text-left text-xs hover:bg-muted flex items-center justify-between ${
                          editableTargetPests.includes(pest) ? 'bg-primary/10 text-primary font-medium' : ''
                        }`}
                      >
                        {pest}
                        {editableTargetPests.includes(pest) && (
                          <span className="text-primary">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="p-2 bg-background space-y-2">
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
                  className="h-7 text-xs no-print"
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

            {/* Proposed Services - Right Column, Takes More Space */}
            <Card className="print-section p-2">
              <h2 className="text-sm font-bold mb-2">Proposed Services</h2>
              {isAnalyzing ? (
                <div className="text-center py-2">
                  <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-1" />
                  <p className="text-xs text-muted-foreground">Analyzing...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={
                      (editableFindings[0] || "")
                        .split(/[.]\s*/)
                        .filter(line => line.trim())
                        .map(line => `• ${line.trim().replace(/\.$/, '')}`)
                        .join('\n') || ""
                    }
                    onChange={(e) => {
                      // Convert bullet lines back to period-separated sentences for storage
                      const lines = e.target.value
                        .split('\n')
                        .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
                        .filter(line => line)
                        .join('. ');
                      updateItem(0, lines ? lines + '.' : '', setEditableFindings);
                    }}
                    placeholder="• Enter proposed services (one per line)..."
                    className="text-xs resize-y min-h-[100px] leading-relaxed"
                    rows={4}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => expandWithAI(editableFindings[0] || '', 'findings', setEditableFindings)}
                    disabled={isExpandingFindings}
                    className="no-print h-7 text-xs"
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
            </Card>

            {/* Products Used - Left Side */}
            <Card className="print-section p-2">
              <h2 className="text-xs font-bold mb-1">Products Used</h2>
              <div className="text-[8px] leading-snug space-y-0">
                <span className="font-medium">Alpine WSG</span> <span className="text-muted-foreground">(Dinotefuran)</span> · <span className="font-medium">Bifen I/T</span> <span className="text-muted-foreground">(Bifenthrin)</span> · <span className="font-medium">Essentria IC Pro</span> <span className="text-muted-foreground">(Geraniol, Clove Oil, Cornmint Oil)</span> · <span className="font-medium">Temprid FX</span> <span className="text-muted-foreground">(Imidacloprid, Cyfluthrin)</span> · <span className="font-medium">Termidor SC</span> <span className="text-muted-foreground">(Fipronil)</span> · <span className="font-medium">Phantom</span> <span className="text-muted-foreground">(Chlorfenapyr)</span> · <span className="font-medium">ExciteR</span> <span className="text-muted-foreground">(Pyrethrins, Piperonyl Butoxide)</span> · <span className="font-medium">Gentrol IGR Concentrate</span> <span className="text-muted-foreground">((S)-Hydroprene)</span> · <span className="font-medium">Nyguard IGR Concentrate</span> <span className="text-muted-foreground">(Pyridine)</span> · <span className="font-medium">PT Wasp Freeze</span> <span className="text-muted-foreground">(Prallethrin)</span> · <span className="font-medium">PT Alpine Flea & Bed Bug</span> <span className="text-muted-foreground">(Dinotefuran, Pyriproxyfen, Prallethrin)</span> · <span className="font-medium">PT Alpine Fly Bait</span> · <span className="font-medium">Gentrol Aerosol</span> <span className="text-muted-foreground">((S)-Hydroprene)</span> · <span className="font-medium">Bedlam</span> <span className="text-muted-foreground">(Cyclopropanecarboxylate, Dicarboximide)</span> · <span className="font-medium">Invade Hot Spot +</span> · <span className="font-medium">Niban</span> <span className="text-muted-foreground">(Orthoboric Acid)</span> · <span className="font-medium">Bifen LP</span> <span className="text-muted-foreground">(Bifenthrin)</span> · <span className="font-medium">Advion Ant Gel Bait</span> <span className="text-muted-foreground">(Indoxacarb)</span> · <span className="font-medium">Maxforce FC Ant Gel</span> <span className="text-muted-foreground">(Fipronil)</span> · <span className="font-medium">Advion Cockroach Gel Bait</span> <span className="text-muted-foreground">(Indoxacarb)</span> · <span className="font-medium">Contrac California</span> <span className="text-muted-foreground">(Bromethalin)</span> · <span className="font-medium">Delta Dust (Bayer)</span> <span className="text-muted-foreground">(Deltamethrin)</span> · <span className="font-medium">In2Care Mix</span> <span className="text-muted-foreground">(Pyriproxyfen, Beauveria bassiana Strain GHA)</span>
              </div>
            </Card>

            {/* Pesticide Notice - Right Side */}
            <Card className="print-section p-2">
              <h2 className="text-xs font-bold mb-1">Pesticide Notice</h2>
              <div className="text-[10px] leading-relaxed text-foreground space-y-1">
                <p><strong>State law requires:</strong> CAUTION--PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered by the Structural Pest Control Board, and apply pesticides approved by the CA Dept. of Pesticide Regulation and US EPA.</p>
                <p>If within 24 hours following application you experience flu-like symptoms, contact your physician or poison control center (800-222-1222) and your pest control company immediately.</p>
                <p className="font-medium">Contact: Pest Control Company: 949-424-5000 | County Health Dept: 800-564-8448 | County Ag Commissioner: 714-955-0100 | Structural Pest Control Board: 800-737-8188</p>
              </div>
            </Card>

            {/* Signature Section - Full Width */}
            <Card className="print-section p-2 col-span-2">
              <div className="flex gap-8">
                <div className="flex-1">
                  <h2 className="text-xs font-bold mb-1">Customer Acknowledgment</h2>
                  <SignatureCanvas 
                    onSave={setCustomerSignature} 
                    initialData={customerSignature}
                    label="Customer Signature"
                  />
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    <span className="font-medium text-foreground">Date:</span> {new Date().toLocaleDateString()}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>

      {/* Page 2 - Map & Property Images */}
      <div className="print-page-break bg-background">
        <div className={isMobile ? "p-4" : "p-6 max-w-[1800px] mx-auto"}>
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-border">
            <div className="flex items-center gap-4">
              <img src={crestLogo} alt="Crest Pest Control" className="h-16" />
              <h1 className="text-2xl font-bold text-foreground">Property Map & Images</h1>
            </div>
          </div>

          {/* Map Section */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-foreground mb-4">Property Map</h2>
            <div className="h-[500px] relative rounded-lg overflow-hidden border-2 border-border">
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

                  {/* Upload custom map button */}
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

                  {/* Pan controls - only show when using coordinates-based map */}
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

                      {/* Zoom controls */}
                      <div className="flex flex-col gap-2">
                        <Button size="icon" variant="default" onClick={handleZoomIn} aria-label="Zoom in" title="Zoom in">
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="secondary"
                          onClick={handleZoomOut}
                          aria-label="Zoom out"
                          title="Zoom out"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center bg-muted">
                  {isProcessing ? (
                    <div className="text-center">
                      <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                      <p className="text-foreground font-semibold">Processing location...</p>
                    </div>
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
            <h2 className="text-xl font-bold text-foreground mb-4">Property Images</h2>
            
            {/* Upload Section */}
            <div className="no-print mb-4">
              <Button onClick={() => fileInputRef.current?.click()} variant="outline" size="lg">
                <FileDown className="w-5 h-5 mr-2" />
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

            {/* Property Images Grid */}
            {propertyImages.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {propertyImages.map((item, index) => (
                  <div key={index} className="space-y-2">
                    <div className="aspect-square rounded-lg overflow-hidden border-2 border-border bg-muted">
                      <img
                        src={item.image}
                        alt={`Property ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {item.caption && (
                      <div className="p-2 bg-card rounded border border-border">
                        <p className="text-xs text-foreground">{item.caption}</p>
                      </div>
                    )}
                    <Input
                      value={item.caption || ""}
                      onChange={(e) => updateImageCaption(index, e.target.value)}
                      placeholder="Add caption (optional)"
                      className="no-print text-xs h-8"
                    />
                  </div>
                ))}
              </div>
            )}

            {propertyImages.length === 0 && (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-border rounded-lg">
                <p>No images uploaded yet. Click the button above to upload up to 5 images.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Report;
