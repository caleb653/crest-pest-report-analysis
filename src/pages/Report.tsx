import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Download, Share2, Loader2, Edit3, Save } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

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
  
  // Editable fields
  const [editableFindings, setEditableFindings] = useState<string[]>([]);
  const [editableRecommendations, setEditableRecommendations] = useState<string[]>([]);
  const [editableAreas, setEditableAreas] = useState<string[]>([]);
  const [editableSafety, setEditableSafety] = useState<string[]>([]);
  const [editMode, setEditMode] = useState(false);

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
      toast.success('Report generated successfully!');
    } catch (error) {
      console.error('Error analyzing findings:', error);
      toast.error('Error generating report');
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

  const handleShare = () => {
    toast.success("Report shared successfully!");
  };

  const handleDownload = () => {
    toast.success("Report downloaded!");
  };

  const displayAddress = extractedAddress || address || "Not provided";

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-gradient-primary text-primary-foreground px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Pest Control Service Report</h1>
            <p className="text-sm opacity-90">Technician: {technicianName || "Not specified"} • {displayAddress}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate('/')} className="bg-card text-card-foreground border-none">
              <Home className="w-4 h-4 mr-2" />
              New Report
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} className="bg-card text-card-foreground border-none">
              <Download className="w-4 h-4 mr-2" />
              Download
            </Button>
            <Button size="sm" onClick={handleShare} className="bg-secondary text-secondary-foreground">
              <Share2 className="w-4 h-4 mr-2" />
              Share
            </Button>
          </div>
        </div>
      </div>

      {/* Main Content - Split Screen */}
      <div className="flex h-[calc(100vh-80px)]">
        {/* Left Side - Map */}
        <div className="w-1/2 relative">
          {isProcessing ? (
            <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
              <div className="text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-3 text-primary animate-spin" />
                <p className="text-muted-foreground">Loading map...</p>
              </div>
            </div>
          ) : coordinates ? (
            <iframe
              className="w-full h-full"
              style={{ border: 0 }}
              loading="lazy"
              src={`https://www.google.com/maps/embed/v1/view?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&center=${coordinates.lat},${coordinates.lng}&zoom=21&maptype=satellite`}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-muted">
              <p className="text-muted-foreground">No location data available</p>
            </div>
          )}
        </div>

        {/* Right Side - Findings & Recommendations */}
        <div className="w-1/2 overflow-y-auto bg-muted/30 p-6 space-y-4">
          {isAnalyzing ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <Loader2 className="w-12 h-12 mx-auto mb-3 text-primary animate-spin" />
                <p className="text-lg font-medium">Analyzing screenshots...</p>
                <p className="text-sm text-muted-foreground">Generating findings and recommendations</p>
              </div>
            </div>
          ) : analysis ? (
            <>
              {/* Edit Mode Toggle */}
              <div className="flex justify-end">
                <Button
                  variant={editMode ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditMode(!editMode)}
                >
                  {editMode ? <Save className="w-4 h-4 mr-2" /> : <Edit3 className="w-4 h-4 mr-2" />}
                  {editMode ? "Save Changes" : "Edit Report"}
                </Button>
              </div>

              {/* Findings */}
              <Card className="p-4">
                <h2 className="text-lg font-bold mb-3 text-destructive">FINDINGS</h2>
                <div className="space-y-2">
                  {editMode ? (
                    <Textarea
                      value={editableFindings.join('\n')}
                      onChange={(e) => setEditableFindings(e.target.value.split('\n'))}
                      rows={5}
                      className="font-mono text-sm"
                    />
                  ) : (
                    <ul className="list-disc pl-5 space-y-1">
                      {editableFindings.map((finding, i) => (
                        <li key={i} className="text-sm">{finding}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>

              {/* Recommendations */}
              <Card className="p-4">
                <h2 className="text-lg font-bold mb-3 text-secondary">RECOMMENDATIONS</h2>
                <div className="space-y-2">
                  {editMode ? (
                    <Textarea
                      value={editableRecommendations.join('\n')}
                      onChange={(e) => setEditableRecommendations(e.target.value.split('\n'))}
                      rows={5}
                      className="font-mono text-sm"
                    />
                  ) : (
                    <ul className="list-disc pl-5 space-y-1">
                      {editableRecommendations.map((rec, i) => (
                        <li key={i} className="text-sm">{rec}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>

              {/* Areas Treated */}
              <Card className="p-4">
                <h2 className="text-lg font-bold mb-3 text-primary">AREAS TREATED</h2>
                <div className="space-y-2">
                  {editMode ? (
                    <Textarea
                      value={editableAreas.join('\n')}
                      onChange={(e) => setEditableAreas(e.target.value.split('\n'))}
                      rows={4}
                      className="font-mono text-sm"
                    />
                  ) : (
                    <ul className="list-disc pl-5 space-y-1">
                      {editableAreas.map((area, i) => (
                        <li key={i} className="text-sm">{area}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>

              {/* Safety Notes */}
              <Card className="p-4">
                <h2 className="text-lg font-bold mb-3 text-accent">SAFETY NOTES</h2>
                <div className="space-y-2">
                  {editMode ? (
                    <Textarea
                      value={editableSafety.join('\n')}
                      onChange={(e) => setEditableSafety(e.target.value.split('\n'))}
                      rows={3}
                      className="font-mono text-sm"
                    />
                  ) : (
                    <ul className="list-disc pl-5 space-y-1">
                      {editableSafety.map((note, i) => (
                        <li key={i} className="text-sm">{note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </Card>

              {/* Additional Notes */}
              {notes && (
                <Card className="p-4">
                  <h2 className="text-lg font-bold mb-3">TECHNICIAN NOTES</h2>
                  <p className="text-sm whitespace-pre-wrap">{notes}</p>
                </Card>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center py-20">
              <p className="text-muted-foreground">No analysis data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Report;
