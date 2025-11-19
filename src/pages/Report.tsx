import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Home, Share2, Loader2, Send, FileDown, Plus, Minus, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MapCanvas } from "@/components/MapCanvas";
import crestLogo from "@/assets/crest-logo.png";
import { useIsMobile } from "@/hooks/use-mobile";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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
  const { technicianName, customerName, address, notes, screenshots, serviceDate, licenseNumber, targetPests, productsUsed } = location.state || {};
  
  const [extractedAddress, setExtractedAddress] = useState<string>("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editableTech, setEditableTech] = useState(technicianName || "");
  const [editableCustomer, setEditableCustomer] = useState(customerName || "");
  const [editableServiceDate, setEditableServiceDate] = useState(serviceDate || new Date().toISOString().split('T')[0]);
  const [editableLicenseNumber, setEditableLicenseNumber] = useState(licenseNumber || "");
  const [editableTargetPests, setEditableTargetPests] = useState<string[]>(targetPests?.filter((p: string) => p) || []);
  const [editableProductsUsed, setEditableProductsUsed] = useState<string[]>(productsUsed?.filter((p: string) => p) || []);
  const [editableFindings, setEditableFindings] = useState<string[]>([]);
  const [editableRecommendations, setEditableRecommendations] = useState<string[]>([]);
  const [editableNextSteps, setEditableNextSteps] = useState<string[]>([]);
  const [mapData, setMapData] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(20);
  const [staticMapUrl, setStaticMapUrl] = useState<string | null>(null);
  const latestMapDataRef = useRef<string | null>(null);

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
      setEditableRecommendations(analysis.recommendations || []);
      setEditableNextSteps(analysis.nextSteps || []);
    }
  }, [analysis]);

  useEffect(() => {
    latestMapDataRef.current = mapData;
  }, [mapData]);

  // Fetch static 2D satellite map whenever coordinates or zoom change
  useEffect(() => {
    if (coordinates) {
      fetchStaticMap();
    }
  }, [coordinates, zoomLevel]);

  const fetchStaticMap = async () => {
    if (!coordinates) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('static-map', {
        body: {
          lat: coordinates.lat,
          lng: coordinates.lng,
          zoom: zoomLevel,
          width: 1100,
          height: 700,
          marker: '1'
        }
      });

      if (error) {
        console.error('Error fetching static map:', error);
        return;
      }

      if (data?.dataUrl) {
        setStaticMapUrl(data.dataUrl);
      }
    } catch (error) {
      console.error('Error fetching static map:', error);
    }
  };

  const loadReport = async () => {
    if (!reportId) return;
    
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .eq('id', reportId)
        .single();

      if (error) throw error;

      setEditableTech(data.technician_name);
      setEditableCustomer(data.customer_name || "");
      setExtractedAddress(data.address || "");
      setEditableFindings((data.findings as string[]) || []);
      setEditableRecommendations((data.recommendations as string[]) || []);
      setEditableNextSteps((data.next_steps as string[]) || []);
      
      console.log('Loading report map_data:', { 
        hasMapData: !!data.map_data,
        mapDataType: typeof data.map_data,
        mapDataPreview: data.map_data ? JSON.stringify(data.map_data).substring(0, 150) : 'null'
      });
      
      setMapData(data.map_data ? JSON.stringify(data.map_data) : null);
      
      // Extract coordinates from map_url if available, otherwise geocode
      if (data.map_url) {
        const latMatch = data.map_url.match(/mlat=([-\d.]+)/);
        const lngMatch = data.map_url.match(/mlon=([-\d.]+)/);
        if (latMatch && lngMatch) {
          setCoordinates({
            lat: parseFloat(latMatch[1]),
            lng: parseFloat(lngMatch[1])
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

      const { data, error } = await supabase.functions.invoke('extract-address', {
        body: { images: imageDataUrls }
      });

      if (error) {
        console.error('Error extracting address:', error);
        return;
      }

      if (data.address && data.address !== 'Address not found') {
        setExtractedAddress(data.address);
        
        if (data.coordinates) {
          setCoordinates(data.coordinates);
        }
      }
    } catch (error) {
      console.error('Error processing screenshots:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const extractCustomerName = async (imageDataUrls: string[]) => {
    try {
      const { data, error } = await supabase.functions.invoke('extract-customer-info', {
        body: { images: imageDataUrls.slice(0, 3) } // Only use first 3 images
      });
      
      if (!error && data?.customerName) {
        setEditableCustomer(data.customerName);
        toast.success(`Customer name found: ${data.customerName}`);
      }
    } catch (error) {
      console.error('Error extracting customer name:', error);
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

      const { data, error } = await supabase.functions.invoke('analyze-findings', {
        body: { 
          images: imageDataUrls,
          address: extractedAddress || address 
        }
      });

      if (error) {
        console.error('Error analyzing findings:', error);
        return;
      }

      setAnalysis(data);
      toast.success('Report generated!');
    } catch (error) {
      console.error('Error analyzing findings:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const geocodeAddress = async (addr: string) => {
    try {
      const geocodeUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr)}`;
      const response = await fetch(geocodeUrl, {
        headers: {
          'User-Agent': 'PestProReports/1.0'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.length > 0) {
          setCoordinates({
            lat: parseFloat(data[0].lat),
            lng: parseFloat(data[0].lon)
          });
          setExtractedAddress(addr);
        }
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
  };

  const handleSubmit = async () => {
    if (!editableTech) {
      toast.error("Please enter technician name");
      return;
    }

    setIsSaving(true);
    try {
      // Ensure map_data is stored as JSON (object) not a raw string
      const rawMap = latestMapDataRef.current ?? mapData;
      console.log('Submitting report with map data:', { 
        hasRawMap: !!rawMap,
        rawMapLength: rawMap?.length,
        rawMapPreview: rawMap ? rawMap.substring(0, 150) : 'null'
      });
      
      let mapPayload: any = null;
      if (rawMap) {
        try { 
          mapPayload = JSON.parse(rawMap);
          console.log('Parsed map payload:', {
            hasObjects: !!mapPayload.objects,
            objectCount: mapPayload.objects?.objects?.length
          });
        } catch (e) { 
          console.error('Failed to parse map data:', e);
          mapPayload = rawMap; 
        }
      }

      const reportData = {
        technician_name: editableTech,
        customer_name: editableCustomer,
        address: extractedAddress || address,
        notes: notes,
        findings: editableFindings,
        recommendations: editableRecommendations,
        next_steps: editableNextSteps,
        map_url: coordinates ? `https://www.openstreetmap.org/?mlat=${coordinates.lat}&mlon=${coordinates.lng}#map=17/${coordinates.lat}/${coordinates.lng}` : null,
        map_data: mapPayload,
      };

      if (reportId) {
        const { error } = await supabase
          .from('reports')
          .update(reportData)
          .eq('id', reportId);

        if (error) throw error;
        toast.success("Report updated successfully!");
      } else {
        const { error } = await supabase
          .from('reports')
          .insert([reportData]);

        if (error) throw error;
        toast.success("Report submitted successfully!");
        
        setTimeout(() => navigate('/'), 2000);
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
          title: 'Pest Control Report',
          text: `Report for ${editableCustomer || 'Customer'} at ${extractedAddress || address || 'location'}`,
        });
      } catch (error) {
        console.log('Share cancelled');
      }
    } else {
      toast.info("Sharing not supported on this device");
    }
  };

  const exportToPDF = async () => {
    // Use the browser's print-to-PDF which correctly renders the live map iframe + overlay
    try {
      // Hide any toast messages before printing
      const toasts = document.querySelectorAll('[role="status"], .sonner, [data-sonner-toaster]');
      toasts.forEach(toast => {
        (toast as HTMLElement).style.display = 'none';
      });
      
      // Small delay to ensure canvas render completes
      await new Promise((r) => setTimeout(r, 150));
      window.print();
      
      // Restore toasts after print dialog closes
      setTimeout(() => {
        toasts.forEach(toast => {
          (toast as HTMLElement).style.display = '';
        });
      }, 500);
    } catch (e) {
      toast.error('Print failed');
    }
  };

  const displayAddress = extractedAddress || address || "Not provided";
  
  const getStreetAddress = (fullAddress: string) => {
    if (!fullAddress || fullAddress === "Not provided") return "Address";
    const parts = fullAddress.split(',');
    return parts[0].trim();
  };

  const updateItem = (index: number, value: string, setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev => {
      const newArr = [...prev];
      newArr[index] = value;
      return newArr;
    });
  };

  const addItem = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev => [...prev, ""]);
  };

  const mapUrl = staticMapUrl || ""; // Use Mapbox 2D satellite image
 
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 1, 22));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.5, 15));

  // Pan map by pixel amount (approximate Web Mercator math)
  const panBy = (dxPx: number, dyPx: number) => {
    setCoordinates(prev => {
      if (!prev) return prev;
      const latRad = (prev.lat * Math.PI) / 180;
      const metersPerPixel = 156543.03392 * Math.cos(latRad) / Math.pow(2, zoomLevel);
      const metersX = dxPx * metersPerPixel;
      const metersY = dyPx * metersPerPixel;
      const deltaLng = metersX / (111320 * Math.cos(latRad));
      const deltaLat = -metersY / 110540;
      return { lat: prev.lat + deltaLat, lng: prev.lng + deltaLng };
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
                <Button
                  size="sm"
                  variant="default"
                  onClick={exportToPDF}
                  className="h-9"
                >
                  <FileDown className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleShare}
                  className="h-9"
                >
                  <Share2 className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  onClick={() => navigate('/')}
                  variant="outline"
                  className="h-9"
                >
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
              <div className="flex items-start gap-4 flex-1">
                <div className="flex flex-col items-center">
                  <img src={crestLogo} alt="Crest Pest Control" className="h-14 w-auto" />
                  <span className="text-xs text-muted-foreground mt-1">PR #9859</span>
                </div>
                <div className="flex-1">
                  <h1 className="text-xl font-bold text-foreground mb-2">Initial Pest Report - Key Findings & Recommendations</h1>
                  
                  <div className="flex gap-12">
                    <div className="flex-1">
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
                          <span className="text-muted-foreground w-28">Name:</span>
                          <Input
                            value={editableTech}
                            onChange={(e) => setEditableTech(e.target.value)}
                            placeholder="Technician name"
                            className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 text-xs flex-1 focus-visible:ring-0"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground w-28">License Number:</span>
                          <Input
                            value={editableLicenseNumber}
                            onChange={(e) => setEditableLicenseNumber(e.target.value)}
                            placeholder="License #"
                            className="bg-transparent border-b border-border text-foreground placeholder:text-muted-foreground px-1 h-5 text-xs flex-1 focus-visible:ring-0"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 no-print">
                <Button onClick={exportToPDF} variant="default" size="sm">
                  <FileDown className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
                <Button onClick={handleShare} variant="outline" size="sm">
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
                <Button onClick={() => navigate('/')} variant="outline" size="sm">
                  <Home className="w-4 h-4 mr-2" />
                  Home
                </Button>
              </div>
            </div>
            
            {/* Purpose Text */}
            <div className="mt-2 p-2 bg-muted/50 rounded-lg border border-border">
              <p className="text-xs text-foreground leading-tight">
                We appreciate you entrusting Crest with your pest control needs. With mother nature, there is no "one size fits all" approach and there are often a number of factors that lead to increased pest activity. We've created this educational report to help you and your family get one step closer to living a pest-free life. Please give us a call at <span className="font-semibold">949-424-5000</span> if you have any questions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={isMobile ? "flex flex-col" : "print-layout flex h-[calc(100vh-88px)]"}>
        {/* Map Section */}
        <div className={isMobile ? "h-[60vh] relative pb-20" : "print-map-container w-[45%] relative"}>
          {isProcessing && (
            <div className="no-print absolute inset-0 bg-background/80 flex items-center justify-center z-10">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                <p className="text-foreground font-semibold">Processing Map...</p>
              </div>
            </div>
          )}
          
          {mapUrl ? (
            <div className="relative h-full w-full">
              <MapCanvas mapUrl={mapUrl} onSave={setMapData} initialData={mapData} />

              {/* Pan controls */}
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
                  <Button size="icon" variant="secondary" onClick={handleZoomOut} aria-label="Zoom out" title="Zoom out">
                    <Minus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-muted">
              <p className="text-muted-foreground text-center px-4">
                {isProcessing ? "Processing location..." : "No location available"}
              </p>
            </div>
          )}
        </div>

        {/* Report Details Section */}
        <div className={isMobile ? "flex-1 overflow-y-auto pb-32" : "w-[55%] overflow-y-auto"}>
          <div className="p-3 md:p-4 space-y-3">
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

            {/* Target Pest(s) Section */}
            <Card className="print-section p-2 md:p-3">
              <h2 className="print-section-header text-lg md:text-xl font-bold text-foreground mb-2">Target Pest(s)</h2>
              <div className="print-section-content space-y-2">
                <Input
                  value={editableTargetPests[0] || ""}
                  onChange={(e) => {
                    const newPests = [...editableTargetPests];
                    newPests[0] = e.target.value;
                    setEditableTargetPests(newPests);
                  }}
                  placeholder="e.g., Ants, Spiders, Rodents"
                  className="text-sm h-8"
                />
              </div>
            </Card>

            {/* Products Used Section */}
            <Card className="print-section p-2 md:p-3">
              <h2 className="print-section-header text-lg md:text-xl font-bold text-foreground mb-2">Product(s) Used</h2>
              <div className="space-y-2">
                <Input
                  value={editableProductsUsed[0] || ""}
                  onChange={(e) => {
                    const newProducts = [...editableProductsUsed];
                    newProducts[0] = e.target.value;
                    setEditableProductsUsed(newProducts);
                  }}
                  placeholder="e.g., Termidor, Demand CS"
                  className="text-sm h-8"
                />
              </div>
            </Card>

            {/* Findings Section */}
            <Card className="print-section p-2 md:p-3">
              <h2 className="print-section-header text-lg md:text-xl font-bold text-destructive mb-2">Findings & Actions Taken</h2>
              {isAnalyzing ? (
                <div className="text-center py-4">
                  <Loader2 className="w-6 h-6 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Analyzing...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <Textarea
                    value={editableFindings[0] || ""}
                    onChange={(e) => updateItem(0, e.target.value, setEditableFindings)}
                    placeholder="Enter finding or action taken..."
                    className="text-sm resize-y"
                    rows={1}
                  />
                </div>
              )}
            </Card>

            {/* What to Expect Section */}
            <Card className="print-section p-2 md:p-3">
              <h2 className="print-section-header text-lg md:text-xl font-bold text-primary mb-2">What to Expect</h2>
              <div className="space-y-2">
                <Textarea
                  value={editableRecommendations[0] || ""}
                  onChange={(e) => updateItem(0, e.target.value, setEditableRecommendations)}
                  placeholder="Enter what the customer should expect..."
                  className="text-sm resize-y"
                  rows={1}
                />
              </div>
            </Card>

            {/* Our Top Recommendations Section */}
            <Card className="print-section p-2 md:p-3">
              <h2 className="print-section-header text-lg md:text-xl font-bold text-secondary mb-2">Our Top Recommendations</h2>
              <div className="space-y-2">
                <div className="flex gap-2">
                  <span className="font-bold text-base text-foreground pt-1">1.</span>
                  <Textarea
                    value={editableNextSteps[0] || ""}
                    onChange={(e) => updateItem(0, e.target.value, setEditableNextSteps)}
                    placeholder="Enter recommendation..."
                    className="text-sm resize-y flex-1"
                    rows={1}
                  />
                </div>
              </div>
            </Card>

            {/* Submit Button */}
            <div className="">
              <Button
                onClick={handleSubmit}
                disabled={isSaving}
                size="lg"
                className="no-print w-full text-lg py-6"
              >
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
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Report;
