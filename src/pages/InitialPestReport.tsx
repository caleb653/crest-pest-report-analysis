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
import crestLogo from "@/assets/crest-logo.png";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

const TECHNICIANS = [
  { name: "Alexis Rodriguez", license: "RA 68916" },
  { name: "Darrell Tanner", license: "FR 62523" },
  { name: "Marcus Reynolds", license: "FR 41031" },
  { name: "Jesse Angulo", license: "FR 51548" },
  { name: "Jake Shubin", license: "RA 71439" },
  { name: "Caleb Whalen", license: "RA 71438" },
];

const PEST_OPTIONS = [
  "Ants",
  "Spiders",
  "Rodents",
  "Roaches",
  "Wasps",
  "Bed Bugs",
  "Fleas",
  "Ticks",
  "Mosquitoes",
  "Silverfish",
  "Earwigs",
  "Crickets",
  "Other",
];

const PRODUCT_OPTIONS = [
  "Alpine WSG",
  "Bifen I/T",
  "Essentria IC Pro",
  "Temprid FX",
  "Termidor SC",
  "Phantom",
  "Onslaught",
  "Gentrol IGR",
  "Nyguard IGR",
  "PT Wasp Freeze II",
  "Gentrol Aerosol",
  "Shockwave 1",
  "Essentria G",
  "Bifen LP",
  "Advion Ant Gel Bait",
  "Advion Cockroach Gel Bait",
  "Contrac All Weather Blox",
  "DeltaDust",
  "Maxforce FC Ant Gel",
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

  // Auto-update content when pests, equipment, or products change
  useEffect(() => {
    // Skip if loading a report or if user has manually edited
    if (reportId || hasManuallyEditedFindings) return;
    
    if (editableTargetPests.length > 0 || editableEquipment.length > 0) {
      const content = generateContentFromSelections(editableTargetPests, editableEquipment, editableProductsUsed);
      setEditableFindings([content]);
      setEditableExpectations([generateExpectations()]);
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
      const { data, error } = await supabase.from("reports").select("*").eq("id", reportId).single();

      if (error) throw error;

      setEditableTech(data.technician_name);
      setEditableCustomer(data.customer_name || "");
      setExtractedAddress(data.address || "");
      setEditableFindings((data.findings as string[]) || []);
      setEditableExpectations((data.next_steps as string[]) || []);

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
        next_steps: editableExpectations,
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
      const { data, error } = await supabase.functions.invoke("send-report-email", {
        body: {
          customerEmail,
          customerName: editableCustomer,
          technicianName: editableTech,
          address: extractedAddress || address || "",
          findings: editableFindings,
          expectations: editableExpectations,
          targetPests: editableTargetPests,
          productsUsed: editableProductsUsed,
          equipment: editableEquipment,
          reportUrl: reportId ? `${window.location.origin}/report/${reportId}` : "",
        },
      });

      if (error) throw error;

      toast.success(`Report sent to ${customerEmail}`);
    } catch (error: any) {
      console.error("Error sending email:", error);
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

    if (!file.type.startsWith("image/")) {
      toast.error("Please upload an image file");
      return;
    }

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${reportId || "temp"}/custom-map/${fileName}`;

      const { error: uploadError, data } = await supabase.storage
        .from("report-images")
        .upload(filePath, file, { upsert: true });

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
    if (!files) return;

    const fileArray = Array.from(files).slice(0, 5);

    if (fileArray.some((file) => !file.type.startsWith("image/"))) {
      toast.error("Please upload only image files");
      return;
    }

    try {
      const uploadPromises = fileArray.map(async (file) => {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${reportId || "temp"}/property/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("report-images")
          .upload(filePath, file, { upsert: true });

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
        <div className="print-header bg-gradient-to-r from-sage/40 via-sage/15 to-sage/35 shadow-md border-b-2 border-dark-sage px-6 py-3">
          <div className="max-w-[1800px] mx-auto">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-6 flex-1">
                <div className="flex flex-col items-center shrink-0">
                  <img src={crestLogo} alt="Crest Pest Control" className="h-20 w-auto min-w-[80px]" />
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
                            className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 text-xs flex-1 focus-visible:ring-0 no-print"
                          />
                          <span className="print-only-text hidden text-foreground">{editableCustomer || "Customer name"}</span>
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
                <Button onClick={exportToPDF} variant="default" size="sm" className="h-8 px-2 text-xs">
                  <FileDown className="w-3.5 h-3.5 mr-1" />
                  PDF
                </Button>
                <Button onClick={handleShare} variant="outline" size="sm" className="h-8 px-2 text-xs">
                  <Share2 className="w-3.5 h-3.5 mr-1" />
                  Share
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
      <div className={`print-layout ${isMobileOrTablet ? "flex flex-col" : "flex h-[calc(100vh-88px)]"}`}>
        {/* Map Section - Fixed 3:4 aspect ratio for consistency across devices */}
        <div
          className={`print-map-container ${
            isMobileOrTablet ? "w-full max-w-[506px] mx-auto px-4 py-2" : "flex-none w-full max-w-[506px] p-4"
          }`}
        >
          <div className="relative w-full bg-sage rounded-lg" style={{ paddingBottom: "133%" }}> {/* 3:4 aspect ratio (taller) */}
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
                    <label htmlFor="custom-map-upload" className="cursor-pointer">
                      <Button
                        size="sm"
                        variant="secondary"
                        type="button"
                        asChild
                      >
                        <span>
                          <FileDown className="w-4 h-4 mr-2" />
                          Upload Map
                        </span>
                      </Button>
                    </label>
                    <input
                      id="custom-map-upload"
                      type="file"
                      accept="image/*"
                      onChange={handleCustomMapUpload}
                      className="sr-only"
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
                      <p className="text-sm text-muted-foreground mb-4">Upload a property map or satellite image</p>
                      <label htmlFor="custom-map-upload-empty" className="cursor-pointer">
                        <Button variant="default" type="button" asChild>
                          <span>
                            <FileDown className="w-4 h-4 mr-2" />
                            Upload Map Image
                          </span>
                        </Button>
                      </label>
                      <input
                        id="custom-map-upload-empty"
                        type="file"
                        accept="image/*"
                        onChange={handleCustomMapUpload}
                        className="sr-only"
                      />
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
                    className={`w-5 h-5 text-primary-foreground transition-transform no-print ${pestsDropdownOpen ? "rotate-180" : ""}`}
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
                    className={`w-5 h-5 text-primary-foreground transition-transform no-print ${productsDropdownOpen ? "rotate-180" : ""}`}
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
                    className={`w-5 h-5 text-primary-foreground transition-transform no-print ${equipmentDropdownOpen ? "rotate-180" : ""}`}
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

            {/* Email & Submit Section */}
            <Card className="print-section p-3 no-print">
              <h2 className="text-lg font-bold mb-3">Send Report to Customer</h2>
              <div className="flex gap-2 mb-3">
                <Input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="Customer email address"
                  className="flex-1"
                />
                <Button onClick={handleSendEmail} disabled={isSendingEmail || !customerEmail} variant="secondary">
                  {isSendingEmail ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Mail className="w-4 h-4 mr-2" />
                      Send
                    </>
                  )}
                </Button>
              </div>
              <Button onClick={handleSubmit} disabled={isSaving} size="lg" className="w-full text-lg py-6">
                {isSaving ? (
                  <>
                    <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5 mr-2" />
                    {reportId ? "Update Report" : "Submit Report"}
                  </>
                )}
              </Button>
            </Card>
          </div>
        </div>
      </div>

      {/* Second Page - Property Images */}
      <div className="print-page-break bg-background">
        <div className={isMobile ? "p-4" : "p-6 max-w-[1800px] mx-auto"}>
          {/* Page Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-border">
            <div className="flex items-center gap-4">
              <img src={crestLogo} alt="Crest Pest Control" className="h-16" />
              <h1 className="text-2xl font-bold text-foreground">Property Images</h1>
            </div>
          </div>

          {/* Upload Section */}
          <div className="no-print mb-6">
            <label htmlFor="property-images-upload" className="cursor-pointer">
              <Button variant="outline" size="lg" type="button" asChild>
                <span>
                  <FileDown className="w-5 h-5 mr-2" />
                  Upload Images (up to 5)
                </span>
              </Button>
            </label>
            <input
              id="property-images-upload"
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handlePropertyImagesUpload}
              className="sr-only"
            />
          </div>

          {/* Property Images Grid */}
          {propertyImages.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {propertyImages.map((item, index) => (
                <div key={index} className="space-y-2">
                  <div className="aspect-square rounded-lg overflow-hidden border-2 border-border bg-muted">
                    <img src={item.image} alt={`Property ${index + 1}`} className="w-full h-full object-cover" />
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
            <div className="text-center py-12 text-muted-foreground">
              <p>No images uploaded yet. Click the button above to upload up to 5 images.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Report;
