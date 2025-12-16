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
  Check,
  ChevronsUpDown,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

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
  defaultRecurring?: number;
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
    frequency: 7,
    targetPests: ['Rodents'],
    proposedServices: 'Determine the most effective trapping method based on the specific rodent activity identified. Strategically place traps in areas of highest activity to quickly reduce rodent populations. Monitor and adjust trap placement as needed to ensure effective control.',
    defaultRecurring: 0,
  },
  'Rodent Trapping and Exclusion': {
    frequency: 7,
    targetPests: ['Rodents'],
    proposedServices: 'Eliminate active rodent populations through targeted trapping inside the home and on the property. Reinforce the home\'s protective barriers by sealing entry points and structural weaknesses. Provide long-term protection by preventing re-entry while reducing current rodent activity.',
    defaultRecurring: 0,
  },
  'Attic': {
    frequency: 0,
    targetPests: ['Rodents'],
    proposedServices: 'Inspect attic space for signs of pest activity, entry points, and damage. Treat attic areas as needed and provide recommendations for exclusion and prevention.',
  },
};

const SERVICE_TYPE_OPTIONS = Object.keys(SERVICE_CONFIG);

const FREQUENCY_OPTIONS = [
  { label: 'One-Time', days: 0 },
  { label: '30 days', days: 30 },
  { label: '60 days', days: 60 },
  { label: '90 days', days: 90 },
  { label: 'Weekly Visits', days: 7 },
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
    reportType,
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
  const [editableAddress, setEditableAddress] = useState(address || "");
  
  // Set title based on report type
  const getDefaultTitle = (type: string | undefined) => {
    switch (type) {
      case 'initial-pest':
        return 'Initial Pest Report';
      case 'sales':
        return 'Sales Report';
      default:
        return 'Pest Control Proposal';
    }
  };
  const [editableTitle, setEditableTitle] = useState(getDefaultTitle(reportType));

  // Update title when reportType changes (navigation between report types)
  useEffect(() => {
    setEditableTitle(getDefaultTitle(reportType));
  }, [reportType]);

  // Auto-set license when technician changes
  const handleTechnicianChange = (techName: string) => {
    setEditableTech(techName);
    const tech = TECHNICIANS.find(t => t.name === techName);
    if (tech) {
      setEditableLicenseNumber(tech.license);
    }
  };


  const [editableTargetPests, setEditableTargetPests] = useState<string[]>(targetPests?.filter((p: string) => p) || []);
  const [editableProductsUsed, setEditableProductsUsed] = useState<string[]>(
    productsUsed?.filter((p: string) => p) || [],
  );
  const [editableEquipment, setEditableEquipment] = useState<string[]>([]);
  const [editableFindings, setEditableFindings] = useState<string[]>([]);
  // Multiple services support
  interface ServiceItem {
    serviceType: string;
    initialPrice: string;
    recurringPrice: string;
    frequency: number;
  }
  const [services, setServices] = useState<ServiceItem[]>([
    { serviceType: '', initialPrice: '', recurringPrice: '', frequency: 30 }
  ]);

  const handleServiceChange = (index: number, field: keyof ServiceItem, value: string | number) => {
    setServices(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      
      // Auto-populate if service type changed
      if (field === 'serviceType' && typeof value === 'string') {
        const config = SERVICE_CONFIG[value];
        if (config) {
          updated[index].frequency = config.frequency;
          // Set default recurring price if specified (e.g., $0 for rodent trapping)
          if (config.defaultRecurring !== undefined) {
            updated[index].recurringPrice = String(config.defaultRecurring);
          }
          // Only update target pests and findings for the first service
          if (index === 0) {
            setEditableTargetPests(config.targetPests);
            setEditableFindings([config.proposedServices]);
          }
        }
      }
      return updated;
    });
  };

  const addService = () => {
    if (services.length < 3) {
      setServices(prev => [...prev, { serviceType: '', initialPrice: '', recurringPrice: '', frequency: 30 }]);
    }
  };

  const removeService = (index: number) => {
    if (services.length > 1) {
      setServices(prev => prev.filter((_, i) => i !== index));
    }
  };
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
        address: editableAddress || extractedAddress || address,
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

  const displayAddress = editableAddress || extractedAddress || address || "Not provided";

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

  const [draggedImageIndex, setDraggedImageIndex] = useState<number | null>(null);

  const handleImageDragStart = (index: number) => {
    setDraggedImageIndex(index);
  };

  const handleImageDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedImageIndex === null || draggedImageIndex === index) return;
    
    setPropertyImages(prev => {
      const updated = [...prev];
      const [dragged] = updated.splice(draggedImageIndex, 1);
      updated.splice(index, 0, dragged);
      return updated;
    });
    setDraggedImageIndex(index);
  };

  const handleImageDragEnd = () => {
    setDraggedImageIndex(null);
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
            {/* Action buttons row for iPad - shown at top on medium screens */}
            <div className="hidden md:flex lg:hidden items-center gap-2 no-print mb-3 flex-wrap">
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

            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-6 flex-1">
                <div className="flex flex-col items-center shrink-0">
                  <img src={crestLogo} alt="Crest Pest Control" className="h-20 w-auto object-contain" />
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
                      <p className="font-semibold text-foreground text-xs mb-0.5">Customer Information:</p>
                      <div className="space-y-0.5 text-xs">
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

              {/* Action buttons - only shown on large screens */}
              <div className="hidden lg:flex items-center gap-2 no-print shrink-0">
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

      {/* Page 1 - Contract/Form Content */}
      <div className={isMobile ? "flex flex-col" : "p-3 max-w-[1800px] mx-auto"}>
        {/* Two Column Layout for Desktop */}
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

            {/* Services - Full Width at Top */}
            <Card className="print-section p-2 col-span-2">
              <div className="space-y-1">
                {/* Header Row */}
                <div className="grid grid-cols-[minmax(150px,1fr)_80px_80px_180px_minmax(200px,2fr)_24px] print:grid-cols-[minmax(140px,1fr)_70px_70px_160px_minmax(200px,2fr)_24px] gap-2 items-center text-sm font-bold border-b border-border pb-1">
                  <span>Service Type</span>
                  <span className="text-center">Initial</span>
                  <span className="text-center">Recurring</span>
                  <span className="text-center">Frequency</span>
                  <span className="text-center">Schedule</span>
                  <span></span>
                </div>
                
                {/* Service Rows */}
                {services.map((service, index) => (
                  <div key={index} className="grid grid-cols-[minmax(150px,1fr)_80px_80px_180px_minmax(200px,2fr)_24px] print:grid-cols-[minmax(140px,1fr)_70px_70px_160px_minmax(200px,2fr)_24px] gap-2 items-center">
                    <div className="flex items-center gap-2 bg-white/80 rounded px-1">
                      <Select 
                        value={service.serviceType} 
                        onValueChange={(val) => handleServiceChange(index, 'serviceType', val)}
                      >
                        <SelectTrigger className="h-6 text-sm w-full no-print bg-transparent border-0 shadow-none">
                          <SelectValue placeholder="Select service..." />
                        </SelectTrigger>
                        <SelectContent className="bg-white z-50">
                          {SERVICE_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option} value={option} className="text-sm">
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Print-only text display */}
                      <span className="hidden print:block text-sm font-medium">{service.serviceType || '-'}</span>
                    </div>
                    <div className="relative bg-white/80 rounded">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={service.initialPrice}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          handleServiceChange(index, 'initialPrice', val);
                        }}
                        placeholder="0"
                        className="h-6 text-sm pl-6 text-right pr-2 bg-transparent border-0 shadow-none"
                      />
                    </div>
                    <div className="relative bg-white/80 rounded">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">$</span>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={service.recurringPrice}
                        onChange={(e) => {
                          const val = e.target.value.replace(/[^0-9]/g, '');
                          handleServiceChange(index, 'recurringPrice', val);
                        }}
                        placeholder="0"
                        className="h-6 text-sm pl-6 text-right pr-2 bg-transparent border-0 shadow-none"
                      />
                    </div>
                    <div className="bg-white/80 rounded px-1">
                      <Select 
                        value={service.frequency.toString()} 
                        onValueChange={(val) => handleServiceChange(index, 'frequency', parseInt(val))}
                      >
                        <SelectTrigger className="h-6 text-sm w-full no-print bg-transparent border-0 shadow-none">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent className="bg-white z-50">
                          {FREQUENCY_OPTIONS.map((option) => (
                            <SelectItem key={option.days} value={option.days.toString()} className="text-sm">
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {/* Print-only text display */}
                      <span className="hidden print:block text-sm text-center">
                        {FREQUENCY_OPTIONS.find(o => o.days === service.frequency)?.label || '-'}
                      </span>
                    </div>
                    <div className="min-w-0 bg-white/80 rounded px-1.5 py-0.5">
                      {service.frequency > 0 ? (
                        <div className="flex flex-wrap gap-0.5">
                          {(() => {
                            const isWeekly = service.frequency === 7;
                            const today = new Date();
                            const currentMonth = today.getMonth();
                            const currentYear = today.getFullYear();
                            const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
                            const daysRemaining = daysInMonth - today.getDate();
                            const weeksRemaining = Math.ceil(daysRemaining / 7) + 1;
                            const count = isWeekly ? weeksRemaining : 12;
                            
                            return Array.from({ length: count }, (_, i) => {
                              const scheduleDate = new Date();
                              scheduleDate.setDate(scheduleDate.getDate() + (i * service.frequency));
                              const isFirst = i === 0;
                              return (
                                <span
                                  key={i}
                                  className={`px-1.5 py-0.5 rounded text-xs whitespace-nowrap ${
                                    isFirst ? 'bg-secondary text-white font-medium' : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {isWeekly 
                                    ? scheduleDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                    : scheduleDate.toLocaleDateString('en-US', { month: 'short' })
                                  }
                                </span>
                              );
                            });
                          })()}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">One-time service</span>
                      )}
                    </div>
                    <div>
                      {services.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 no-print"
                          onClick={() => removeService(index)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                
                {/* Totals Row */}
                <div className="grid grid-cols-[minmax(150px,1fr)_80px_80px_180px_minmax(200px,2fr)_24px] print:grid-cols-[minmax(140px,1fr)_70px_70px_160px_minmax(200px,2fr)_24px] gap-2 items-center pt-1 border-t border-border">
                  <div className="text-sm font-bold text-right">Total:</div>
                  <div className="text-sm font-bold text-right bg-white/80 rounded py-0.5 px-1 flex items-center">
                    <span className="text-muted-foreground mr-auto">$</span>
                    <span>{Math.round(services.reduce((sum, s) => sum + (parseFloat(s.initialPrice) || 0), 0))}</span>
                  </div>
                  <div className="text-sm font-bold text-right bg-white/80 rounded py-0.5 px-1 flex items-center">
                    <span className="text-muted-foreground mr-auto">$</span>
                    <span>{Math.round(services.reduce((sum, s) => sum + (parseFloat(s.recurringPrice) || 0), 0))}</span>
                  </div>
                  <div></div>
                  <div></div>
                  <div></div>
                </div>

                {services.length < 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addService}
                    className="no-print h-7 text-xs mt-2"
                  >
                    <Plus className="w-3 h-3 mr-1" />
                    Add Service
                  </Button>
                )}
              </div>
            </Card>

            {/* Left: Target Pests + Products, Right: Proposed Services */}
            <div className="col-span-2 grid grid-cols-[2fr_3fr] gap-1.5">
              {/* Left Column - Target Pests and Products stacked */}
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

                {/* Products */}
                <Card className="print-section p-0 overflow-hidden rounded-lg">
                  <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                    <span className="text-[10px] font-bold">Products</span>
                  </div>
                  <div className="p-2.5">
                  <div className="text-[7px] leading-tight text-foreground columns-2 gap-2">
                    <p>Alpine WSG (Dinotefuran)</p>
                    <p>Bifen I/T (Bifenthrin)</p>
                    <p>Essentria IC Pro (Geraniol, Clove Oil, Cornmint Oil)</p>
                    <p>Temprid FX (Imidacloprid, Cyfluthrin)</p>
                    <p>Termidor SC (Fipronil)</p>
                    <p>Phantom (Chlorfenapyr)</p>
                    <p>ExciteR (Pyrethrins, Piperonyl Butoxide)</p>
                    <p>Gentrol IGR Concentrate ((S)-Hydroprene)</p>
                    <p>Nyguard IGR Concentrate (Pyridine)</p>
                    <p>PT Wasp Freeze (Prallethrin)</p>
                    <p>PT Alpine Flea & Bed Bug (Dinotefuran, Pyriproxyfen, Prallethrin)</p>
                    <p>PT Alpine Fly Bait</p>
                    <p>Gentrol Aerosol ((S)-Hydroprene)</p>
                    <p>Bedlam (Cyclopropanecarboxylate, Dicarboximide)</p>
                    <p>Invade Hot Spot +</p>
                    <p>Niban (Orthoboric Acid)</p>
                    <p>Bifen LP (Bifenthrin)</p>
                    <p>Advion Ant Gel Bait (Indoxacarb)</p>
                    <p>Maxforce FC Ant Gel (Fipronil)</p>
                    <p>Advion Cockroach Gel Bait (Indoxacarb)</p>
                    <p>Contrac California (Bromethalin)</p>
                    <p>Delta Dust (Bayer) (Deltamethrin)</p>
                    <p>In2Care Mix (Pyriproxyfen, Beauveria bassiana Strain GHA)</p>
                  </div>
                  </div>
                </Card>
              </div>

              {/* Right Column - Proposed Services */}
              <Card className="print-section p-0 flex flex-col overflow-hidden rounded-lg">
                <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                  <span className="text-xs font-bold">Proposed Services</span>
                </div>
                <div className="p-3 flex-1 flex flex-col">
                {isAnalyzing ? (
                  <div className="text-center py-2">
                    <Loader2 className="w-5 h-5 animate-spin text-primary mx-auto mb-1" />
                    <p className="text-xs text-muted-foreground">Analyzing...</p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col space-y-1">
                    <div className="flex gap-1 mb-1 no-print">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.execCommand('bold')}
                        className="h-6 text-xs px-2 font-bold"
                      >
                        B
                      </Button>
                    </div>
                    <div
                      contentEditable
                      suppressContentEditableWarning
                      className="text-xs flex-1 min-h-[100px] leading-relaxed border border-input rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-ring overflow-auto bg-background"
                      dangerouslySetInnerHTML={{
                        __html: (editableFindings[0] || "")
                          .split(/[.]\s*/)
                          .filter(line => line.trim())
                          .map(line => `• ${line.trim().replace(/\.$/, '')}`)
                          .join('<br/>') || ""
                      }}
                      onBlur={(e) => {
                        // Just grab the text as-is without forcing format
                        const html = e.currentTarget.innerHTML;
                        // Convert to plain text, preserving line breaks
                        const text = html
                          .replace(/<br\s*\/?>/gi, '\n')
                          .replace(/<[^>]+>/g, '')
                          .split('\n')
                          .map(line => line.replace(/^[•\-\*]\s*/, '').trim())
                          .filter(line => line)
                          .join('. ');
                        updateItem(0, text ? text + '.' : '', setEditableFindings);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => expandWithAI(editableFindings[0] || '', 'findings', setEditableFindings)}
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
            </div>

            {/* Bottom Row: Signature + Pesticide Notice - Same column widths as above */}
            <div className="col-span-2 grid grid-cols-[2fr_3fr] gap-1.5">
              {/* Signature Section - Left (same width as Target Pests + Products) */}
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

              {/* Pesticide Notice - Right (same width as Proposed Services) */}
              <Card className="print-section p-0 overflow-hidden rounded-lg">
                <div className="print-section-header py-1.5 px-2.5 rounded-t-lg">
                  <span className="text-[10px] font-bold">Pesticide Notice</span>
                </div>
                <div className="p-2.5">
                  <div className="text-[9px] leading-tight text-foreground space-y-0">
                    <p>State law requires that you be given the following information: CAUTION--PESTICIDES ARE TOXIC CHEMICALS. Structural Pest Control Companies are registered and regulated by the Structural Pest Control Board, and apply pesticides which are registered and approved for use by the California Department of Pesticide Regulation and the United States Environmental Protection Agency. Registration is granted when the state finds that, based on existing scientific evidence, there are no appreciable risks if proper use conditions are followed or that the risks are outweighed by the benefits. The degree of risk depends upon the degree of exposure, so exposure should be minimized.</p>
                    <p>If within 24 hours following application you experience symptoms similar to common seasonal illness comparable to the flu, contact your physician or poison control center (800-222-1222) and your pest control company immediately.</p>
                    <p className="font-medium">For further information, contact any of the following: Your Pest Control Company (949-424-5000); for Health Questions--the County Health Department (800-564-8448); for Application Information--the County Agricultural Commissioner (714-955-0100) and for Regulatory Information--the Structural Pest Control Board (800-737-8188, 2005 Evergreen Street, Ste. 1500, Sacramento, CA 95815).</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>

      {/* Page 2 - Map & Property Images */}
      <div className="print-page-break bg-background print:flex print:flex-col print:justify-center print:min-h-[100vh]">
        <div className={isMobile ? "p-4" : "p-4 print:p-6 print:pt-8 max-w-[1800px] mx-auto"}>
          {/* Page Header - minimal for print */}
          <div className="flex items-center justify-between mb-4 print:mb-6 pb-2 print:pb-3 border-b-2 border-border">
            <div className="flex items-center gap-3 print:gap-2">
              <img src={crestLogo} alt="Crest Pest Control" className="h-12 print:h-8" />
              <h1 className="text-xl print:text-lg font-bold text-foreground">Property Map & Images</h1>
            </div>
          </div>

          {/* Map and Property Images Side by Side */}
          <div className="flex flex-col lg:grid lg:grid-cols-[40%_60%] gap-4 print:grid print:grid-cols-[48%_52%] print:gap-8 print:px-6 print:items-center print:justify-center">
            {/* Map Section - FIXED size on all devices for perfect consistency */}
            <div className="flex flex-col min-h-0 print:origin-top-left print:scale-[1.2]">
              <div className="w-[400px] h-[533px] mx-auto relative rounded-lg overflow-hidden border-2 border-border print:max-h-none">
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

            {/* Property Images Section - appears to right on print */}
            <div>
              
              {/* Upload Section */}
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

              {/* Property Images Grid */}
              {propertyImages.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 print:gap-1 print:grid-cols-2">
                  {propertyImages.map((item, index) => (
                    <div 
                      key={index} 
                      className={`space-y-1 print:space-y-0 cursor-grab active:cursor-grabbing ${draggedImageIndex === index ? 'opacity-50' : ''}`}
                      draggable
                      onDragStart={() => handleImageDragStart(index)}
                      onDragOver={(e) => handleImageDragOver(e, index)}
                      onDragEnd={handleImageDragEnd}
                    >
                      <div className="aspect-square md:aspect-[3/2] lg:aspect-square print:w-[150px] print:h-[110px] rounded-lg overflow-hidden border-2 border-border bg-muted print:rounded print:border">
                        <img
                          src={item.image}
                          alt={`Property ${index + 1}`}
                          className="w-full h-full object-cover pointer-events-none"
                        />
                      </div>
                      <Input
                        value={item.caption || ""}
                        onChange={(e) => updateImageCaption(index, e.target.value)}
                        placeholder="Caption"
                        className="no-print text-xs h-7"
                      />
                      {/* Print-only caption */}
                      {item.caption && (
                        <p className="hidden print:block text-[9px] text-foreground font-medium mt-0.5 leading-tight truncate max-w-[150px]">
                          {item.caption}
                        </p>
                      )}
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

export default Report;
