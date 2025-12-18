import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { LogOut, FileText, Calendar, User, Trash2 } from "lucide-react";
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
  const [isValidating, setIsValidating] = useState(true);

  useEffect(() => {
    validateAndLoad();
  }, []);

  const validateAndLoad = async () => {
    const isValid = await validateSession();
    if (isValid) {
      await loadReports();
    }
    setIsValidating(false);
  };

  const validateSession = async (): Promise<boolean> => {
    const sessionToken = localStorage.getItem('admin_session');
    
    if (!sessionToken) {
      toast.error("Please sign in");
      navigate('/admin-login');
      return false;
    }

    try {
      // Validate session server-side
      const { data, error } = await supabase.functions.invoke('validate-admin-session', {
        body: { sessionToken }
      });

      if (error || !data?.valid) {
        localStorage.removeItem('admin_session');
        toast.error("Session expired. Please sign in again.");
        navigate('/admin-login');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      localStorage.removeItem('admin_session');
      toast.error("Authentication failed. Please sign in again.");
      navigate('/admin-login');
      return false;
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
    const sessionToken = localStorage.getItem('admin_session');
    
    // Invalidate session server-side
    if (sessionToken) {
      try {
        await supabase.functions.invoke('invalidate-admin-session', {
          body: { sessionToken }
        });
      } catch (error) {
        console.error('Error invalidating session:', error);
      }
    }
    
    localStorage.removeItem('admin_session');
    toast.success("Signed out successfully");
    navigate('/');
  };

  const viewReport = (reportId: string) => {
    navigate(`/report/${reportId}`);
  };

  const handleDelete = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    if (!confirm("Are you sure you want to delete this report? This action cannot be undone.")) {
      return;
    }

    // Validate session before delete
    const isValid = await validateSession();
    if (!isValid) return;

    try {
      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;
      
      toast.success("Report deleted successfully");
      loadReports(); // Reload the reports list
    } catch (error: any) {
      toast.error("Failed to delete report");
      console.error(error);
    }
  };

  if (isValidating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Validating session...</p>
        </div>
      </div>
    );
  }

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
                      <div className="flex items-start justify-between gap-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 flex-1">
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => handleDelete(report.id, e)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                          title="Delete report"
                        >
                          <Trash2 className="w-5 h-5" />
                        </Button>
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
