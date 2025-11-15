import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation, useNavigate } from "react-router-dom";
import { Home, Download, Share2, CheckCircle, MapPin, Calendar } from "lucide-react";
import { toast } from "sonner";

const Report = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { technicianName, customerName, address, notes, screenshots } = location.state || {};

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
                  {address || "Not provided"}
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

            {/* Property Map Placeholder */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground mb-3">Property Map</h3>
              <div className="bg-muted/30 rounded-xl h-64 flex items-center justify-center border-2 border-dashed border-border">
                <div className="text-center">
                  <MapPin className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Map integration coming soon
                  </p>
                  {address && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Location: {address}
                    </p>
                  )}
                </div>
              </div>
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
