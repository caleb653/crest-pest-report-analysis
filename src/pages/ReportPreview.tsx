import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLocation, useNavigate } from "react-router-dom";
import { Download, Send, Home } from "lucide-react";
import { toast } from "sonner";

const ReportPreview = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { formData } = location.state || {};

  const handleSendToOffice = () => {
    toast.success("Report sent to office for review!");
    navigate('/');
  };

  const handleDownload = () => {
    toast.success("Report downloaded!");
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Report Preview</h1>
            <p className="text-muted-foreground">Review before sending to office</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/')}>
            <Home className="mr-2 w-4 h-4" />
            Home
          </Button>
        </div>

        {/* Report Content */}
        <Card className="shadow-lg mb-6">
          <CardHeader className="bg-gradient-primary text-primary-foreground rounded-t-lg">
            <CardTitle className="text-2xl">Service Report</CardTitle>
          </CardHeader>
          <CardContent className="p-8 space-y-6">
            {/* Customer Information */}
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground mb-1">Customer Name</h3>
                <p className="text-lg">{formData?.customerName || "N/A"}</p>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground mb-1">Property Address</h3>
                <p className="text-lg">{formData?.address || "N/A"}</p>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground mb-1">Service Type</h3>
                <p className="text-lg">{formData?.serviceType || "N/A"}</p>
              </div>
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground mb-1">Technician</h3>
                <p className="text-lg">{formData?.technicianName || "N/A"}</p>
              </div>
            </div>

            {/* Service Notes */}
            {formData?.notes && (
              <div>
                <h3 className="font-semibold text-sm text-muted-foreground mb-2">Service Notes</h3>
                <p className="text-base leading-relaxed">{formData.notes}</p>
              </div>
            )}

            {/* Map Section */}
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">Property Map</h3>
              <div className="bg-muted rounded-lg h-64 flex items-center justify-center border border-border">
                <p className="text-muted-foreground">Map annotation preview</p>
              </div>
            </div>

            {/* Photos Section */}
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">Service Photos</h3>
              <div className="grid grid-cols-3 gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="bg-muted rounded-lg aspect-square flex items-center justify-center border border-border">
                    <p className="text-sm text-muted-foreground">Photo {i}</p>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            variant="outline"
            onClick={handleDownload}
            className="flex-1"
          >
            <Download className="mr-2 w-4 h-4" />
            Download PDF
          </Button>
          <Button
            onClick={handleSendToOffice}
            className="flex-1 bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-md"
          >
            <Send className="mr-2 w-4 h-4" />
            Send to Office
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ReportPreview;
