import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Home, Share2, Loader2, Send, FileDown } from "lucide-react";
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
  const { technicianName, customerName, address, notes, screenshots } = location.state || {};
  
  const [extractedAddress, setExtractedAddress] = useState<string>("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [editableTech, setEditableTech] = useState(technicianName || "");
  const [editableCustomer, setEditableCustomer] = useState(customerName || "");
  const [editableFindings, setEditableFindings] = useState<string[]>([]);
  const [editableRecommendations, setEditableRecommendations] = useState<string[]>([]);
  const [editableNextSteps, setEditableNextSteps] = useState<string[]>([]);
  const [mapData, setMapData] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(21);
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
      
      if (data.address) {
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
    toast.info("Generating PDF...");

    try {
      // Create branded PDF container
      const pdfContent = document.createElement('div');
      pdfContent.style.cssText = `
        position: absolute;
        left: -9999px;
        width: 1700px;
        background: #FFFFFF;
        padding: 50px;
        font-family: 'Space Grotesk', 'Helvetica Neue', Arial, sans-serif;
      `;

      // Base layout (no tool buttons included)
      pdfContent.innerHTML = `
        <div style="margin-bottom: 30px;">
          <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 4px solid #C3D1C5; margin-bottom: 20px;">
            <div>
              <div style="font-size: 32px; font-weight: 700; color: #2A2A2A; letter-spacing: -0.5px; margin-bottom: 4px;">
                ${getStreetAddress(displayAddress)}
              </div>
              <div style="font-size: 18px; color: #95A197; font-weight: 600; letter-spacing: 0.5px;">
                PEST CONTROL REPORT
              </div>
            </div>
            <div style="text-align: right;">
              <div style="font-size: 14px; color: #2A2A2A; line-height: 1.6;">
                <div style="margin-bottom: 4px;"><strong style="color: #95A197;">Date:</strong> ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
                <div style="margin-bottom: 4px;"><strong style="color: #95A197;">Technician:</strong> ${editableTech || 'N/A'}</div>
                <div><strong style="color: #95A197;">Customer:</strong> ${editableCustomer || 'N/A'}</div>
              </div>
            </div>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: 40% 58%; gap: 2%; align-items: start;">
          <div>
            <div style="background: #F2F2F2; border: 3px solid #C3D1C5; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(195, 209, 197, 0.25);">
              <div id="map-placeholder" style="width: 100%; height: 700px; position: relative; background: #f5f5f5;">
                <!-- Map will be injected here as image(s) -->
              </div>
            </div>
          </div>

          <div>
            <div style="margin-bottom: 32px;">
              <div style="background: linear-gradient(135deg, #C3D1C5 0%, #95A197 100%); color: white; padding: 12px 16px; border-radius: 8px 8px 0 0; margin-bottom: 0;">
                <h2 style="font-size: 20px; font-weight: 700; margin: 0; letter-spacing: 0.3px;">FINDINGS / ACTIVITY DETECTED</h2>
              </div>
              <div style="background: #F2F2F2; padding: 20px; border-radius: 0 0 8px 8px; border: 2px solid #C3D1C5; border-top: none;">
                <ul style="margin: 0; padding-left: 24px; line-height: 1.8; font-size: 14px; color: #2A2A2A;">
                  ${editableFindings.filter(f => f.trim()).map(f => `<li style="margin-bottom: 10px;">${f}</li>`).join('') || '<li style="color: #95A197; font-style: italic;">No findings recorded</li>'}
                </ul>
              </div>
            </div>

            <div style="margin-bottom: 32px;">
              <div style="background: linear-gradient(135deg, #95A197 0%, #C3D1C5 100%); color: white; padding: 12px 16px; border-radius: 8px 8px 0 0; margin-bottom: 0;">
                <h2 style="font-size: 20px; font-weight: 700; margin: 0; letter-spacing: 0.3px;">RECOMMENDATIONS</h2>
              </div>
              <div style="background: #F2F2F2; padding: 20px; border-radius: 0 0 8px 8px; border: 2px solid #95A197; border-top: none;">
                <ul style="margin: 0; padding-left: 24px; line-height: 1.8; font-size: 14px; color: #2A2A2A;">
                  ${editableRecommendations.filter(r => r.trim()).map(r => `<li style="margin-bottom: 10px;">${r}</li>`).join('') || '<li style="color: #95A197; font-style: italic;">No recommendations provided</li>'}
                </ul>
              </div>
            </div>

            <div>
              <div style="background: linear-gradient(135deg, #2A2A2A 0%, #95A197 100%); color: white; padding: 12px 16px; border-radius: 8px 8px 0 0; margin-bottom: 0;">
                <h2 style="font-size: 20px; font-weight: 700; margin: 0; letter-spacing: 0.3px;">NEXT STEPS</h2>
              </div>
              <div style="background: #F2F2F2; padding: 20px; border-radius: 0 0 8px 8px; border: 2px solid #2A2A2A; border-top: none;">
                <ul style="margin: 0; padding-left: 24px; line-height: 1.8; font-size: 14px; color: #2A2A2A;">
                  ${editableNextSteps.filter(n => n.trim()).map(n => `<li style="margin-bottom: 10px;">${n}</li>`).join('') || '<li style="color: #95A197; font-style: italic;">No next steps specified</li>'}
                </ul>
              </div>
            </div>

            <div style="margin-top: 32px; padding-top: 20px; border-top: 2px solid #C3D1C5; text-align: center;">
              <div style="font-size: 13px; color: #95A197; font-weight: 600; letter-spacing: 0.8px;">CREST PEST CONTROL</div>
              <div style="font-size: 11px; color: #2A2A2A; margin-top: 6px;">PR #9859</div>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(pdfContent);

      // Compose MAP: static basemap (fetched to data URL) + overlay canvas image
      const mapPlaceholder = pdfContent.querySelector('#map-placeholder') as HTMLElement | null;
      if (mapPlaceholder) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'position: relative; width: 100%; height: 100%;';

        let baseDataUrl: string | null = null;
        // Determine coordinates: use existing or geocode on the fly
        let localCoords = coordinates as { lat: number; lng: number } | null;
        if (!localCoords && displayAddress && displayAddress !== 'Not provided') {
          try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(displayAddress)}`, { headers: { 'User-Agent': 'PestProReports/1.0' } });
            if (geoRes.ok) {
              const g = await geoRes.json();
              if (g && g.length > 0) localCoords = { lat: parseFloat(g[0].lat), lng: parseFloat(g[0].lon) };
            }
          } catch (e) {
            console.error('On-the-fly geocoding failed', e);
          }
        }

        if (localCoords) {
          const width = 1100; // slightly narrower to reduce horizontal stretch
          const height = 700;
          try {
            const baseUrl = import.meta.env.VITE_SUPABASE_URL;
            const effectiveZoom = Math.min(zoomLevel, 18);
            const fnUrl = `${baseUrl}/functions/v1/static-map?lat=${localCoords.lat}&lng=${localCoords.lng}&zoom=${effectiveZoom}&width=${width}&height=${height}&marker=1`;
            const resp = await fetch(fnUrl);
            if (resp.ok) {
              const data = await resp.json();
              baseDataUrl = data?.dataUrl || null;
            } else {
              const text = await resp.text();
              console.error('Static map function HTTP error', resp.status, text);
            }
          } catch (e) {
            console.error('Static map function failed, using placeholder', e);
          }
        }

        const baseImg = document.createElement('img');
        baseImg.src = baseDataUrl || `data:image/svg+xml;utf8,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="780"><rect width="100%" height="100%" fill="#f5f5f5"/></svg>')}`;
        baseImg.style.cssText = 'width: 100%; height: 100%; object-fit: cover; display: block;';
        wrapper.appendChild(baseImg);

        const overlayCanvas = document.getElementById('map-overlay-canvas') as HTMLCanvasElement | null;
        if (overlayCanvas) {
          const overlayImg = document.createElement('img');
          overlayImg.src = overlayCanvas.toDataURL('image/png');
          overlayImg.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none;';
          wrapper.appendChild(overlayImg);
        }

        mapPlaceholder.appendChild(wrapper);
        await new Promise(resolve => {
          if (baseImg.complete) resolve(null);
          else baseImg.onload = () => resolve(null);
        });
      }

      // Render to canvas and save as PDF
      await new Promise(r => setTimeout(r, 200));
      const canvas = await html2canvas(pdfContent, {
        scale: 2,
        logging: false,
        backgroundColor: '#FFFFFF',
        useCORS: true,
        allowTaint: true,
      });

      document.body.removeChild(pdfContent);

      const imgData = canvas.toDataURL('image/png', 1.0);
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [canvas.width / 2, canvas.height / 2], compress: true });
      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width / 2, canvas.height / 2, '', 'FAST');
      const filename = `Crest-Report-${getStreetAddress(displayAddress).replace(/[^a-zA-Z0-9]/g, '-')}-${new Date().toISOString().split('T')[0]}.pdf`;
      pdf.save(filename);
      toast.success('PDF exported successfully!');
    } catch (error: any) {
      console.error('PDF export error:', error);
      toast.error('Failed to generate PDF: ' + (error?.message || 'Unknown error'));
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

  const mapUrl = coordinates 
    ? `https://maps.google.com/maps?ll=${coordinates.lat},${coordinates.lng}&t=k&z=${zoomLevel}&output=embed`
    : "";

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 1, 22));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 1, 15));

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Header */}
      {isMobile && (
        <div className="bg-gradient-primary border-b-2 border-foreground px-4 py-3 sticky top-0 z-20">
          <div className="flex items-center justify-between">
            <img src={crestLogo} alt="Crest" className="h-10" />
            <div className="flex gap-2">
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
        <div className="bg-gradient-primary border-b-4 border-foreground px-6 py-4">
          <div className="max-w-[1800px] mx-auto">
            <div className="flex items-start justify-between">
              <img src={crestLogo} alt="Crest Pest Control" className="h-16 w-auto" />
              
              <div className="flex-1 px-8 flex items-start gap-8">
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-foreground mb-1">
                    {getStreetAddress(displayAddress)} Pest Control Analysis
                  </h1>
                </div>
                
                <div className="flex flex-col gap-2 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground/80 font-medium">Customer:</span>
                    <Input
                      value={editableCustomer}
                      onChange={(e) => setEditableCustomer(e.target.value)}
                      placeholder="Customer name"
                      className="bg-transparent border-b-2 border-foreground/30 text-foreground placeholder:text-foreground/50 px-2 h-6 text-sm flex-1 focus-visible:ring-0 focus-visible:border-foreground/60"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-foreground/80 font-medium">Technician:</span>
                    <Input
                      value={editableTech}
                      onChange={(e) => setEditableTech(e.target.value)}
                      placeholder="Tech name"
                      className="bg-transparent border-b-2 border-foreground/30 text-foreground placeholder:text-foreground/50 px-2 h-6 text-sm flex-1 focus-visible:ring-0 focus-visible:border-foreground/60"
                    />
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3">
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
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={isMobile ? "flex flex-col" : "flex h-[calc(100vh-88px)]"}>
        {/* Map Section */}
        <div className={isMobile ? "h-[60vh] relative" : "w-1/2 relative"}>
          {isProcessing && (
            <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-10">
              <div className="text-center">
                <Loader2 className="w-12 h-12 animate-spin text-primary mx-auto mb-4" />
                <p className="text-foreground font-semibold">Processing Map...</p>
              </div>
            </div>
          )}
          
          {mapUrl ? (
            <div className="relative h-full">
              <iframe
                src={mapUrl}
                className="absolute inset-0 w-full h-full"
                frameBorder="0"
                scrolling="no"
              />
              <div className="absolute inset-0">
                <MapCanvas mapUrl={mapUrl} onSave={setMapData} initialData={mapData} />
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
        <div className={isMobile ? "flex-1 overflow-y-auto" : "w-1/2 overflow-y-auto"}>
          <div className="p-4 md:p-6 space-y-6 pb-24">
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

            {/* Findings Section */}
            <Card className="p-4 md:p-6">
              <h2 className="text-xl md:text-2xl font-bold text-destructive mb-4">Findings / Actions Taken</h2>
              {isAnalyzing ? (
                <div className="text-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Analyzing...</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {editableFindings.map((finding, index) => (
                    <Textarea
                      key={index}
                      value={finding}
                      onChange={(e) => updateItem(index, e.target.value, setEditableFindings)}
                      placeholder="Enter finding..."
                      className="min-h-[60px] text-base resize-none"
                    />
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => addItem(setEditableFindings)}
                    className="w-full"
                  >
                    + Add Finding
                  </Button>
                </div>
              )}
            </Card>

            {/* Recommendations Section */}
            <Card className="p-4 md:p-6">
              <h2 className="text-xl md:text-2xl font-bold text-primary mb-4">Recommendations</h2>
              <div className="space-y-3">
                {editableRecommendations.map((rec, index) => (
                  <Textarea
                    key={index}
                    value={rec}
                    onChange={(e) => updateItem(index, e.target.value, setEditableRecommendations)}
                    placeholder="Enter recommendation..."
                    className="min-h-[60px] text-base resize-none"
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addItem(setEditableRecommendations)}
                  className="w-full"
                >
                  + Add Recommendation
                </Button>
              </div>
            </Card>

            {/* Next Steps Section */}
            <Card className="p-4 md:p-6">
              <h2 className="text-xl md:text-2xl font-bold text-secondary mb-4">Next Steps</h2>
              <div className="space-y-3">
                {editableNextSteps.map((step, index) => (
                  <Textarea
                    key={index}
                    value={step}
                    onChange={(e) => updateItem(index, e.target.value, setEditableNextSteps)}
                    placeholder="Enter next step..."
                    className="min-h-[60px] text-base resize-none"
                  />
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addItem(setEditableNextSteps)}
                  className="w-full"
                >
                  + Add Next Step
                </Button>
              </div>
            </Card>

            {/* Submit Button */}
            <Button
              onClick={handleSubmit}
              disabled={isSaving}
              size="lg"
              className="w-full text-lg py-6"
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
  );
};

export default Report;
