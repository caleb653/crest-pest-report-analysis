import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            {/* Crest Logo */}
            <img src={crestLogo} alt="Crest Pest Control" className="h-16 w-auto" />
            
            <div className="flex-1">
              <Input
                value={reportTitle}
                onChange={(e) => setReportTitle(e.target.value)}
                className="text-2xl font-bold bg-transparent border-none text-foreground placeholder:text-foreground/70 px-0 h-auto mb-2 focus-visible:ring-0"
              />
              <div className="flex gap-6 text-sm text-foreground/90 font-medium">
                <div className="flex items-center gap-2">
                  <span className="opacity-80">Technician:</span>
                  <Input
                    value={editableTech}
                    onChange={(e) => setEditableTech(e.target.value)}
                    placeholder="Tech name"
                    className="bg-transparent border-b-2 border-foreground/30 text-foreground placeholder:text-foreground/50 px-2 h-6 w-40 focus-visible:ring-0 focus-visible:border-foreground/60"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="opacity-80">Customer:</span>
                  <Input
                    value={editableCustomer}
                    onChange={(e) => setEditableCustomer(e.target.value)}
                    placeholder="Customer name"
                    className="bg-transparent border-b-2 border-foreground/30 text-foreground placeholder:text-foreground/50 px-2 h-6 w-40 focus-visible:ring-0 focus-visible:border-foreground/60"
                  />
                </div>
                <span className="opacity-80">• {displayAddress}</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => navigate('/')} 
              className="bg-card text-card-foreground border-2 border-foreground/20 hover:border-foreground/40 font-semibold"
            >
              <Home className="w-4 h-4 mr-2" />
              New Report
            </Button>
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

      {/* Main Content */}
      <div className="flex h-[calc(100vh-120px)] gap-8 p-8 max-w-[1800px] mx-auto">
        {/* Map Section - Left Half */}
        <div className="w-1/2">
          <div className="h-full bg-card rounded-2xl shadow-2xl border-4 border-foreground p-4">
            {isProcessing ? (
              <div className="h-full flex items-center justify-center bg-muted/50 rounded-xl">
                <div className="text-center">
                  <Loader2 className="w-12 h-12 mx-auto mb-3 text-primary animate-spin" />
                  <p className="text-muted-foreground font-medium">Loading map...</p>
                </div>
              </div>
            ) : coordinates ? (
              <div className="w-full h-full rounded-xl overflow-hidden shadow-lg">
                <MapCanvas
                  mapUrl={`https://www.google.com/maps/embed/v1/view?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&center=${coordinates.lat},${coordinates.lng}&zoom=23&maptype=satellite`}
                />
              </div>
            ) : (
              <div className="h-full flex items-center justify-center bg-muted rounded-xl">
                <p className="text-muted-foreground font-medium">No location available</p>
              </div>
            )}
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
                      <Input
                        value={finding}
                        onChange={(e) => updateItem(i, e.target.value, setEditableFindings)}
                        className="flex-1 border-none bg-transparent px-0 h-auto text-sm leading-snug focus-visible:ring-0"
                        placeholder="Brief finding (10-15 words)"
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
                      <Input
                        value={rec}
                        onChange={(e) => updateItem(i, e.target.value, setEditableRecommendations)}
                        className="flex-1 border-none bg-transparent px-0 h-auto text-sm leading-snug focus-visible:ring-0"
                        placeholder="Brief recommendation (10-15 words)"
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
                      <Input
                        value={step}
                        onChange={(e) => updateItem(i, e.target.value, setEditableNextSteps)}
                        className="flex-1 border-none bg-transparent px-0 h-auto text-sm leading-snug focus-visible:ring-0"
                        placeholder="Brief next step (10-15 words)"
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
