import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Download, Share2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MapCanvas } from "@/components/MapCanvas";

interface AnalysisData {
  findings: string[];
  recommendations: string[];
  areasTreated: string[];
  safetyNotes: string[];
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
  const [editableAreas, setEditableAreas] = useState<string[]>([]);
  const [editableSafety, setEditableSafety] = useState<string[]>([]);

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
      setEditableAreas(analysis.areasTreated || []);
      setEditableSafety(analysis.safetyNotes || []);
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
      <div className="bg-gradient-primary text-primary-foreground px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex-1">
            <Input
              value={reportTitle}
              onChange={(e) => setReportTitle(e.target.value)}
              className="text-2xl font-bold bg-transparent border-none text-primary-foreground placeholder:text-primary-foreground/70 px-0 h-auto mb-2"
            />
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="opacity-90">Technician:</span>
                <Input
                  value={editableTech}
                  onChange={(e) => setEditableTech(e.target.value)}
                  placeholder="Tech name"
                  className="bg-transparent border-b border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/50 px-1 h-6 w-40"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="opacity-90">Customer:</span>
                <Input
                  value={editableCustomer}
                  onChange={(e) => setEditableCustomer(e.target.value)}
                  placeholder="Customer name"
                  className="bg-transparent border-b border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/50 px-1 h-6 w-40"
                />
              </div>
              <span className="opacity-90">• {displayAddress}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/')} className="bg-card text-card-foreground border-none">
              <Home className="w-4 h-4 mr-2" />
              New
            </Button>
            <Button variant="outline" size="sm" onClick={() => toast.success("Downloaded!")} className="bg-card text-card-foreground border-none">
              <Download className="w-4 h-4 mr-2" />
              PDF
            </Button>
            <Button size="sm" onClick={() => toast.success("Shared!")} className="bg-secondary text-secondary-foreground">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-92px)]">
        <div className="w-1/2 relative">
          {isProcessing ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50 z-10">
              <div className="text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-3 text-primary animate-spin" />
                <p className="text-muted-foreground">Loading map...</p>
              </div>
            </div>
          ) : coordinates ? (
            <MapCanvas
              mapUrl={`https://www.google.com/maps/embed/v1/view?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&center=${coordinates.lat},${coordinates.lng}&zoom=22&maptype=satellite`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <p className="text-muted-foreground">No location available</p>
            </div>
          )}
        </div>

        <div className="w-1/2 overflow-y-auto bg-muted/30 p-8 space-y-6">
          {isAnalyzing ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-3 text-primary animate-spin" />
                <p className="text-lg font-medium">Analyzing...</p>
              </div>
            </div>
          ) : (
            <>
              <Card className="p-6 shadow-md">
                <h2 className="text-lg font-bold mb-4 text-destructive">FINDINGS</h2>
                <div className="space-y-2">
                  {editableFindings.map((finding, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-destructive font-bold">•</span>
                      <Input
                        value={finding}
                        onChange={(e) => updateItem(i, e.target.value, setEditableFindings)}
                        className="flex-1 border-none bg-transparent px-0 h-auto text-sm"
                        placeholder="Brief finding (10-15 words)"
                      />
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addItem(setEditableFindings)}
                    className="text-xs"
                  >
                    + Add finding
                  </Button>
                </div>
              </Card>

              <Card className="p-6 shadow-md">
                <h2 className="text-lg font-bold mb-4 text-secondary">RECOMMENDATIONS</h2>
                <div className="space-y-2">
                  {editableRecommendations.map((rec, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-secondary font-bold">•</span>
                      <Input
                        value={rec}
                        onChange={(e) => updateItem(i, e.target.value, setEditableRecommendations)}
                        className="flex-1 border-none bg-transparent px-0 h-auto text-sm"
                        placeholder="Brief recommendation (10-15 words)"
                      />
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addItem(setEditableRecommendations)}
                    className="text-xs"
                  >
                    + Add recommendation
                  </Button>
                </div>
              </Card>

              <Card className="p-6 shadow-md">
                <h2 className="text-lg font-bold mb-4 text-primary">AREAS TREATED</h2>
                <div className="space-y-2">
                  {editableAreas.map((area, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-primary font-bold">•</span>
                      <Input
                        value={area}
                        onChange={(e) => updateItem(i, e.target.value, setEditableAreas)}
                        className="flex-1 border-none bg-transparent px-0 h-auto text-sm"
                        placeholder="Brief area (10-15 words)"
                      />
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addItem(setEditableAreas)}
                    className="text-xs"
                  >
                    + Add area
                  </Button>
                </div>
              </Card>

              <Card className="p-6 shadow-md">
                <h2 className="text-lg font-bold mb-4 text-accent">SAFETY NOTES</h2>
                <div className="space-y-2">
                  {editableSafety.map((note, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="text-accent font-bold">•</span>
                      <Input
                        value={note}
                        onChange={(e) => updateItem(i, e.target.value, setEditableSafety)}
                        className="flex-1 border-none bg-transparent px-0 h-auto text-sm"
                        placeholder="Brief safety note (10-15 words)"
                      />
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addItem(setEditableSafety)}
                    className="text-xs"
                  >
                    + Add note
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
