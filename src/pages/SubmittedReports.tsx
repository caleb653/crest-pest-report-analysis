import { useEffect, useMemo, useRef, useState } from "react";
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
  Building2,
  Archive,
  ArchiveRestore,
  Trophy,
  XCircle,
  RotateCcw,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import crestLogo from "@/assets/crest-logo-black.png";
import NotificationBell from "@/components/NotificationBell";
import { createPortalFromReport, type PortalPropertyType } from "@/lib/createPortalFromReport";
import { ensureRodentExclusionReport, rodentExclusionUrl, salesReportHasRodentExclusion } from "@/lib/rodentExclusionAutoCreate";

type ReportType = "sales" | "initial" | "multi-proposal";
type TypeFilterValue = "all" | ReportType | "sales-all" | "pre-proposal" | "won" | "lost";

type StatusFilter = "all" | "created" | "sent" | "signed" | "won" | "lost";
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
  is_pre_proposal: boolean;
  deal_status: "won" | "lost" | null;
}

const TECHNICIANS = [
  "Caleb Whalen",
  "Jake Shubin",
  "Darrell Tanner",
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

const TECH_ONLY_USERS = ["Jackson Latham", "Darrell Tanner", "Dylan Gallegos"];

const SubmittedReports = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [reports, setReports] = useState<ReportListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingInspections, setSyncingInspections] = useState(false);
  const syncingInspectionsRef = useRef(false);
  const [searchQuery, setSearchQuery] = useState("");

  const loggedInUser = sessionStorage.getItem("app_logged_in_user") || "";
  const defaultTech = TECH_ONLY_USERS.includes(loggedInUser) ? loggedInUser : "all";

  const [techFilter, setTechFilter] = useState(defaultTech);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");

  const locationFilter = (location.state as any)?.filter;
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>(
    locationFilter === "sales" ? "sales-all" : locationFilter === "all" ? "all" : "initial"
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [creatingPortal, setCreatingPortal] = useState<string | null>(null);
  const [creatingRodent, setCreatingRodent] = useState<string | null>(null);
  const [portalTypePickerReportId, setPortalTypePickerReportId] = useState<string | null>(null);
  const [togglingPreProposal, setTogglingPreProposal] = useState<string | null>(null);
  const [togglingDealStatus, setTogglingDealStatus] = useState<string | null>(null);

  useEffect(() => {
    loadReports();
    syncFieldRoutesInspections({ silent: true });

    const interval = window.setInterval(() => {
      if (!document.hidden) syncFieldRoutesInspections({ silent: true });
    }, 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const loadReports = async () => {
    setLoading(true);
    try {
      // Perf: the full `reports` table averages ~46 KB of `notes` per row plus
      // a base64 signature blob. Listing all of them used to download ~10 MB
      // every time this page opened. The `list_reports_summary` RPC returns
      // only the small list fields plus a 2 KB head of notes and a boolean
      // signature flag — typically a few hundred KB total.
      const { data, error } = await supabase.rpc("list_reports_summary");

      if (error) throw error;

      const mapped: ReportListItem[] = (data ?? []).map((r: any) => {
        let isMultiProposal = false;
        let isPreProposal = false;
        let dealStatus: "won" | "lost" | null = null;
        // Detect via _reportFormat marker. We only need to peek at the start of
        // the notes blob — markers live near the top of the JSON. A cheap
        // substring match avoids parsing megabytes of text.
        const head = typeof r.notes_head === "string" ? r.notes_head : "";
        const isFieldRoutesInspection = head.includes("Auto-created from FieldRoutes");
        // Rodent Exclusion Reports are an initial-report variant — `report_format`
        // is exposed by `list_reports_summary` (from customer_preferences.reportFormat).
        const isRodentExclusion = r.report_format === "rodent-exclusion";
        const isInitial =
          isFieldRoutesInspection ||
          isRodentExclusion ||
          (Array.isArray(r.next_steps) && r.next_steps.length > 0);
        if (head.includes('"_reportFormat":"multi-proposal"')) isMultiProposal = true;
        // A rodent-exclusion record must never be misread as a multi-proposal sales report.
        if (isRodentExclusion) isMultiProposal = false;
        if (head.includes('"_isPreProposal":true')) isPreProposal = true;
        if (head.includes('"_dealStatus":"won"')) dealStatus = "won";
        else if (head.includes('"_dealStatus":"lost"')) dealStatus = "lost";
        // Fallback: detect via services array containing Proposal objects (have 'name' + 'services' keys)
        if (!isMultiProposal && !isRodentExclusion && Array.isArray(r.services) && r.services.length > 0) {
          const first = r.services[0];
          if (first && typeof first === 'object' && 'name' in first && 'services' in first) {
            isMultiProposal = true;
          }
        }
        return {
          id: r.id,
          technician_name: r.technician_name,
          customer_name: r.customer_name,
          address: r.address,
          created_at: r.created_at,
          report_type: isMultiProposal ? "multi-proposal" : isInitial ? "initial" : "sales",
          is_signed: r.has_signature === true,
          is_sent: !!r.sent_to_customer_at,
          is_pre_proposal: isPreProposal,
          deal_status: dealStatus,
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

  const syncFieldRoutesInspections = async ({ silent = false } = {}) => {
    const sessionToken = localStorage.getItem("admin_session");
    if ((!sessionToken && !loggedInUser) || syncingInspectionsRef.current) return;

    syncingInspectionsRef.current = true;
    setSyncingInspections(true);
    try {
      const { data, error } = await supabase.functions.invoke("fieldroutes-sync-inspections", {
        body: { sessionToken, staffName: loggedInUser },
      });

      if (error || !data?.ok) throw new Error(data?.error ?? error?.message ?? "sync_failed");

      if (data.created > 0) {
        toast.success(`FieldRoutes synced: ${data.created} new sales report${data.created === 1 ? "" : "s"}.`);
        await loadReports();
      } else if (!silent) {
        toast.success("FieldRoutes synced: no new inspections found.");
      }
    } catch (error: any) {
      if (!silent) toast.error(`FieldRoutes sync failed: ${error.message ?? String(error)}`);
    } finally {
      syncingInspectionsRef.current = false;
      setSyncingInspections(false);
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

  // Mark a Sales / Multi-Proposal report as a "Pre-Proposal" (or move it back).
  // Stored as `_isPreProposal: true` inside the existing notes JSON so we don't
  // need a schema change.
  const togglePreProposal = async (reportId: string, makePre: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    setTogglingPreProposal(reportId);
    try {
      const { data: row, error: fErr } = await supabase
        .from("reports")
        .select("notes")
        .eq("id", reportId)
        .maybeSingle();
      if (fErr) throw fErr;

      let parsed: any = {};
      if (row?.notes && typeof row.notes === "string") {
        try { parsed = JSON.parse(row.notes); } catch { parsed = { _legacyNotes: row.notes }; }
      }
      if (makePre) parsed._isPreProposal = true;
      else delete parsed._isPreProposal;

      const { error: uErr } = await supabase
        .from("reports")
        .update({ notes: JSON.stringify(parsed) })
        .eq("id", reportId);
      if (uErr) throw uErr;

      toast.success(makePre ? "Marked as Pre-Proposal" : "Moved back to Sales");
      await loadReports();
    } catch (err: any) {
      console.error("Toggle pre-proposal error:", err);
      toast.error("Failed to update report");
    } finally {
      setTogglingPreProposal(null);
    }
  };

  // Mark a Sales / Multi-Proposal report as Won or Lost (or clear the marker).
  // Stored alongside _isPreProposal in the notes JSON so no schema change is
  // needed. Won/Lost reports are filtered out of the default Sales views.
  const setDealStatus = async (
    reportId: string,
    status: "won" | "lost" | null,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();
    setTogglingDealStatus(reportId);
    try {
      const { data: row, error: fErr } = await supabase
        .from("reports")
        .select("notes")
        .eq("id", reportId)
        .maybeSingle();
      if (fErr) throw fErr;

      let parsed: any = {};
      if (row?.notes && typeof row.notes === "string") {
        try { parsed = JSON.parse(row.notes); } catch { parsed = { _legacyNotes: row.notes }; }
      }
      if (status) parsed._dealStatus = status;
      else delete parsed._dealStatus;

      const { error: uErr } = await supabase
        .from("reports")
        .update({ notes: JSON.stringify(parsed) })
        .eq("id", reportId);
      if (uErr) throw uErr;

      toast.success(
        status === "won" ? "Marked as Won" : status === "lost" ? "Marked as Lost" : "Deal status cleared",
      );
      await loadReports();
    } catch (err: any) {
      console.error("Toggle deal status error:", err);
      toast.error("Failed to update deal status");
    } finally {
      setTogglingDealStatus(null);
    }
  };

  const handleCreatePortal = async (reportId: string, propertyType: PortalPropertyType) => {
    setCreatingPortal(reportId);
    try {
      const result = await createPortalFromReport(reportId, propertyType);
      if (result) {
        // Verify the new property is readable before navigating, to avoid 404s
        // (rodent helper appended below before this method)
        // from race conditions where Postgres hasn't yet propagated the row.
        let ready = false;
        for (let i = 0; i < 8 && !ready; i++) {
          await new Promise((r) => setTimeout(r, 400));
          const { data: check } = await supabase
            .from("portal_properties")
            .select("id")
            .eq("id", result.propertyId)
            .maybeSingle();
          if (check?.id) ready = true;
        }

        toast.success("Client portal created!", {
          description: "Opening the new portal…",
          action: {
            label: "Copy PM Link",
            onClick: () => {
              const url = `${window.location.origin}/pm/${result.linkToken}`;
              navigator.clipboard.writeText(url);
              toast.success("PM link copied");
            },
          },
        });
        sessionStorage.setItem("portal-admin-selected-property", result.propertyId);
        navigate("/portal-admin");
      }
    } catch (err: any) {
      console.error("Create portal error:", err);
      toast.error(err?.message || "Failed to create client portal");
    } finally {
      setCreatingPortal(null);
    }
  };

  const handleCreateRodentReport = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCreatingRodent(reportId);
    try {
      const { data: full, error } = await supabase
        .from("reports")
        .select("*")
        .eq("id", reportId)
        .maybeSingle();
      if (error || !full) throw error || new Error("Report not found");
      if (!salesReportHasRodentExclusion((full as any).services)) {
        toast.error("This report has no Rodent Exclusion service.");
        return;
      }
      const result = await ensureRodentExclusionReport(full as any);
      if (!result) {
        toast.error("Failed to create Rodent Initial Report");
        return;
      }
      toast.success(result.created ? "Rodent Initial Report created" : "Opening existing Rodent Initial Report");
      navigate(rodentExclusionUrl(result.reportId));
    } catch (err: any) {
      console.error("Create rodent report error:", err);
      toast.error(err?.message || "Failed to create Rodent Initial Report");
    } finally {
      setCreatingRodent(null);
    }
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
    // Pre-Proposals are hidden from the Sales-focused buckets (Sales, Multi-Proposal,
    // Sales (All)) so the default sales portal view stays clean. They still show up
    // in "All Types" and have their own dedicated "Pre-Proposal" filter.
    // Won / Lost reports are also hidden from the default Sales views — they live
    // in their own dedicated "Won Deals" and "Lost Deals" buckets.
    if (typeFilter === "pre-proposal") {
      filtered = filtered.filter((r) => r.is_pre_proposal);
    } else if (typeFilter === "won") {
      filtered = filtered.filter((r) => r.deal_status === "won");
    } else if (typeFilter === "lost") {
      filtered = filtered.filter((r) => r.deal_status === "lost");
    } else if (typeFilter === "all") {
      // show everything, including pre-proposals and won/lost
    } else {
      filtered = filtered.filter((r) => !r.is_pre_proposal && !r.deal_status);
      if (typeFilter === "sales-all") {
        filtered = filtered.filter((r) => r.report_type === "sales" || r.report_type === "multi-proposal");
      } else {
        filtered = filtered.filter((r) => r.report_type === typeFilter);
      }
    }

    // Status
    // Hide Lost deals from every view by default — they only appear when the
    // user explicitly picks the "Lost" filter (or "All Statuses"). Won deals
    // also have their own bucket but stay visible in default views.
    if (statusFilter === "won") {
      filtered = filtered.filter((r) => r.deal_status === "won");
    } else if (statusFilter === "lost") {
      filtered = filtered.filter((r) => r.deal_status === "lost");
    } else if (statusFilter === "all") {
      // show every status, including Lost
    } else {
      filtered = filtered.filter((r) => {
        // Default behavior: hide Lost so it never clutters Created/Sent/Signed views.
        if (r.deal_status === "lost") return false;
        const status = getStatusLabel(r);
        return status.toLowerCase() === statusFilter;
      });
    }
    // Even when no status filter is applied, Lost deals should be hidden from
    // the main "Submitted Proposals" experience unless the user explicitly
    // opts into the Lost / All Statuses buckets.
    if (statusFilter !== "all" && statusFilter !== "lost" && statusFilter !== "won") {
      filtered = filtered.filter((r) => r.deal_status !== "lost");
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
            {/* <NotificationBell /> hidden to prevent crashes */}
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
                  <SelectItem value="won">Won</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                </SelectContent>
              </Select>

              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilterValue)}>
                <SelectTrigger>
                  <SelectValue placeholder="Report Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="sales-all">Sales (All)</SelectItem>
                  <SelectItem value="multi-proposal">Sales</SelectItem>
                  <SelectItem value="sales">Archived Sales</SelectItem>
                  <SelectItem value="initial">Initial</SelectItem>
                  <SelectItem value="pre-proposal">Pre-Proposal</SelectItem>
                  <SelectItem value="won">Won Deals</SelectItem>
                  <SelectItem value="lost">Lost Deals</SelectItem>
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
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => syncFieldRoutesInspections()}
                  disabled={syncingInspections}
                >
                  {syncingInspections ? <Loader2 className="w-4 h-4 animate-spin" /> : "Sync FieldRoutes"}
                </Button>
                <Button variant="ghost" size="sm" onClick={loadReports} disabled={loading}>
                  Refresh
                </Button>
              </div>
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
                              {report.report_type === "initial" ? "Initial" : report.report_type === "multi-proposal" ? "Sales" : "Archived Sales"}
                            </Badge>

                            {report.is_pre_proposal && (
                              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                <Archive className="w-3 h-3 mr-1" />
                                Pre-Proposal
                              </Badge>
                            )}

                            {report.deal_status === "won" && (
                              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                <Trophy className="w-3 h-3 mr-1" />
                                Won
                              </Badge>
                            )}
                            {report.deal_status === "lost" && (
                              <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">
                                <XCircle className="w-3 h-3 mr-1" />
                                Lost
                              </Badge>
                            )}

                            {(report.report_type === "sales" || report.report_type === "multi-proposal") && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => togglePreProposal(report.id, !report.is_pre_proposal, e)}
                                disabled={togglingPreProposal === report.id}
                                className="text-muted-foreground hover:text-foreground hover:bg-muted"
                                title={report.is_pre_proposal ? "Move back to Sales" : "Mark as Pre-Proposal"}
                              >
                                {togglingPreProposal === report.id ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : report.is_pre_proposal ? (
                                  <ArchiveRestore className="w-4 h-4" />
                                ) : (
                                  <Archive className="w-4 h-4" />
                                )}
                              </Button>
                            )}

                            {(report.report_type === "sales" || report.report_type === "multi-proposal") && (
                              <>
                                {report.deal_status ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => setDealStatus(report.id, null, e)}
                                    disabled={togglingDealStatus === report.id}
                                    className="text-muted-foreground hover:text-foreground hover:bg-muted"
                                    title="Clear deal status"
                                  >
                                    {togglingDealStatus === report.id ? (
                                      <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <RotateCcw className="w-4 h-4" />
                                    )}
                                  </Button>
                                ) : (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => setDealStatus(report.id, "won", e)}
                                      disabled={togglingDealStatus === report.id}
                                      className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                                      title="Mark as Won"
                                    >
                                      {togglingDealStatus === report.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <Trophy className="w-4 h-4" />
                                      )}
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={(e) => setDealStatus(report.id, "lost", e)}
                                      disabled={togglingDealStatus === report.id}
                                      className="text-rose-700 hover:text-rose-800 hover:bg-rose-50"
                                      title="Mark as Lost"
                                    >
                                      {togglingDealStatus === report.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                      ) : (
                                        <XCircle className="w-4 h-4" />
                                      )}
                                    </Button>
                                  </>
                                )}
                              </>
                            )}

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
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setPortalTypePickerReportId(report.id); }}
                              disabled={creatingPortal === report.id}
                              className="text-primary hover:text-primary hover:bg-primary/10 gap-1.5"
                              title="Create a Client Portal pre-populated from this report"
                            >
                              {creatingPortal === report.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Building2 className="w-4 h-4" />
                              )}
                              <span className="hidden md:inline">Create Client Portal</span>
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => handleCreateRodentReport(report.id, e)}
                              disabled={creatingRodent === report.id}
                              className="text-primary hover:text-primary hover:bg-primary/10 gap-1.5"
                              title="Create a Rodent Initial Report from this report"
                            >
                              {creatingRodent === report.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4" />
                              )}
                              <span className="hidden md:inline">Create Rodent Initial Report</span>
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

      {/* Property Type Picker — required before creating a Client Portal */}
      <Dialog open={!!portalTypePickerReportId} onOpenChange={(open) => { if (!open) setPortalTypePickerReportId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Property Type</DialogTitle>
            <DialogDescription>
              Choose the type of property — this determines which section of the Client Portal it appears in.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-2">
            {([
              { value: "apartments", label: "Apartments" },
              { value: "hoa", label: "HOA" },
              { value: "commercial", label: "Commercial" },
            ] as { value: PortalPropertyType; label: string }[]).map((opt) => (
              <Button
                key={opt.value}
                variant="outline"
                className="h-24 flex flex-col items-center justify-center gap-2 hover:border-primary hover:bg-primary/5"
                disabled={!!creatingPortal}
                onClick={async () => {
                  const id = portalTypePickerReportId;
                  if (!id) return;
                  setPortalTypePickerReportId(null);
                  await handleCreatePortal(id, opt.value);
                }}
              >
                <Building2 className="w-6 h-6 text-primary" />
                <span className="font-medium">{opt.label}</span>
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPortalTypePickerReportId(null)} disabled={!!creatingPortal}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubmittedReports;
