import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Download, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MapCanvas } from "@/components/MapCanvas";
import crestLogo from "@/assets/crest-logo.png";

interface AnalysisData {
  findings: string[];
  recommendations: string[];
  nextSteps: string[];
}

const Report = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { technicianName, customerName, address, notes, screenshots } = location.state || {};
  
  const [extractedAddress, setExtractedAddress] = useState<string>("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const [reportTitle, setReportTitle] = useState("Pest Control Service Report");
  const [editableTech, setEditableTech] = useState(technicianName || "");
  const [editableCustomer, setEditableCustomer] = useState(customerName || "");
  const [editableFindings, setEditableFindings] = useState<string[]>([]);
  const [editableRecommendations, setEditableRecommendations] = useState<string[]>([]);
  const [editableNextSteps, setEditableNextSteps] = useState<string[]>([]);

  useEffect(() => {
    if (screenshots && screenshots.length > 0) {
      processScreenshots();
      analyzeFindings();
    } else if (address) {
      geocodeAddress(address);
    }
  }, []);

  useEffect(() => {
    if (analysis) {
      setEditableFindings(analysis.findings || []);
      setEditableRecommendations(analysis.recommendations || []);
      setEditableNextSteps(analysis.nextSteps || []);
    }
  }, [analysis]);

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
        toast.error('Failed to analyze findings');
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

  const displayAddress = extractedAddress || address || "Not provided";
  
  // Extract just the street address (first part before comma)
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-primary border-b-4 border-foreground px-8 py-4">
        <div className="max-w-[1800px] mx-auto">
          <div className="flex items-start justify-between">
            {/* Left: Crest Logo */}
            <img src={crestLogo} alt="Crest Pest Control" className="h-16 w-auto" />
            
            {/* Center: Report Title and Customer/Tech Info */}
            <div className="flex-1 px-8 flex items-start gap-8">
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-foreground mb-1">
                  {getStreetAddress(displayAddress)} Service Report
                </h1>
              </div>
              
              {/* Customer and Technician Names - Stacked */}
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
            
            {/* Right: Company Name and Address */}
            <div className="flex flex-col items-end gap-3">
              <div className="text-right">
                <h2 className="text-xl font-bold text-foreground">Crest Pest Control</h2>
                <p className="text-xs text-foreground/70 mt-1">{displayAddress}</p>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => toast.success("Downloaded!")} 
                  className="bg-card text-card-foreground border-2 border-foreground/20 hover:border-foreground/40 font-semibold"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => toast.success("Shared!")} 
                  className="bg-foreground text-background hover:bg-foreground/90 font-semibold"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex h-[calc(100vh-120px)] gap-8 p-8 max-w-[1800px] mx-auto">
        {/* Map Section - Left Half */}
        <div className="w-1/2">
          <div className="h-full bg-primary rounded-2xl shadow-2xl border-4 border-primary p-6">
            <h3 className="text-lg font-bold text-foreground mb-3">Property Satellite View</h3>
            <div className="h-[calc(100%-3rem)] rounded-xl overflow-hidden shadow-lg">
              {isProcessing ? (
                <div className="h-full flex items-center justify-center bg-muted/50">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 mx-auto mb-3 text-foreground animate-spin" />
                    <p className="text-muted-foreground font-medium">Loading map...</p>
                  </div>
                </div>
              ) : coordinates ? (
                <MapCanvas
                  mapUrl={`https://www.google.com/maps/embed/v1/view?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&center=${coordinates.lat},${coordinates.lng}&zoom=23&maptype=satellite`}
                />
              ) : (
                <div className="h-full flex items-center justify-center bg-muted">
                  <p className="text-muted-foreground font-medium">No location available</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Report Sections - Right Half */}
        <div className="w-1/2 overflow-y-auto bg-muted/20 rounded-2xl p-4 space-y-3">
          {isAnalyzing ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-3 text-primary animate-spin" />
                <p className="text-lg font-semibold">Analyzing findings...</p>
              </div>
            </div>
          ) : (
            <>
              {/* Findings Card */}
              <Card className="p-5 shadow-xl border-2 border-border bg-card/95 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-6 bg-destructive rounded-full"></div>
                  <h2 className="text-lg font-bold text-destructive tracking-tight">FINDINGS</h2>
                </div>
                <div className="space-y-2">
                  {editableFindings.map((finding, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-destructive font-bold mt-0.5">•</span>
                      <Textarea
                        value={finding}
                        onChange={(e) => updateItem(i, e.target.value, setEditableFindings)}
                        className="flex-1 border-none bg-transparent px-0 min-h-[2rem] h-auto text-sm leading-snug focus-visible:ring-0 resize-none"
                        placeholder="Brief finding"
                        rows={1}
                        onInput={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addItem(setEditableFindings)}
                    className="text-xs mt-2 hover:bg-destructive/10 text-destructive font-medium h-7"
                  >
                    + Add finding
                  </Button>
                </div>
              </Card>

              {/* Recommendations Card */}
              <Card className="p-5 shadow-xl border-2 border-border bg-card/95 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-6 bg-secondary rounded-full"></div>
                  <h2 className="text-lg font-bold text-secondary tracking-tight">RECOMMENDATIONS</h2>
                </div>
                <div className="space-y-2">
                  {editableRecommendations.map((rec, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-secondary font-bold mt-0.5">•</span>
                      <Textarea
                        value={rec}
                        onChange={(e) => updateItem(i, e.target.value, setEditableRecommendations)}
                        className="flex-1 border-none bg-transparent px-0 min-h-[2rem] h-auto text-sm leading-snug focus-visible:ring-0 resize-none"
                        placeholder="Brief recommendation"
                        rows={1}
                        onInput={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addItem(setEditableRecommendations)}
                    className="text-xs mt-2 hover:bg-secondary/10 text-secondary font-medium h-7"
                  >
                    + Add recommendation
                  </Button>
                </div>
              </Card>

              {/* Next Steps Card */}
              <Card className="p-5 shadow-xl border-2 border-border bg-card/95 backdrop-blur-sm">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-6 bg-primary rounded-full"></div>
                  <h2 className="text-lg font-bold text-primary tracking-tight">NEXT STEPS</h2>
                </div>
                <div className="space-y-2">
                  {editableNextSteps.map((step, i) => (
                    <div key={i} className="flex gap-2 items-start">
                      <span className="text-primary font-bold mt-0.5">•</span>
                      <Textarea
                        value={step}
                        onChange={(e) => updateItem(i, e.target.value, setEditableNextSteps)}
                        className="flex-1 border-none bg-transparent px-0 min-h-[2rem] h-auto text-sm leading-snug focus-visible:ring-0 resize-none"
                        placeholder="Brief next step"
                        rows={1}
                        onInput={(e) => {
                          e.currentTarget.style.height = 'auto';
                          e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addItem(setEditableNextSteps)}
                    className="text-xs mt-2 hover:bg-primary/10 text-primary font-medium h-7"
                  >
                    + Add next step
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Report;
