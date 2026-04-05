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
  Edit,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MapCanvas } from "@/components/MapCanvas";
import crestLogo from "@/assets/crest-logo.png";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { inferImageUploadMeta, compressImage } from "@/lib/imageUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import RichTextEditor from "@/components/RichTextEditor";
import ImageAnnotator from "@/components/ImageAnnotator";
import InlineImageAnnotator from "@/components/InlineImageAnnotator";

const TECHNICIANS = [
  { name: "Darrell Tanner", license: "FR 62523" },
  { name: "Jesse Angulo", license: "FR 51548" },
  { name: "Jake Shubin", license: "FR 71068" },
  { name: "Caleb Whalen", license: "FR 71183" },
  { name: "Jackson Latham", license: "FR 68261" },
  { name: "Dylan Gallegos", license: "RA 71068" },
  { name: "Michael Muniz", license: "FR 54193" },
];

const PEST_OPTIONS = [
  "General Pests: ants, spiders, cockroaches, earwigs, crickets, silverfish, centipedes, millipedes, wasps, fleas & ticks (outdoor only)",
  "Ants",
  "Spiders",
  "Rodents",
  "Roaches",
  "American Roaches",
  "Wasps",
  "Bed Bugs",
  "Fleas",
  "Ticks",
  "Mosquitoes",
  "Silverfish",
  "Earwigs",
  "Crickets",
  "Centipedes",
  "Millipedes",
  "Drain Flies",
  "Other",
];

const CUSTOMER_KEY_AREAS = ["Children", "Pets", "Elderly", "Garden"];

const GENERAL_PESTS_OPTION = PEST_OPTIONS[0];

const PRODUCT_OPTIONS = [
  "Alpine WSG",
  "Bifen I/T",
  "Essentria IC Pro",
  "Temprid FX",
  "Termidor SC",
  "Phantom",
  "ExciteR",
  "Gentrol IGR Concentrate",
  "Nyguard IGR Concentrate",
  "PT Wasp Freeze",
  "PT Alpine Flea & Bed Bug",
  "PT Alpine Fly Bait",
  "Gentrol Aerosol",
  "Bedlam",
  "Invade Hot Spot +",
  "Niban",
  "Bifen LP",
  "Advion Ant Gel Bait",
  "Maxforce FC Ant Gel",
  "MasterLine B MaxxPro",
  "Advion Cockroach Gel Bait",
  "Contrac California",
  "Delta Dust (Bayer)",
  "In2Care Mix",
  "OneGuard",
  "Advion Microflow",
  "Optigard",
  "Other",
];

const EQUIPMENT_OPTIONS = ["Rodent Bait Stations", "Rodent Traps", "Mosquito Buckets", "Fly Light", "Pest Monitors"];

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
  const isTablet = useIsTablet();
  const isMobileOrTablet = isMobile || isTablet;
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
  const [editableAddress, setEditableAddress] = useState<string>(address || "");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [editableTech, setEditableTech] = useState(technicianName || "");
  const [editableCustomer, setEditableCustomer] = useState(customerName || "");
  const [editableServiceDate, setEditableServiceDate] = useState(serviceDate || new Date().toISOString().split("T")[0]);
  const [editableLicenseNumber, setEditableLicenseNumber] = useState(licenseNumber || "");
  const [techDropdownOpen, setTechDropdownOpen] = useState(false);

  // Auto-set license when technician changes
  const handleTechnicianChange = (techName: string) => {
    setEditableTech(techName);
    const tech = TECHNICIANS.find((t) => t.name === techName);
    if (tech) {
      setEditableLicenseNumber(tech.license);
    }
    setTechDropdownOpen(false);
  };
  const [editableTargetPests, setEditableTargetPests] = useState<string[]>(targetPests?.filter((p: string) => p) || ["Ants", "Spiders", "Roaches"]);
  const [editableProductsUsed, setEditableProductsUsed] = useState<string[]>(
    productsUsed?.filter((p: string) => p) || [],
  );
  const [editableEquipment, setEditableEquipment] = useState<string[]>([]);
  const [editableFindings, setEditableFindings] = useState<string[]>([]);
  const [editableExpectations, setEditableExpectations] = useState<string[]>([]);
  const [editableRecommendations, setEditableRecommendations] = useState<string[]>([]);
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
  const [hasManuallyEditedFindings, setHasManuallyEditedFindings] = useState(false);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  const [emailSubject, setEmailSubject] = useState("Your Initial Pest Report from Crest");
  const [emailMessage, setEmailMessage] = useState("");
  const [ccEmails, setCcEmails] = useState<string[]>(["office@crestpestcontrol.com"]);
  const [ccInput, setCcInput] = useState("");
  const [recommendationsFontSize, setRecommendationsFontSize] = useState(14);
  const [annotatingImageIndex, setAnnotatingImageIndex] = useState<number | null>(null);

  // Generate findings and expectations based on selected pests, equipment, and products
  const generateContentFromSelections = (pests: string[], equipment: string[], products: string[]) => {
    const lines: string[] = [];

    // Check if using organic products (Essentria)
    const usesOrganic = products.some(p => p.toLowerCase().includes("essentria"));

    // Standard general pest control from knowledge base
    if (pests.length > 0) {
      lines.push("• Inspected interior and exterior for pest activity and entry points");
      const treatmentLine = usesOrganic 
        ? "• Applied targeted treatments, including organic solutions, to ensure a protective barrier around the home"
        : "• Applied targeted treatments to ensure a protective barrier around the home";
      lines.push(treatmentLine);
      lines.push("• De-webbed the entire home");
    }

    // Only add rodent-specific if Rodents selected
    if (pests.includes("Rodents")) {
      lines.push("• Strategically placed traps in areas of highest activity");
    }

    // Equipment-based additions
    if (equipment.includes("Rodent Bait Stations")) {
      lines.push("• Installed rodent bait stations around the property perimeter");
    }
    if (equipment.includes("Rodent Traps")) {
      lines.push("• Placed rodent traps for population control");
    }

    return lines.join("\n");
  };

  const generateExpectations = () => {
    return "• Initial Period: You may notice increased pest activity in the first 24-48 hours as pests are flushed from hiding spots.\n• Treatment Effect: Pest populations will decrease significantly over the next 7-10 days.\n• Long-term Results: With continued service, pests will become less of an issue. Contact us if activity persists beyond 2 weeks.";
  };

  const generateRecommendations = (pests: string[]) => {
    const lines: string[] = [];
    
    // If "General Pests" is selected, default to ants + spiders recommendations
    const isGeneralPests = pests.some(p => p.startsWith("General Pests"));
    
    if (isGeneralPests || pests.includes("Ants")) {
      lines.push("<strong>Ants:</strong> (1) Wipe food/sugar spills fast (2) Fix leaks & avoid overwatering");
    }
    if (isGeneralPests || pests.includes("Spiders")) {
      lines.push("<strong>Spiders:</strong> (1) Remove webs regularly (2) Reduce insects & outdoor lighting");
    }
    if (pests.includes("American Roaches") || pests.includes("Oriental Roaches") || pests.includes("Roaches")) {
      lines.push("<strong>American & Oriental Cockroaches:</strong> (1) Keep garages/laundry clutter-free (2) Don't leave pet food/water out");
    }
    if (pests.includes("German Roaches")) {
      lines.push("<strong>German Cockroaches:</strong> (1) Clean kitchens nightly (2) Take trash out often");
    }
    if (pests.includes("Crickets")) {
      lines.push("<strong>Crickets:</strong> (1) Reduce moisture & fix leaks (2) Turn off exterior lights");
    }
    if (pests.includes("Earwigs")) {
      lines.push("<strong>Earwigs:</strong> (1) Clear mulch/debris near home (2) Avoid overwatering foundations");
    }
    if (pests.includes("Fleas") || pests.includes("Fleas & Ticks") || pests.includes("Ticks")) {
      lines.push("<strong>Fleas:</strong> (1) Wash pet bedding hot (2) Vacuum pet areas often");
    }
    if (pests.includes("Silverfish")) {
      lines.push("<strong>Silverfish:</strong> (1) Lower humidity (2) Declutter & vacuum cracks");
    }
    if (pests.includes("Wasps")) {
      lines.push("<strong>Wasps:</strong> (1) Cover food/drinks outdoors (2) Seal & rinse trash cans");
    }
    if (pests.includes("Bed Bugs")) {
      lines.push("<strong>Bed Bugs:</strong> (1) Inspect luggage after travel (2) Use mattress encasements");
    }
    if (pests.includes("Pantry Pests")) {
      lines.push("<strong>Pantry Pests:</strong> (1) Store food airtight (2) Discard infested items");
    }
    if (pests.includes("Carpet Beetles")) {
      lines.push("<strong>Carpet Beetles:</strong> (1) Vacuum carpets/upholstery (2) Wash stored fabrics");
    }
    if (pests.includes("Mosquitoes")) {
      lines.push("<strong>Mosquitoes:</strong> (1) Remove standing water (2) Trim vegetation");
    }
    if (pests.includes("Drain Flies")) {
      lines.push("<strong>Drain Flies:</strong> (1) Clean drains regularly (2) Avoid grease/food waste");
    }
    if (pests.includes("Fruit Flies")) {
      lines.push("<strong>Fruit Flies:</strong> (1) Toss overripe fruit (2) Clean trash/recycling bins");
    }
    if (pests.includes("Rats") || pests.includes("Rodents")) {
      lines.push("<strong>Rats:</strong> (1) Seal food & clean outdoor debris (2) Keep yards clutter-free");
    }
    if (pests.includes("Mice")) {
      lines.push("<strong>Mice:</strong> (1) Store food sealed (2) Clean crumbs & spills promptly");
    }
    
    if (lines.length === 0) {
      lines.push("<strong>General:</strong> (1) Keep food in airtight containers (2) Seal cracks around doors & windows");
      lines.push("<strong>Moisture:</strong> (1) Fix leaks promptly (2) Improve ventilation in damp areas");
    }
    
    return lines.join("<br>");
  };

  // Auto-update content when pests, equipment, or products change
  useEffect(() => {
    // Skip if loading a report or if user has manually edited
    if (reportId || hasManuallyEditedFindings) return;
    
    if (editableTargetPests.length > 0 || editableEquipment.length > 0) {
      const content = generateContentFromSelections(editableTargetPests, editableEquipment, editableProductsUsed);
      setEditableFindings([content]);
      setEditableExpectations([generateExpectations()]);
      setEditableRecommendations([generateRecommendations(editableTargetPests)]);
    }
  }, [editableTargetPests, editableEquipment, editableProductsUsed, reportId, hasManuallyEditedFindings]);

  // Auto-add rodent equipment when Rodents is selected
  useEffect(() => {
    if (editableTargetPests.includes("Rodents")) {
      setEditableEquipment(prev => {
        if (!prev.includes("Rodent Bait Stations")) {
          return [...prev, "Rodent Bait Stations"];
        }
        return prev;
      });
    }
  }, [editableTargetPests]);

  // Initialize findings on first load (for new reports with default pests)
  useEffect(() => {
    if (!reportId && editableTargetPests.length > 0 && editableFindings.length === 0) {
      const content = generateContentFromSelections(editableTargetPests, editableEquipment, editableProductsUsed);
      setEditableFindings([content]);
      setEditableExpectations([generateExpectations()]);
      setEditableRecommendations([generateRecommendations(editableTargetPests)]);
    }
  }, []);

  const expandWithAI = async (
    text: string,
    type: "findings" | "expect",
    setter: React.Dispatch<React.SetStateAction<string[]>>,
  ) => {
    if (type === "findings") setIsExpandingFindings(true);
    else setIsExpandingExpect(true);

    try {
      const { data, error } = await supabase.functions.invoke("expand-findings", {
        body: { text, type },
      });

      if (error) throw error;

      if (data?.expandedText) {
        setter([data.expandedText]);
        toast.success("Text expanded!");
        if (type === "findings") {
          setHasManuallyEditedFindings(true);
        }

        // Auto-fill expectations when expanding findings
        if (type === "findings") {
          setEditableExpectations([generateExpectations()]);
        }
      }
    } catch (error: any) {
      console.error("Error expanding text:", error);
      toast.error("Failed to expand text");
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
      setEditableExpectations(analysis.nextSteps || []);
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
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
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
      const adminSessionToken = localStorage.getItem("admin_session");
      let row: any = null;

      if (adminSessionToken) {
        const { data: adminData, error: adminError } = await supabase.functions.invoke("admin-reports", {
          body: { sessionToken: adminSessionToken, action: "get", reportId },
        });

        if (!adminError && adminData?.ok && adminData.report) {
          row = adminData.report;
        }
      }

      if (!row) {
        const { data, error } = await supabase.from("reports").select("*").eq("id", reportId).single();
        if (error) throw error;
        row = data;
      }

      setEditableTech(row.technician_name);
      setEditableCustomer(row.customer_name || "");
      setExtractedAddress(row.address || "");
      setEditableAddress(row.address || "");
      setEditableFindings((row.findings as string[]) || []);
      setEditableExpectations((row.next_steps as string[]) || []);

      // Load additional fields
      if (row.service_date) {
        setEditableServiceDate(row.service_date);
      }
      if (row.license_number) {
        setEditableLicenseNumber(row.license_number);
      }
      if (row.target_pests && Array.isArray(row.target_pests)) {
        setEditableTargetPests(row.target_pests as string[]);
      }
      if (row.products_used && Array.isArray(row.products_used)) {
        setEditableProductsUsed(row.products_used as string[]);
      }
      if (row.equipment && Array.isArray(row.equipment)) {
        setEditableEquipment(row.equipment as string[]);
      }

      console.log("Loading report map_data:", {
        hasMapData: !!row.map_data,
        mapDataType: typeof row.map_data,
        mapDataPreview: row.map_data ? JSON.stringify(row.map_data).substring(0, 150) : "null",
      });

      setMapData(row.map_data ? JSON.stringify(row.map_data) : null);

      // Load custom map and property images
      if (row.custom_map_url) {
        setCustomMapImage(row.custom_map_url);
      }

      if (row.property_images) {
        setPropertyImages(row.property_images as Array<{ image: string; caption?: string }>);
      }

      // Extract coordinates from map_url if available, otherwise geocode
      if (row.map_url) {
        const latMatch = row.map_url.match(/mlat=([-\d.]+)/);
        const lngMatch = row.map_url.match(/mlon=([-\d.]+)/);
        if (latMatch && lngMatch) {
          setCoordinates({
            lat: parseFloat(latMatch[1]),
            lng: parseFloat(lngMatch[1]),
          });
        }
      } else if (row.address) {
        geocodeAddress(row.address);
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

  // Render map canvas to a static image and upload to storage
  const renderMapImage = async (): Promise<string | null> => {
    try {
      const exportFn = (window as any).exportMapAsImage;
      if (!exportFn) return null;
      
      const dataUrl = await exportFn();
      if (!dataUrl) return null;
      
      // Convert data URL to blob and upload to storage
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const fileName = `${reportId || crypto.randomUUID()}/rendered-map/${Date.now()}.png`;
      
      const { error: uploadError } = await supabase.storage
        .from("report-images")
        .upload(fileName, blob, { upsert: true, contentType: "image/png" });
      
      if (uploadError) {
        console.error("Error uploading rendered map:", uploadError);
        return null;
      }
      
      const { data: { publicUrl } } = supabase.storage.from("report-images").getPublicUrl(fileName);
      return publicUrl;
    } catch (error) {
      console.error("Error rendering map image:", error);
      return null;
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

      // Render the map with annotations to a static image
      const renderedMapUrl = await renderMapImage();

      const reportData = {
        technician_name: editableTech,
        customer_name: editableCustomer,
        address: editableAddress || extractedAddress || address,
        notes: notes,
        findings: editableFindings,
        recommendations: editableRecommendations,
        next_steps: editableExpectations,
        map_url: coordinates
          ? `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=17/${coordinates.lat}/${coordinates.lng}`
          : null,
        map_data: mapPayload,
        custom_map_url: customMapImage,
        rendered_map_url: renderedMapUrl,
        property_images: propertyImages,
        service_date: editableServiceDate,
        license_number: editableLicenseNumber,
        target_pests: editableTargetPests,
        products_used: editableProductsUsed,
        equipment: editableEquipment,
        report_title: "Initial Pest Report",
      };

      if (reportId) {
        const { error } = await supabase.from("reports").update(reportData).eq("id", reportId);

        if (error) throw error;
        toast.success("Report saved successfully!");
      } else {
        // Generate an id client-side so we can navigate to it
        const newId = crypto.randomUUID();
        const { error } = await supabase.from("reports").insert([{ id: newId, ...reportData }]);

        if (error) throw error;
        
        // Navigate to the new report URL
        navigate(`/initial-pest-report/${newId}`, { replace: true });
        toast.success("Report saved successfully!");
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

  /** Downscale an <img> to a JPEG data-URL (max 800px, q=0.5) */
  const downscaleImg = (img: HTMLImageElement, maxDim = 800, quality = 0.5): Promise<string | null> => {
    return new Promise((resolve) => {
      // If already a data URL that's small, skip
      if (img.naturalWidth <= maxDim && img.naturalHeight <= maxDim) {
        // Still re-encode as JPEG for size savings
      }
      const cv = document.createElement("canvas");
      let w = img.naturalWidth;
      let h = img.naturalHeight;
      if (w > maxDim || h > maxDim) {
        const ratio = Math.min(maxDim / w, maxDim / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      cv.width = w;
      cv.height = h;
      const c = cv.getContext("2d");
      if (!c) { resolve(null); return; }
      c.drawImage(img, 0, 0, w, h);
      resolve(cv.toDataURL("image/jpeg", quality));
    });
  };

  const exportToPDF = async () => {
    try {
      const toasts = document.querySelectorAll('[role="status"], .sonner, [data-sonner-toaster]');
      toasts.forEach((toastEl) => {
        (toastEl as HTMLElement).style.display = "none";
      });

      // Downscale all visible images to reduce PDF size
      const images = document.querySelectorAll<HTMLImageElement>("img:not(.no-print-compress)");
      const originals: { el: HTMLImageElement; src: string }[] = [];

      await Promise.all(
        Array.from(images).map(async (img) => {
          if (!img.complete || img.naturalWidth === 0) return;
          // Skip tiny images (icons, logos under 50px)
          if (img.naturalWidth <= 100 && img.naturalHeight <= 100) return;
          try {
            const compressed = await downscaleImg(img, 800, 0.5);
            if (compressed) {
              originals.push({ el: img, src: img.src });
              img.src = compressed;
            }
          } catch { /* skip */ }
        })
      );

      // Also downscale any canvases to JPEG
      const canvases = document.querySelectorAll<HTMLCanvasElement>("canvas");
      const origCanvases: { el: HTMLCanvasElement; parent: HTMLElement; clone: HTMLCanvasElement }[] = [];

      await new Promise((r) => setTimeout(r, 200));
      window.print();

      // Restore original sources
      setTimeout(() => {
        originals.forEach(({ el, src }) => { el.src = src; });
        toasts.forEach((toastEl) => {
          (toastEl as HTMLElement).style.display = "";
        });
      }, 500);
    } catch (e) {
      toast.error("Print failed");
    }
  };

  const handleOpenCompose = () => {
    // Set a default email message when opening compose
    const defaultMessage = `Dear ${editableCustomer || "Valued Customer"},

Thank you for choosing Crest Pest Control! Please find your pest control service report linked below.

If you have any questions about the service or findings, please don't hesitate to reach out to us.

Best regards,
${editableTech || "Your Technician"}
Crest Pest Control
(949) 424-5000`;
    setEmailMessage(defaultMessage);
    setShowComposeDialog(true);
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
      // Save report first if not saved
      const rawMap = latestMapDataRef.current ?? mapData;
      let mapPayload: any = null;
      if (rawMap) {
        try {
          mapPayload = JSON.parse(rawMap);
        } catch (e) {
          mapPayload = rawMap;
        }
      }

      // Render the map with annotations to a static image
      const renderedMapUrl = await renderMapImage();

      const fullReportData = {
        technician_name: editableTech,
        customer_name: editableCustomer,
        address: editableAddress || extractedAddress || address,
        notes: notes,
        findings: editableFindings,
        recommendations: editableRecommendations,
        next_steps: editableExpectations,
        map_url: coordinates
          ? `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=17/${coordinates.lat}/${coordinates.lng}`
          : null,
        map_data: mapPayload,
        custom_map_url: customMapImage,
        rendered_map_url: renderedMapUrl,
        property_images: propertyImages,
        service_date: editableServiceDate,
        license_number: editableLicenseNumber,
        target_pests: editableTargetPests,
        products_used: editableProductsUsed,
        equipment: editableEquipment,
        report_title: "Initial Pest Report",
        customer_email: customerEmail,
        sent_to_customer_at: new Date().toISOString(),
      };

      let finalReportId = reportId;

      if (reportId) {
        const { error: updateError } = await supabase
          .from("reports")
          .update(fullReportData)
          .eq("id", reportId);

        if (updateError) throw updateError;
      } else {
        // Create new report if none exists
        const newId = crypto.randomUUID();
        const { error: insertError } = await supabase
          .from("reports")
          .insert([{ id: newId, ...fullReportData }]);

        if (insertError) throw insertError;
        finalReportId = newId;
        navigate(`/initial-pest-report/${newId}`, { replace: true });
      }

      // Now send the email with the correct report ID
      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          customerEmail,
          ccEmails: ccEmails.length > 0 ? ccEmails : undefined,
          customerName: editableCustomer,
          technicianName: editableTech,
          address: editableAddress || extractedAddress || address || "",
          reportUrl: `${window.location.origin}/view-report/${finalReportId}`,
          emailSubject,
          emailMessage,
          baseUrl: window.location.origin,
        },
      });

      if (error) throw error;

      toast.success(`Report saved and sent to ${customerEmail}`);
      setShowComposeDialog(false);
    } catch (error: any) {
      console.error("Error sending email:", error);
      toast.error("Failed to save or send email. Please try again.");
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
    console.log("[upload] custom map selected", {
      name: file?.name,
      type: file?.type,
      size: file?.size,
    });
    if (!file) return;

    if (file.type && !file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    if (file.size === 0) {
      toast.error("That photo isn't downloaded to this iPad yet (iCloud). Open Photos, download it, then try again.");
      return;
    }

    try {
      const { ext, contentType } = inferImageUploadMeta(file);
      const fileName = `${Math.random()}.${ext}`;
      const filePath = `${reportId || "temp"}/custom-map/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from("report-images")
        .upload(filePath, file, { upsert: true, contentType });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("report-images").getPublicUrl(filePath);

      setCustomMapImage(publicUrl);
      toast.success("Custom map image uploaded");
    } catch (error) {
      console.error("Error uploading map:", error);
      toast.error("Failed to upload map image");
    }
  };

  const handlePropertyImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    console.log("[upload] property images selected", {
      count: files?.length,
      types: files ? Array.from(files).slice(0, 5).map((f) => f.type) : [],
    });
    if (!files) return;

    const fileArray = Array.from(files).slice(0, 5);

    if (fileArray.some((file) => file.size === 0)) {
      toast.error("One of the selected photos isn't downloaded to this iPad yet (iCloud). Download it in Photos and try again.");
      return;
    }

    if (fileArray.some((file) => file.type && !file.type.startsWith("image/"))) {
      toast.error("Please upload only image files");
      return;
    }

    try {
      const uploadPromises = fileArray.map(async (file) => {
        const { ext, contentType } = inferImageUploadMeta(file);
        
        // Compress image to reduce file size
        let uploadBlob: Blob = file;
        try {
          const compressed = await compressImage(file, { maxWidth: 1600, maxHeight: 1600, quality: 0.7 });
          uploadBlob = compressed.blob;
          URL.revokeObjectURL(compressed.localUrl);
        } catch (compressErr) {
          console.warn("Image compression failed, uploading original:", compressErr);
        }
        
        const fileName = `${Math.random()}.${ext}`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, uploadBlob, { upsert: true, contentType });


        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("report-images").getPublicUrl(filePath);

        return { image: publicUrl, caption: "" };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      setPropertyImages(uploadedImages);
      toast.success(`${fileArray.length} image(s) uploaded`);
    } catch (error) {
      console.error("Error uploading images:", error);
      toast.error("Failed to upload images");
    }
  };

  const updateImageCaption = (index: number, caption: string) => {
    setPropertyImages((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], caption };
      return updated;
    });
  };

  // Handle pasting images from clipboard for custom map
  const handleMapPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;

        try {
          const { ext, contentType } = inferImageUploadMeta(file);
          const fileName = `${Math.random()}.${ext}`;
          const filePath = `${reportId || "temp"}/custom-map/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("report-images")
            .upload(filePath, file, { upsert: true, contentType });

          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("report-images").getPublicUrl(filePath);

          setCustomMapImage(publicUrl);
          toast.success("Map pasted successfully");
        } catch (error) {
          console.error("Error pasting map:", error);
          toast.error("Failed to paste map image");
        }
        break;
      }
    }
  };

  // Handle pasting images from clipboard for property images
  const handlePropertyImagesPaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imageFiles.push(file);
      }
    }

    if (imageFiles.length === 0) return;
    e.preventDefault();

    // Limit to 5 images total for this report type
    const maxNew = Math.min(imageFiles.length, 5 - propertyImages.length);
    if (maxNew <= 0) {
      toast.error("Maximum 5 images allowed");
      return;
    }

    const filesToProcess = imageFiles.slice(0, maxNew);

    try {
      const uploadPromises = filesToProcess.map(async (file) => {
        const { ext, contentType } = inferImageUploadMeta(file);
        const fileName = `${Math.random()}.${ext}`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, file, { upsert: true, contentType });

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("report-images").getPublicUrl(filePath);

        return { image: publicUrl, caption: "" };
      });

      const uploadedImages = await Promise.all(uploadPromises);
      setPropertyImages(prev => [...prev, ...uploadedImages]);
      toast.success(`${filesToProcess.length} image(s) pasted`);
    } catch (error) {
      console.error("Error pasting images:", error);
      toast.error("Failed to paste images");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {isMobile && (
        <div className="print-header bg-gradient-primary border-b-2 border-foreground px-4 py-3 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <img src={crestLogo} alt="Crest" className="h-10 no-print-compress" />
            <div className="flex gap-2 no-print">
              <Button size="sm" variant="secondary" onClick={handleOpenCompose} className="h-9">
                <Mail className="w-4 h-4" />
              </Button>
              <Button size="sm" variant="default" onClick={handleSubmit} disabled={isSaving} className="h-9">
                {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
              <Button size="sm" variant="outline" onClick={exportToPDF} className="h-9">
                <FileDown className="w-4 h-4" />
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
        <div className="print-header bg-gradient-to-r from-sage/40 via-sage/15 to-sage/35 shadow-md border-b-2 border-dark-sage px-6 py-3">
          <div className="max-w-[1800px] mx-auto">
            {/* Action buttons row for iPad - shown at top on medium screens */}
            <div className="hidden md:flex lg:hidden items-center gap-2 no-print mb-3 flex-wrap">
              <Button
                onClick={handleOpenCompose}
                variant="secondary"
                size="sm"
              >
                <Mail className="w-3 h-3 mr-1" />
                Email
              </Button>
              <Button onClick={handleSubmit} disabled={isSaving} size="sm">
                {isSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3 mr-1" />}
                Save
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
                  <img src={crestLogo} alt="Crest Pest Control" className="h-20 w-auto min-w-[80px] no-print-compress" />
                  <span className="text-xs text-muted-foreground mt-1">PR #9859</span>
                </div>
                <div className="flex-1 ml-4">
                  <h1 className="text-xl font-bold text-foreground mb-2">Initial Pest Report</h1>

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
                            className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 md:h-5 h-10 text-xs md:text-xs text-base flex-1 focus-visible:ring-0 no-print"
                          />
                          <span className="print-only-text hidden text-foreground">{editableCustomer || "Customer name"}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-20">Address:</span>
                          <Input
                            value={editableAddress || extractedAddress}
                            onChange={(e) => setEditableAddress(e.target.value)}
                            placeholder="Enter address"
                            className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 md:h-5 h-10 text-xs md:text-xs text-base flex-1 focus-visible:ring-0 no-print"
                          />
                          <span className="print-only-text hidden text-foreground">{displayAddress}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-20">Service Date:</span>
                          <Input
                            type="date"
                            value={editableServiceDate}
                            onChange={(e) => setEditableServiceDate(e.target.value)}
                            className="bg-transparent border-b border-border text-foreground px-1 h-5 text-xs w-32 focus-visible:ring-0 no-print"
                          />
                          <span className="print-only-text hidden text-foreground">{editableServiceDate}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex-1">
                      <p className="font-semibold text-foreground text-xs mb-1">Technician Information:</p>
                      <div className="space-y-0.5 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-24">Name:</span>
                          <Popover open={techDropdownOpen} onOpenChange={setTechDropdownOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="ghost"
                                role="combobox"
                                aria-expanded={techDropdownOpen}
                                className="h-5 px-1 text-xs justify-between bg-transparent border-b border-border rounded-none hover:bg-transparent focus-visible:ring-0 flex-1 no-print"
                              >
                                {editableTech || "Select technician"}
                                <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[200px] p-0 z-50 bg-background border border-border">
                              <Command>
                                <CommandInput placeholder="Search technician..." className="h-8 text-xs" />
                                <CommandList>
                                  <CommandEmpty>No technician found.</CommandEmpty>
                                  <CommandGroup>
                                    {TECHNICIANS.map((tech) => (
                                      <CommandItem
                                        key={tech.name}
                                        value={tech.name}
                                        onSelect={handleTechnicianChange}
                                        className="text-xs"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-3 w-3",
                                            editableTech === tech.name ? "opacity-100" : "opacity-0"
                                          )}
                                        />
                                        {tech.name}
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                          <span className="print-only-text hidden">{editableTech}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-24 whitespace-nowrap">License Number:</span>
                          <span className="text-foreground text-xs">{editableLicenseNumber || "License #"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-2 no-print shrink-0">
                <Button
                  onClick={handleOpenCompose}
                  variant="secondary"
                  size="sm"
                  className="h-8 px-2 text-xs"
                >
                  <Mail className="w-3.5 h-3.5 mr-1" />
                  Email
                </Button>
                <Button onClick={handleSubmit} disabled={isSaving} variant="default" size="sm" className="h-8 px-2 text-xs">
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5 mr-1" />}
                  Save
                </Button>
                <Button onClick={exportToPDF} variant="outline" size="sm" className="h-8 px-2 text-xs">
                  <FileDown className="w-3.5 h-3.5 mr-1" />
                  PDF
                </Button>
                <Button onClick={() => navigate("/")} variant="outline" size="icon" className="h-8 w-8">
                  <Home className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Purpose Text */}
            <div className="mt-2 p-2 bg-muted/50 rounded-lg border border-border">
              <p className="text-xs text-foreground leading-tight">
                We appreciate you entrusting Crest with your pest control needs. With mother nature, there is no "one
                size fits all" approach and there are often a number of factors that lead to increased pest activity.
                We've created this educational report to help you and your family get one step closer to living a
                pest-free life. Please give us a call at <span className="font-semibold">949-424-5000</span> if you have
                any questions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`print-layout ${isMobileOrTablet ? "flex flex-col" : "flex min-h-[calc(100vh-88px)]"}`}>
        {/* Map Section - Fixed 3:4 aspect ratio for consistency across devices */}
        <div
          className={`print-map-container ${
            isMobileOrTablet ? "w-full max-w-[506px] mx-auto px-4 py-2" : "flex-none w-full max-w-[506px] p-4"
          }`}
        >
          <div 
            className="relative w-full bg-sage rounded-lg print-map-aspect" 
            style={{ paddingBottom: "133%" }}
            onPaste={handleMapPaste}
            tabIndex={0}
          > {/* 3:4 aspect ratio (taller) */}
            <div className="absolute inset-0">
              {isProcessing && (
                <div className="no-print absolute inset-0 bg-background/80 flex items-center justify-center z-10 rounded-lg">
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
                    <div className="relative inline-flex">
                      <Button size="sm" variant="secondary" type="button">
                        <FileDown className="w-4 h-4 mr-2" />
                        Upload Map
                      </Button>
                      <input
                        id="custom-map-upload"
                        type="file"
                        accept="image/*"
                        onClick={(e) => {
                          (e.currentTarget as HTMLInputElement).value = "";
                        }}
                        onChange={handleCustomMapUpload}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                        aria-label="Upload map image"
                      />
                    </div>
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
                <div className="h-full flex flex-col items-center justify-center bg-muted border-2 border-dashed border-border rounded-lg">
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
                      <p className="text-sm text-muted-foreground mb-4">Upload or paste a property map/satellite image</p>
                      <div className="relative inline-flex">
                        <Button variant="default" type="button">
                          <FileDown className="w-4 h-4 mr-2" />
                          Upload Map Image
                        </Button>
                        <input
                          id="custom-map-upload-empty"
                          type="file"
                          accept="image/*"
                          onClick={(e) => {
                            (e.currentTarget as HTMLInputElement).value = "";
                          }}
                          onChange={handleCustomMapUpload}
                          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                          aria-label="Upload map image"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={isMobileOrTablet ? "flex-1 overflow-y-auto pb-32" : "flex-1 min-w-0 overflow-y-auto"}>
          <div className="p-3 md:p-4 space-y-3">
            {/* Mobile/Tablet: Customer & Technician - hidden in print */}
            {isMobileOrTablet && (
              <Card className="p-4 no-print">
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
                    <Popover open={techDropdownOpen} onOpenChange={setTechDropdownOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={techDropdownOpen}
                          className="w-full justify-between text-base"
                        >
                          {editableTech || "Select technician"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0 z-50 bg-background border border-border">
                        <Command>
                          <CommandInput placeholder="Search technician..." />
                          <CommandList>
                            <CommandEmpty>No technician found.</CommandEmpty>
                            <CommandGroup>
                              {TECHNICIANS.map((tech) => (
                                <CommandItem
                                  key={tech.name}
                                  value={tech.name}
                                  onSelect={handleTechnicianChange}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      editableTech === tech.name ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {tech.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className="text-sm font-medium mb-1 block">Address</label>
                    <Input
                      value={editableAddress || extractedAddress}
                      onChange={(e) => setEditableAddress(e.target.value)}
                      placeholder="Enter address"
                      className="text-base"
                    />
                  </div>
                  {editableLicenseNumber && (
                    <div className="text-sm text-muted-foreground">
                      License: {editableLicenseNumber}
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Target Pest(s) Section */}
            <Card className="print-section p-0 overflow-visible">
              <div className="relative" ref={pestsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setPestsDropdownOpen(!pestsDropdownOpen)}
                  className="print-section-header text-lg md:text-xl font-bold w-full flex items-center justify-between cursor-pointer"
                >
                  <span>Target Pest(s)</span>
                  <ChevronDown
                    className={`w-5 h-5 text-white transition-transform no-print ${pestsDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {pestsDropdownOpen && (
                  <div
                    className="absolute z-50 w-full mt-0 bg-background border border-input rounded-b-md shadow-lg max-h-60 overflow-y-auto"
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
                          setEditableTargetPests((prev) =>
                            prev.includes(pest) ? prev.filter((p) => p !== pest) : [...prev, pest],
                          );
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between ${
                          editableTargetPests.includes(pest) ? "bg-primary/10 text-primary font-medium" : ""
                        }`}
                      >
                        {pest}
                        {editableTargetPests.includes(pest) && <span className="text-primary">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {editableTargetPests.length > 0 && (
                <div className="print-tags flex flex-wrap gap-2 items-start content-start p-2 bg-background">
                  {editableTargetPests.map((pest) => (
                    <span
                      key={pest}
                      className="print-tag inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-primary text-primary-foreground"
                    >
                      {pest}
                      <button
                        type="button"
                        onClick={() => setEditableTargetPests((prev) => prev.filter((p) => p !== pest))}
                        className="hover:bg-primary-foreground/20 rounded-full p-0.5 no-print"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {/* Products Used Section */}
            <Card className="print-section p-0 overflow-visible">
              <div className="relative" ref={productsDropdownRef}>
                <button
                  type="button"
                  onClick={() => setProductsDropdownOpen(!productsDropdownOpen)}
                  className="print-section-header text-lg md:text-xl font-bold w-full flex items-center justify-between cursor-pointer"
                >
                  <span>Product(s) Used</span>
                  <ChevronDown
                    className={`w-5 h-5 text-white transition-transform no-print ${productsDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {productsDropdownOpen && (
                  <div
                    className="absolute z-50 w-full mt-0 bg-background border border-input rounded-b-md shadow-lg max-h-60 overflow-y-auto"
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
                          setEditableProductsUsed((prev) =>
                            prev.includes(product) ? prev.filter((p) => p !== product) : [...prev, product],
                          );
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between ${
                          editableProductsUsed.includes(product) ? "bg-primary/10 text-primary font-medium" : ""
                        }`}
                      >
                        {product}
                        {editableProductsUsed.includes(product) && <span className="text-primary">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {editableProductsUsed.length > 0 && (
                <div className="print-tags flex flex-wrap gap-2 items-start content-start p-2 bg-background">
                  {editableProductsUsed.map((product) => (
                    <span
                      key={product}
                      className="print-tag inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-primary text-primary-foreground"
                    >
                      {product}
                      <button
                        type="button"
                        onClick={() => setEditableProductsUsed((prev) => prev.filter((p) => p !== product))}
                        className="hover:bg-primary-foreground/20 rounded-full p-0.5 no-print"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {/* Equipment Section */}
            <Card className="print-section p-0 overflow-visible">
              <div className="relative" ref={equipmentDropdownRef}>
                <button
                  type="button"
                  onClick={() => setEquipmentDropdownOpen(!equipmentDropdownOpen)}
                  className="print-section-header text-lg md:text-xl font-bold w-full flex items-center justify-between cursor-pointer"
                >
                  <span>Equipment</span>
                  <ChevronDown
                    className={`w-5 h-5 text-white transition-transform no-print ${equipmentDropdownOpen ? "rotate-180" : ""}`}
                  />
                </button>

                {equipmentDropdownOpen && (
                  <div
                    className="absolute z-50 w-full mt-0 bg-background border border-input rounded-b-md shadow-lg max-h-60 overflow-y-auto"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    {EQUIPMENT_OPTIONS.map((equipment) => (
                      <button
                        key={equipment}
                        type="button"
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditableEquipment((prev) =>
                            prev.includes(equipment) ? prev.filter((eq) => eq !== equipment) : [...prev, equipment],
                          );
                        }}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-muted flex items-center justify-between ${
                          editableEquipment.includes(equipment) ? "bg-primary/10 text-primary font-medium" : ""
                        }`}
                      >
                        {equipment}
                        {editableEquipment.includes(equipment) && <span className="text-primary">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {editableEquipment.length > 0 && (
                <div className="print-tags flex flex-wrap gap-2 items-start content-start p-2 bg-background">
                  {editableEquipment.map((equipment) => (
                    <span
                      key={equipment}
                      className="print-tag inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-primary text-primary-foreground"
                    >
                      {equipment}
                      <button
                        type="button"
                        onClick={() => setEditableEquipment((prev) => prev.filter((eq) => eq !== equipment))}
                        className="hover:bg-primary-foreground/20 rounded-full p-0.5 no-print"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </Card>

            {/* Findings Section */}
            <Card className="print-section p-3 md:p-4">
              <h2 className="print-section-header text-lg md:text-xl font-bold mb-3">Findings & Actions Taken</h2>
              {isAnalyzing ? (
                <div className="text-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Analyzing...</p>
                </div>
              ) : (
                <div className="space-y-3 p-3">
                  <Textarea
                    value={editableFindings[0] || ""}
                    onChange={(e) => {
                      updateItem(0, e.target.value, setEditableFindings);
                      setHasManuallyEditedFindings(true);
                    }}
                    placeholder="Enter finding or action taken..."
                    className="text-sm resize-y min-h-[120px] leading-relaxed no-print"
                    rows={5}
                  />
                  <div
                    className="hidden print-content-formatted"
                    dangerouslySetInnerHTML={{
                      __html: (editableFindings[0] || "")
                        .replace(/^(.*?:)/gm, "<strong>$1</strong>")
                        .replace(/\n/g, "<br/>"),
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => expandWithAI(editableFindings[0] || "", "findings", setEditableFindings)}
                    disabled={isExpandingFindings}
                    className="no-print"
                  >
                    {isExpandingFindings ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4 mr-2" />
                    )}
                    Expand with AI
                  </Button>
                </div>
              )}
            </Card>

            {/* What to Expect Section */}
            <Card className="print-section p-3 md:p-4">
              <h2 className="print-section-header text-lg md:text-xl font-bold mb-3">What to Expect</h2>
              <div className="space-y-3 p-3">
                <Textarea
                  value={editableExpectations[0] || ""}
                  onChange={(e) => updateItem(0, e.target.value, setEditableExpectations)}
                  placeholder="Enter what the customer should expect..."
                  className="text-sm resize-y min-h-[120px] leading-relaxed no-print"
                  rows={5}
                />
                <div
                  className="hidden print-content-formatted"
                  dangerouslySetInnerHTML={{
                    __html: (editableExpectations[0] || "")
                      .replace(/^(.*?:)/gm, "<strong>$1</strong>")
                      .replace(/\n/g, "<br/>"),
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => expandWithAI(editableExpectations[0] || "", "expect", setEditableExpectations)}
                  disabled={isExpandingExpect}
                  className="no-print"
                >
                  {isExpandingExpect ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4 mr-2" />
                  )}
                  Expand with AI
                </Button>
              </div>
            </Card>

            {/* Recommendations Section */}
            <Card className="print-section p-3 md:p-4">
              <h2 className="print-section-header text-lg md:text-xl font-bold mb-3 text-dark-sage">Recommendations</h2>
              <div className="p-3 no-print">
                <RichTextEditor
                  value={editableRecommendations[0] || ""}
                  onChange={(val) => updateItem(0, val, setEditableRecommendations)}
                  placeholder="Enter recommendations for the customer..."
                  fontSize={recommendationsFontSize}
                  onFontSizeChange={setRecommendationsFontSize}
                  className="min-h-[120px] text-dark-sage"
                  showControls={true}
                />
              </div>
              {/* Print version */}
              <div
                className="hidden print-content-formatted text-dark-sage p-3"
                style={{ fontSize: `${recommendationsFontSize}px` }}
                dangerouslySetInnerHTML={{
                  __html: (editableRecommendations[0] || "").replace(/\n/g, "<br/>"),
                }}
              />
            </Card>
          </div>
        </div>
      </div>

      {/* Second Page - Property Images */}
      <div 
        className={`print-page-break bg-background ${propertyImages.length === 0 ? 'print:hidden' : ''}`}
        onPaste={handlePropertyImagesPaste}
        tabIndex={0}
      >
        <div className={isMobile ? "p-4" : "p-6 max-w-[1800px] mx-auto"}>
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-border">
            <div className="flex items-center gap-4">
              <img src={crestLogo} alt="Crest Pest Control" className="h-16 no-print-compress" />
              <h1 className="text-2xl font-bold text-foreground">Property Images</h1>
            </div>
          </div>

          {/* Upload Section */}
          <div className="no-print mb-6 flex items-center gap-3">
            <div className="relative inline-flex">
              <Button variant="outline" size="lg" type="button">
                <FileDown className="w-5 h-5 mr-2" />
                Upload Images (up to 5)
              </Button>
              <input
                id="property-images-upload"
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onClick={(e) => {
                  (e.currentTarget as HTMLInputElement).value = "";
                }}
                onChange={handlePropertyImagesUpload}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Upload property images"
              />
            </div>
            <span className="text-sm text-muted-foreground">or paste from clipboard (Ctrl+V / Cmd+V)</span>
          </div>

          {/* Property Images Grid - All 5 images in a row */}
          {propertyImages.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
              {propertyImages.map((item, index) => (
                <div key={index} className="space-y-1">
                  <div className="aspect-[4/3] rounded-lg overflow-hidden border border-border bg-muted relative group">
                    {annotatingImageIndex === index ? (
                      <InlineImageAnnotator
                        imageUrl={item.image}
                        onSave={(annotatedDataUrl) => {
                          setPropertyImages((prev) => {
                            const updated = [...prev];
                            updated[index] = { ...updated[index], image: annotatedDataUrl };
                            return updated;
                          });
                          setAnnotatingImageIndex(null);
                          toast.success("Annotations saved");
                        }}
                        onCancel={() => setAnnotatingImageIndex(null)}
                      />
                    ) : (
                      <>
                        <img src={item.image} alt={`Property ${index + 1}`} className="w-full h-full object-cover" />
                        <Button
                          size="icon"
                          variant="destructive"
                          className="absolute top-1 right-1 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity no-print"
                          onClick={() => {
                            setPropertyImages((prev) => prev.filter((_, i) => i !== index));
                            toast.info("Image removed");
                          }}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute bottom-1 right-1 h-6 px-2 text-[10px] no-print"
                          onClick={() => setAnnotatingImageIndex(index)}
                        >
                          <Edit className="w-3 h-3 mr-1" />
                          Draw
                        </Button>
                      </>
                    )}
                  </div>
                  {item.caption && (
                    <div className="p-1.5 bg-card rounded border border-border">
                      <p className="text-[10px] leading-tight text-foreground">{item.caption}</p>
                    </div>
                  )}
                  <Input
                    value={item.caption || ""}
                    onChange={(e) => updateImageCaption(index, e.target.value)}
                    placeholder="Add caption"
                    className="no-print text-xs h-7"
                  />
                </div>
              ))}
            </div>
          )}

          {propertyImages.length === 0 && (
            <div className="no-images-placeholder text-center py-12 text-muted-foreground">
              <p>No images uploaded yet. Upload or paste (Ctrl+V / Cmd+V) up to 5 images.</p>
            </div>
          )}
        </div>
      </div>

      {/* Crest Guarantee */}
      <div className="bg-background">
        <div className={isMobile ? "p-4" : "p-6 max-w-[1800px] mx-auto"}>
          <div className="border-2 border-border rounded-lg p-4 text-center bg-muted/30">
            <h3 className="text-sm font-bold text-foreground mb-2">The Crest Guarantee</h3>
            <p className="text-xs text-foreground leading-relaxed max-w-2xl mx-auto">
              If we haven't lived up to our promise on the first visit, let us know within 30 days and we'll fully refund your payment. And if we haven't lived up to our promises in follow-up visits, cancel any time. No fees. No notice period. No hassle.
            </p>
          </div>
        </div>
      </div>




      {/* Compose Email Dialog */}
      <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Compose Email
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email-to">To</Label>
              <Input
                id="email-to"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@email.com"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email-cc">CC <span className="text-muted-foreground font-normal">(optional — press Enter or comma to add)</span></Label>
              <div className="flex flex-wrap gap-1.5 p-2 border border-input rounded-md bg-background min-h-[40px]">
                {ccEmails.map((email, i) => (
                  <span key={i} className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded text-sm">
                    {email}
                    <button type="button" onClick={() => setCcEmails(prev => prev.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-foreground ml-0.5">×</button>
                  </span>
                ))}
                <input
                  id="email-cc"
                  type="email"
                  value={ccInput}
                  onChange={(e) => setCcInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      const val = ccInput.trim().replace(/,$/, "");
                      if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !ccEmails.includes(val)) {
                        setCcEmails(prev => [...prev, val]);
                      }
                      setCcInput("");
                    } else if (e.key === "Backspace" && !ccInput && ccEmails.length > 0) {
                      setCcEmails(prev => prev.slice(0, -1));
                    }
                  }}
                  onBlur={() => {
                    const val = ccInput.trim().replace(/,$/, "");
                    if (val && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val) && !ccEmails.includes(val)) {
                      setCcEmails(prev => [...prev, val]);
                      setCcInput("");
                    }
                  }}
                  placeholder={ccEmails.length === 0 ? "cc@example.com" : ""}
                  className="flex-1 min-w-[120px] outline-none bg-transparent text-sm placeholder:text-muted-foreground"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email-subject">Subject</Label>
              <Input
                id="email-subject"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Email subject"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="email-message">Message</Label>
              <Textarea
                id="email-message"
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                placeholder="Write your message..."
                className="min-h-[150px]"
              />
            </div>
            
            <div className="space-y-2">
              <Label>Report Link (included in email)</Label>
              <div className="p-3 bg-muted rounded-md text-sm">
                {reportId ? (
                  <a 
                    href={`${window.location.origin}/view-report/${reportId}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary underline break-all"
                  >
                    {`${window.location.origin}/view-report/${reportId}`}
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">
                    Save the report first to generate a shareable link
                  </span>
                )}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowComposeDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendEmail} 
              disabled={isSendingEmail || !customerEmail}
            >
              {isSendingEmail ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              Send Email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Report;
