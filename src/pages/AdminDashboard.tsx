import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { LogOut, FileText, Calendar, User } from "lucide-react";
import crestLogo from "@/assets/crest-logo-black.png";

interface Report {
  id: string;
  technician_name: string;
  customer_name: string;
  address: string;
  created_at: string;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
    loadReports();
  }, []);

  const checkAuth = async () => {
    const sessionToken = localStorage.getItem('admin_session');
    
    if (!sessionToken) {
      toast.error("Please sign in");
      navigate('/admin-login');
      return;
    }
  };

  const loadReports = async () => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('id, technician_name, customer_name, address, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error: any) {
      toast.error("Failed to load reports");
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    localStorage.removeItem('admin_session');
    toast.success("Signed out successfully");
    navigate('/');
  };

  const viewReport = (reportId: string) => {
    navigate(`/report/${reportId}`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={crestLogo} alt="Crest Logo" className="h-12" />
            <h1 className="text-xl md:text-2xl font-bold">Admin Dashboard</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="flex items-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 md:py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">All Reports</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading reports...</div>
            ) : reports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No reports submitted yet
              </div>
            ) : (
              <div className="grid gap-4">
                {reports.map((report) => (
                  <Card
                    key={report.id}
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => viewReport(report.id)}
                  >
                    <CardContent className="p-4 md:p-6">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                        <div className="flex items-center gap-2">
                          <User className="w-5 h-5 text-primary flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">Technician</div>
                            <div className="font-semibold truncate">{report.technician_name}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">Customer</div>
                            <div className="font-semibold truncate">
                              {report.customer_name || "N/A"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Calendar className="w-5 h-5 text-primary flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-xs text-muted-foreground">Date</div>
                            <div className="font-semibold truncate">
                              {new Date(report.created_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>
                      </div>
                      {report.address && (
                        <div className="mt-3 text-sm text-muted-foreground truncate">
                          {report.address}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default AdminDashboard;
