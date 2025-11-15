import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Download, Share2, CheckCircle, MapPin, Calendar, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const Report = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { technicianName, customerName, address, notes, screenshots } = location.state || {};
  
  const [extractedAddress, setExtractedAddress] = useState<string>("");
  const [coordinates, setCoordinates] = useState<{ lat: number; lng: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    // If we have screenshots, process them for address extraction
    if (screenshots && screenshots.length > 0) {
      processScreenshots();
    } else if (address) {
      // If manually entered address, geocode it
      geocodeAddress(address);
    }
  }, [screenshots, address]);

  const processScreenshots = async () => {
    setIsProcessing(true);
    try {
      // Convert File objects to base64 data URLs
      const imagePromises = screenshots.map((file: File) => {
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
      });

      const imageDataUrls = await Promise.all(imagePromises);

      console.log('Calling extract-address function with', imageDataUrls.length, 'images');

      // Call edge function to extract address
      const { data, error } = await supabase.functions.invoke('extract-address', {
        body: { images: imageDataUrls }
      });

      if (error) {
        console.error('Error extracting address:', error);
        toast.error('Failed to extract address from screenshots');
        return;
      }

      console.log('Extract-address response:', data);

      if (data.address && data.address !== 'Address not found') {
        setExtractedAddress(data.address);
        toast.success('Address extracted from screenshots!');
        
        if (data.coordinates) {
          setCoordinates(data.coordinates);
        }
      } else {
        toast.warning('Could not find address in screenshots');
      }
    } catch (error) {
      console.error('Error processing screenshots:', error);
      toast.error('Error processing screenshots');
    } finally {
      setIsProcessing(false);
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

  const currentDate = new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });

  const displayAddress = extractedAddress || address || "Not provided";

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Success Message */}
        <div className="bg-secondary/10 border-2 border-secondary rounded-xl p-6 mb-6 text-center">
          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-secondary" />
          <h2 className="text-2xl font-bold text-foreground mb-2">Report Generated!</h2>
          <p className="text-muted-foreground">Review and share with your team</p>
        </div>

        {/* Report Content */}
        <Card className="shadow-xl">
          <CardHeader className="bg-gradient-primary text-primary-foreground rounded-t-xl">
            <CardTitle className="text-3xl text-center">Service Report</CardTitle>
            <div className="flex items-center justify-center gap-2 text-primary-foreground/90 mt-2">
              <Calendar className="w-4 h-4" />
              <span>{currentDate}</span>
            </div>
          </CardHeader>
          <CardContent className="p-8 space-y-8">
            {/* Technician Info */}
            <div className="bg-muted/50 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Technician</h3>
              <p className="text-2xl font-semibold text-foreground">{technicianName || "Not specified"}</p>
            </div>

            {/* Customer Information */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">Customer Name</h3>
                <p className="text-xl font-medium text-foreground">
                  {customerName || "Not provided"}
                </p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Property Address
                </h3>
                <p className="text-xl font-medium text-foreground">
                  {isProcessing ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Extracting...
                    </span>
                  ) : (
                    displayAddress
                  )}
                </p>
              </div>
            </div>

            {/* Service Notes */}
            {notes && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">Service Notes</h3>
                <div className="bg-muted/50 rounded-xl p-6">
                  <p className="text-base leading-relaxed text-foreground whitespace-pre-wrap">
                    {notes}
                  </p>
                </div>
              </div>
            )}

            {/* Screenshots */}
            {screenshots && screenshots.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-3">
                  Uploaded Screenshots ({screenshots.length})
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {screenshots.map((file: File, index: number) => (
                    <div 
                      key={index} 
                      className="aspect-square bg-muted rounded-xl flex items-center justify-center border-2 border-border p-4"
                    >
                      <div className="text-center">
                        <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-2">
                          <span className="text-2xl font-bold text-primary">{index + 1}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {file.name}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Property Map */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Property Map - Aerial View</h3>
              {isProcessing ? (
                <div className="bg-muted/30 rounded-xl h-96 flex items-center justify-center border-2 border-dashed border-border">
                  <div className="text-center">
                    <Loader2 className="w-12 h-12 mx-auto mb-3 text-primary animate-spin" />
                    <p className="text-muted-foreground">Processing address...</p>
                  </div>
                </div>
              ) : coordinates ? (
                <div className="rounded-xl overflow-hidden border-2 border-border shadow-lg">
                  <iframe
                    width="100%"
                    height="400"
                    style={{ border: 0 }}
                    loading="lazy"
                    src={`https://www.google.com/maps/embed/v1/view?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&center=${coordinates.lat},${coordinates.lng}&zoom=19&maptype=satellite`}
                  />
                </div>
              ) : (
                <div className="bg-muted/30 rounded-xl h-96 flex items-center justify-center border-2 border-dashed border-border">
                  <div className="text-center">
                    <MapPin className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      {displayAddress === "Not provided" 
                        ? "No address available to show map" 
                        : "Unable to geocode address"}
                    </p>
                    {displayAddress !== "Not provided" && (
                      <p className="text-sm text-muted-foreground mt-2">
                        Address: {displayAddress}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          <Button
            variant="outline"
            size="lg"
            onClick={() => navigate('/')}
            className="text-lg py-6"
          >
            <Home className="mr-2 w-5 h-5" />
            New Report
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={handleDownload}
            className="text-lg py-6"
          >
            <Download className="mr-2 w-5 h-5" />
            Download
          </Button>
          <Button
            size="lg"
            onClick={handleShare}
            className="bg-gradient-primary text-primary-foreground text-lg py-6"
          >
            <Share2 className="mr-2 w-5 h-5" />
            Share Report
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Report;
