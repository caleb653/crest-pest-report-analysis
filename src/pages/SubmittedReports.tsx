import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  CheckCircle,
  Copy,
  FileText,
  LogOut,
  Trash2,
  User,
  Search,
  Mail,
  PenLine,
  Loader2,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import crestLogo from "@/assets/crest-logo-black.png";

type ReportType = "sales" | "initial" | "multi-proposal";

type StatusFilter = "all" | "created" | "sent" | "signed";
type DateFilter = "recent" | "week" | "month" | "all";

interface ReportListItem {
  id: string;
  technician_name: string;
  customer_name: string | null;
  address: string | null;
  created_at: string;
  report_type: ReportType;
  is_signed: boolean;
  is_sent: boolean;
}

const TECHNICIANS = [
  "Caleb Whalen",
  "Jake Shubin",
  "Darrell Tanner",
  "Jesse Angulo",
  "Jackson Latham",
  "Dylan Gallegos",
  "Michael Muniz",
];

function getStatusLabel(report: ReportListItem): "Signed" | "Sent" | "Created" {
  if (report.is_signed) return "Signed";
  if (report.is_sent) return "Sent";
  return "Created";
}

function isRecentDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  return d >= yesterday;
}

function isWithinDays(dateStr: string, days: number): boolean {
  const d = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return d >= cutoff;
}

const TECH_ONLY_USERS = ["Jackson Latham", "Darrell Tanner", "Dylan Gallegos", "Jesse Angulo"];

const SubmittedReports = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const loggedInUser = sessionStorage.getItem("app_logged_in_user") || "";
  const defaultTech = TECH_ONLY_USERS.includes(loggedInUser) ? loggedInUser : "all";

  const [techFilter, setTechFilter] = useState(defaultTech);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");

  const locationFilter = (location.state as any)?.filter;
  const [typeFilter, setTypeFilter] = useState<"all" | ReportType>(
    locationFilter === "initial" || locationFilter === "sales" ? locationFilter : "all"
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("id, technician_name, customer_name, address, created_at, next_steps, customer_signature, sent_to_customer_at, notes")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const mapped: ReportListItem[] = (data ?? []).map((r: any) => {
        const isInitial = Array.isArray(r.next_steps) && r.next_steps.length > 0;
        let isMultiProposal = false;
        if (r.notes && typeof r.notes === 'string') {
          try {
            const parsed = JSON.parse(r.notes);
            if (parsed?._reportFormat === "multi-proposal") isMultiProposal = true;
          } catch {}
        }
        return {
          id: r.id,
          technician_name: r.technician_name,
          customer_name: r.customer_name,
          address: r.address,
          created_at: r.created_at,
          report_type: isMultiProposal ? "multi-proposal" : isInitial ? "initial" : "sales",
          is_signed: !!r.customer_signature,
          is_sent: !!r.sent_to_customer_at,
        };
      });

      setReports(mapped);
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to load reports");
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  const promptDelete = (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleteTargetId(reportId);
    setDeletePassword("");
    setDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId || !deletePassword.trim()) return;
    setDeleting(true);

    try {
      const { data, error } = await supabase.functions.invoke("delete-report", {
        body: { password: deletePassword, reportId: deleteTargetId },
      });

      if (error) throw error;
      if (!data?.ok) {
        if (data?.error === "invalid_password") {
          toast.error("Incorrect password");
          return;
        }
        throw new Error(data?.error || "Delete failed");
      }

      toast.success("Report deleted");
      setDeleteDialogOpen(false);
      await loadReports();
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to delete report");
    } finally {
      setDeleting(false);
    }
  };

  const viewReport = (report: ReportListItem) => {
    const path = report.report_type === "initial" 
      ? `/initial-pest-report/${report.id}` 
      : report.report_type === "multi-proposal"
      ? `/multi-proposal-report/${report.id}`
      : `/report/${report.id}`;
    navigate(path);
  };
  const duplicateReport = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDuplicating(reportId);
    try {
      const { data: original, error: fetchError } = await supabase
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();

      if (fetchError || !original) throw fetchError || new Error("Report not found");

      const newId = crypto.randomUUID();
      const { id, created_at, updated_at, customer_signature, sent_to_customer_at, customer_email, ...rest } = original as any;

      const { error: insertError } = await supabase
        .from("reports")
        .insert([{ id: newId, ...rest, report_title: (rest.report_title || "Report") + " (Copy)" }]);

      if (insertError) throw insertError;

      toast.success("Report duplicated!");
      await loadReports();
    } catch (error: any) {
      console.error("Duplicate error:", error);
      toast.error("Failed to duplicate report");
    } finally {
      setDuplicating(null);
    }
  };

  const handleSignOut = () => {
    sessionStorage.removeItem("app_authenticated");
    sessionStorage.removeItem("app_logged_in_user");
    toast.success("Signed out");
    navigate("/");
  };

  const visibleReports = useMemo(() => {
    let filtered = reports;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.customer_name || "").toLowerCase().includes(q) ||
          (r.address || "").toLowerCase().includes(q)
      );
    }

    // Technician
    if (techFilter !== "all") {
      filtered = filtered.filter((r) => r.technician_name === techFilter);
    }

    // Type
    if (typeFilter !== "all") {
      filtered = filtered.filter((r) => r.report_type === typeFilter);
    }

    // Status
    if (statusFilter !== "all") {
      filtered = filtered.filter((r) => {
        const status = getStatusLabel(r);
        return status.toLowerCase() === statusFilter;
      });
    }

    // Date
    if (dateFilter === "recent") {
      filtered = filtered.filter((r) => isRecentDate(r.created_at));
    } else if (dateFilter === "week") {
      filtered = filtered.filter((r) => isWithinDays(r.created_at, 7));
    } else if (dateFilter === "month") {
      filtered = filtered.filter((r) => isWithinDays(r.created_at, 30));
    }

    return filtered;
  }, [reports, searchQuery, techFilter, statusFilter, dateFilter, typeFilter]);

  const counts = useMemo(() => {
    return {
      total: visibleReports.length,
      created: visibleReports.filter((r) => getStatusLabel(r) === "Created").length,
      sent: visibleReports.filter((r) => getStatusLabel(r) === "Sent").length,
      signed: visibleReports.filter((r) => getStatusLabel(r) === "Signed").length,
    };
  }, [visibleReports]);

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src={crestLogo} alt="Crest Pest Control logo" className="h-12" />
            <h1 className="text-xl md:text-2xl font-bold">Created Reports</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate("/")}>
              Home
            </Button>
            <Button variant="outline" size="sm" onClick={handleSignOut} className="flex items-center gap-2">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Sign Out</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 md:py-8 space-y-4">
        {/* Search and Filters */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by customer name or address..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Select value={techFilter} onValueChange={setTechFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Technician" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Technicians</SelectItem>
                  {TECHNICIANS.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="created">Created</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="signed">Signed</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as "all" | ReportType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Report Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="initial">Initial</SelectItem>
                </SelectContent>
              </Select>

              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger>
                  <SelectValue placeholder="Date Range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Today / Yesterday</SelectItem>
                  <SelectItem value="week">Last 7 Days</SelectItem>
                  <SelectItem value="month">Last 30 Days</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status summary chips */}
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="outline" className="font-normal">
                {counts.total} total
              </Badge>
              <Badge variant="outline" className="font-normal bg-muted/50">
                <PenLine className="w-3 h-3 mr-1" />
                {counts.created} Created
              </Badge>
              <Badge variant="outline" className="font-normal bg-blue-50 text-blue-700 border-blue-200">
                <Mail className="w-3 h-3 mr-1" />
                {counts.sent} Sent
              </Badge>
              <Badge variant="outline" className="font-normal bg-green-50 text-green-700 border-green-200">
                <CheckCircle className="w-3 h-3 mr-1" />
                {counts.signed} Signed
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Reports List */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {visibleReports.length} Report{visibleReports.length !== 1 ? "s" : ""}
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={loadReports} disabled={loading}>
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">Loading reports...</div>
            ) : visibleReports.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No reports match your filters
              </div>
            ) : (
              <div className="grid gap-3">
                {visibleReports.map((report) => {
                  const status = getStatusLabel(report);
                  return (
                    <Card
                      key={report.id}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => viewReport(report)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <User className="w-4 h-4 text-primary flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs text-muted-foreground">Technician</div>
                                <div className="font-semibold text-sm truncate">{report.technician_name}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs text-muted-foreground">Customer</div>
                                <div className="font-semibold text-sm truncate">{report.customer_name || "N/A"}</div>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <Calendar className="w-4 h-4 text-primary flex-shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs text-muted-foreground">Date</div>
                                <div className="font-semibold text-sm truncate">
                                  {new Date(report.created_at).toLocaleDateString()}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-shrink-0">
                            <Badge
                              variant="outline"
                              className={
                                status === "Signed"
                                  ? "bg-green-50 text-green-700 border-green-200"
                                  : status === "Sent"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-muted/50"
                              }
                            >
                              {status === "Signed" && <CheckCircle className="w-3 h-3 mr-1" />}
                              {status === "Sent" && <Mail className="w-3 h-3 mr-1" />}
                              {status === "Created" && <PenLine className="w-3 h-3 mr-1" />}
                              {status}
                            </Badge>

                            <Badge variant={report.report_type === "initial" ? "secondary" : report.report_type === "multi-proposal" ? "outline" : "default"}>
                              {report.report_type === "initial" ? "Initial" : report.report_type === "multi-proposal" ? "Multi-Proposal" : "Sales"}
                            </Badge>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => duplicateReport(report.id, e)}
                              disabled={duplicating === report.id}
                              className="text-muted-foreground hover:text-foreground hover:bg-muted"
                              title="Duplicate report"
                            >
                              {duplicating === report.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Copy className="w-4 h-4" />
                              )}
                            </Button>

                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => promptDelete(report.id, e)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              title="Delete report"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        {report.address && (
                          <div className="mt-2 text-xs text-muted-foreground truncate">{report.address}</div>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Report</DialogTitle>
            <DialogDescription>
              Enter the admin password to permanently delete this report.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="delete-password">Password</Label>
            <Input
              id="delete-password"
              type="password"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              placeholder="Enter admin password"
              onKeyDown={(e) => e.key === "Enter" && confirmDelete()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting || !deletePassword.trim()}
            >
              {deleting ? "Deleting..." : "Delete Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubmittedReports;
