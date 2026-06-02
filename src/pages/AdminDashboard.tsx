import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Calendar, CheckCircle, ClipboardList, FileText, LogOut, MapPin, PenSquare, Trash2, User } from "lucide-react";
import crestLogo from "@/assets/crest-logo-black.png";

type ReportType = "sales" | "initial";

type Filter = "all" | ReportType;

interface ReportListItem {
  id: string;
  technician_name: string;
  customer_name: string | null;
  address: string | null;
  created_at: string;
  report_type: ReportType;
  is_signed: boolean;
}

const AdminDashboard = () => {
  const navigate = useNavigate();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    validateAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateAndLoad = async () => {
    const isValid = await validateSession();
    if (isValid) {
      await loadReports();
    }
    setIsValidating(false);
  };

  const validateSession = async (): Promise<boolean> => {
    const sessionToken = localStorage.getItem("admin_session");

    if (!sessionToken) {
      toast.error("Please sign in");
      navigate("/admin-login");
      return false;
    }

    try {
      const { data, error } = await supabase.functions.invoke("validate-admin-session", {
        body: { sessionToken },
      });

      if (error || !data?.valid) {
        localStorage.removeItem("admin_session");
        toast.error("Session expired. Please sign in again.");
        navigate("/admin-login");
        return false;
      }

      return true;
    } catch (error) {
      console.error("Session validation error:", error);
      localStorage.removeItem("admin_session");
      toast.error("Authentication failed. Please sign in again.");
      navigate("/admin-login");
      return false;
    }
  };

  const loadReports = async () => {
    setLoading(true);

    try {
      const sessionToken = localStorage.getItem("admin_session");
      if (!sessionToken) throw new Error("Missing admin session");

      const { data, error } = await supabase.functions.invoke("admin-reports", {
        body: { sessionToken, action: "list" },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Failed to load reports");

      setReports((data.reports as ReportListItem[]) || []);
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to load reports");
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    const sessionToken = localStorage.getItem("admin_session");

    if (sessionToken) {
      try {
        await supabase.functions.invoke("invalidate-admin-session", {
          body: { sessionToken },
        });
      } catch (error) {
        console.error("Error invalidating session:", error);
      }
    }

    localStorage.removeItem("admin_session");
    toast.success("Signed out successfully");
    navigate("/");
  };

  const viewReport = (report: ReportListItem) => {
    const path = report.report_type === "initial" ? `/initial-pest-report/${report.id}` : `/report/${report.id}`;
    navigate(path);
  };

  const handleDelete = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm("Are you sure you want to delete this report? This action cannot be undone.")) {
      return;
    }

    const isValid = await validateSession();
    if (!isValid) return;

    try {
      const sessionToken = localStorage.getItem("admin_session");
      if (!sessionToken) throw new Error("Missing admin session");

      const { data, error } = await supabase.functions.invoke("admin-reports", {
        body: { sessionToken, action: "delete", reportId },
      });

      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Delete failed");

      toast.success("Report deleted successfully");
      await loadReports();
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to delete report");
    }
  };

  const counts = useMemo(() => {
    const sales = reports.filter((r) => r.report_type === "sales").length;
    const initial = reports.filter((r) => r.report_type === "initial").length;
    return { all: reports.length, sales, initial };
  }, [reports]);

  const visibleReports = useMemo(() => {
    if (filter === "all") return reports;
    return reports.filter((r) => r.report_type === filter);
  }, [filter, reports]);

  if (isValidating) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4" />
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
            <img src={crestLogo} alt="Crest Pest Control admin portal logo" className="h-12" />
            <h1 className="text-xl md:text-2xl font-bold">Admin Dashboard</h1>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="flex items-center gap-2">
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 md:py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Scheduling Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Button
                variant="outline"
                className="h-auto py-4 px-4 flex-col items-start gap-1 text-left"
                onClick={() => navigate("/slot-finder")}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <MapPin className="w-4 h-4" /> Slot Finder
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  Best slot in next 24h / 72h for a new address
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 px-4 flex-col items-start gap-1 text-left"
                onClick={() => navigate("/schedule-review")}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <ClipboardList className="w-4 h-4" /> Schedule Review
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  Compliance, route order, past-window risks
                </span>
              </Button>
              <Button
                variant="outline"
                className="h-auto py-4 px-4 flex-col items-start gap-1 text-left"
                onClick={() => navigate("/admin/fieldroutes-writes")}
              >
                <span className="flex items-center gap-2 font-semibold">
                  <PenSquare className="w-4 h-4" /> FieldRoutes Writes
                </span>
                <span className="text-xs text-muted-foreground font-normal">
                  Approve notes & changes before they hit FieldRoutes
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <CardTitle className="text-2xl">Reports</CardTitle>
              <Button variant="ghost" size="sm" onClick={loadReports} disabled={loading}>
                Refresh
              </Button>
            </div>

            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList className="w-full sm:w-auto">
                <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
                <TabsTrigger value="sales">Sales ({counts.sales})</TabsTrigger>
                <TabsTrigger value="initial">Initial ({counts.initial})</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading reports...</div>
            ) : visibleReports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No reports submitted yet</div>
            ) : (
              <div className="grid gap-4">
                {visibleReports.map((report) => (
                  <Card
                    key={report.id}
                    className="hover:shadow-md transition-shadow cursor-pointer"
                    onClick={() => viewReport(report)}
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
                              <div className="font-semibold truncate">{report.customer_name || "N/A"}</div>
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

                        <div className="flex items-center gap-2">
                          {report.is_signed && (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              Signed
                            </Badge>
                          )}
                          <Badge variant={report.report_type === "initial" ? "secondary" : "default"}>
                            {report.report_type === "initial" ? "Initial" : "Sales"}
                          </Badge>

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
                      </div>

                      {report.address && (
                        <div className="mt-3 text-sm text-muted-foreground truncate">{report.address}</div>
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
