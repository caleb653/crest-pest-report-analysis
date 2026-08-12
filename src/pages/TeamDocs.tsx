import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ArrowLeft, FileText, FolderLock, Loader2, Eye } from "lucide-react";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import crestLogo from "@/assets/crest-logo-black.png";
import { format } from "date-fns";

const EMPLOYEES = [
  "Caleb Whalen",
  "Jake Shubin",
  "Darrell Tanner",
  "Jackson Latham",
  "Dylan Gallegos",
  "Michael Muniz",
  "Nick Stovall",
];

const SUBMITTED_DOCS_PASSWORD = "18444";

interface SubmittedDoc {
  id: string;
  document_type: string;
  employee_name: string;
  job_title: string | null;
  work_location: string | null;
  form_date: string | null;
  employee_signature: string | null;
  employee_printed_name: string | null;
  employee_signed_date: string | null;
  representative_name: string | null;
  representative_title: string | null;
  representative_signature: string | null;
  representative_signed_date: string | null;
  created_at: string;
}

const TeamDocs = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<"menu" | "waiver" | "submitted">("menu");

  // Waiver form state
  const [employeeName, setEmployeeName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [workLocation, setWorkLocation] = useState("");
  const [formDate, setFormDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [employeeSignature, setEmployeeSignature] = useState("");
  const [employeePrintedName, setEmployeePrintedName] = useState("");
  const [employeeSignedDate, setEmployeeSignedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [repName, setRepName] = useState("");
  const [repTitle, setRepTitle] = useState("");
  const [repSignature, setRepSignature] = useState("");
  const [repSignedDate, setRepSignedDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [submitting, setSubmitting] = useState(false);
  const [waiverConfirmed, setWaiverConfirmed] = useState(false);

  // Submitted docs state
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [submittedDocs, setSubmittedDocs] = useState<SubmittedDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<SubmittedDoc | null>(null);

  // Signature dialog state
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [sigTarget, setSigTarget] = useState<"employee" | "rep">("employee");

  const resetForm = () => {
    setEmployeeName("");
    setJobTitle("");
    setWorkLocation("");
    setFormDate(format(new Date(), "yyyy-MM-dd"));
    setEmployeeSignature("");
    setEmployeePrintedName("");
    setEmployeeSignedDate(format(new Date(), "yyyy-MM-dd"));
    setRepName("");
    setRepTitle("");
    setRepSignature("");
    setRepSignedDate(format(new Date(), "yyyy-MM-dd"));
    setWaiverConfirmed(false);
  };

  const handleSubmitWaiver = async () => {
    if (!employeeName) {
      toast.error("Please select an employee");
      return;
    }
    if (!waiverConfirmed) {
      toast.error("Please confirm the waiver checkbox");
      return;
    }
    if (!employeeSignature) {
      toast.error("Employee signature is required");
      return;
    }
    setSubmitting(true);
    try {
      const { data: inserted, error } = await supabase.from("team_documents").insert({
        document_type: "meal_period_waiver",
        employee_name: employeeName,
        job_title: jobTitle || null,
        work_location: workLocation || null,
        form_date: formDate || null,
        employee_signature: employeeSignature || null,
        employee_printed_name: employeePrintedName || null,
        employee_signed_date: employeeSignedDate || null,
        representative_name: repName || null,
        representative_title: repTitle || null,
        representative_signature: repSignature || null,
        representative_signed_date: repSignedDate || null,
      } as any).select("id").maybeSingle();
      if (error) throw error;
      // Notify Caleb (in-app + email). Best-effort, do not block UX on failure.
      if (inserted?.id) {
        supabase.functions.invoke("notify-meal-waiver", {
          body: { documentId: inserted.id },
        }).catch((e) => console.error("notify-meal-waiver invoke failed:", e));
      }
      toast.success("Waiver submitted successfully!");
      resetForm();
      setActiveView("menu");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to submit waiver");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenSubmitted = () => {
    if (authenticated) {
      loadSubmittedDocs();
      setActiveView("submitted");
    } else {
      setPassword("");
      setPasswordDialogOpen(true);
    }
  };

  const handlePasswordSubmit = () => {
    if (password === SUBMITTED_DOCS_PASSWORD) {
      setAuthenticated(true);
      setPasswordDialogOpen(false);
      loadSubmittedDocs();
      setActiveView("submitted");
    } else {
      toast.error("Incorrect password");
    }
  };

  const loadSubmittedDocs = async () => {
    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from("team_documents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setSubmittedDocs((data as any[]) || []);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load documents");
    } finally {
      setLoadingDocs(false);
    }
  };

  const openSignatureDialog = (target: "employee" | "rep") => {
    setSigTarget(target);
    setSigDialogOpen(true);
  };

  const handleSignatureSave = (dataUrl: string) => {
    if (sigTarget === "employee") {
      setEmployeeSignature(dataUrl);
    } else {
      setRepSignature(dataUrl);
    }
    setSigDialogOpen(false);
  };

  // --- MENU VIEW ---
  if (activeView === "menu") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-8 max-sm:flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={crestLogo} alt="Crest" className="h-10" />
            <h1 className="text-2xl font-bold text-foreground">Crest Team Docs</h1>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card
              className="cursor-pointer hover:border-violet-300 hover:shadow-lg transition-all group"
              onClick={() => setActiveView("waiver")}
            >
              <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[180px]">
                <div className="w-16 h-16 rounded-full bg-violet-50 flex items-center justify-center mb-3 group-hover:bg-violet-100 transition-colors">
                  <FileText className="w-8 h-8 text-violet-600" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Meal Period Waiver</h2>
                <p className="text-sm text-muted-foreground">California Meal Period Waiver Agreement</p>
              </CardContent>
            </Card>

            <Card
              className="cursor-pointer hover:border-amber-300 hover:shadow-lg transition-all group"
              onClick={handleOpenSubmitted}
            >
              <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[180px]">
                <div className="w-16 h-16 rounded-full bg-amber-50 flex items-center justify-center mb-3 group-hover:bg-amber-100 transition-colors">
                  <FolderLock className="w-8 h-8 text-amber-600" />
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-1">Submitted Docs</h2>
                <p className="text-sm text-muted-foreground">View all submitted team documents</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Password Dialog */}
        <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Enter Password</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
                placeholder="Enter password to access submitted docs"
              />
            </div>
            <DialogFooter>
              <Button onClick={handlePasswordSubmit}>Submit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // --- SUBMITTED DOCS VIEW ---
  if (activeView === "submitted") {
    if (viewingDoc) {
      return (
        <div className="min-h-screen bg-background p-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6 max-sm:flex-wrap">
              <Button variant="ghost" size="icon" onClick={() => setViewingDoc(null)}>
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <h1 className="text-xl font-bold text-foreground">
                Meal Period Waiver — {viewingDoc.employee_name}
              </h1>
            </div>
            <Card>
              <CardContent className="p-6 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div><span className="font-medium">Employee:</span> {viewingDoc.employee_name}</div>
                  <div><span className="font-medium">Date:</span> {viewingDoc.form_date || "—"}</div>
                </div>
                <hr />

                {/* Full agreement text */}
                <div className="bg-muted/50 rounded-lg p-4 text-sm text-foreground space-y-3">
                  <p>California law generally requires a 30-minute unpaid, duty-free meal period for non-exempt employees who work more than five (5) hours in a workday.</p>
                  <p className="font-semibold">For the work date listed above, I understand and agree:</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>I am scheduled to work more than 5 hours but no more than 6 hours, and I voluntarily choose to waive my first 30-minute meal period for this shift only; OR</li>
                    <li>I am scheduled to work more than 10 hours but no more than 12 hours, I took my first meal period, and I voluntarily choose to waive my second meal period for this shift only.</li>
                  </ul>
                  <p className="font-semibold">I understand:</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>Meal period waivers are not permitted outside these limits.</li>
                    <li>This decision is voluntary and applies only to the date above.</li>
                    <li>I may choose not to waive a meal period and will not be subject to retaliation.</li>
                    <li>I must accurately record all hours worked and any meal periods taken.</li>
                  </ul>
                  <p className="font-medium pt-1">☑ I confirm my shift for the work date above qualifies for a meal period waiver under California law, and I voluntarily waive my meal period for this shift only.</p>
                </div>

                <hr />
                {viewingDoc.employee_signature ? (
                  <div>
                    <span className="font-medium">Employee Signature:</span>
                    <img src={viewingDoc.employee_signature} alt="Employee signature" className="h-16 mt-1 border rounded p-1" />
                  </div>
                ) : (
                  <div><span className="font-medium">Employee Signature:</span> Not signed</div>
                )}
                <p className="text-xs text-muted-foreground pt-2">
                  Submitted: {new Date(viewingDoc.created_at).toLocaleString()}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-6 max-sm:flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => setActiveView("menu")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">Submitted Documents</h1>
          </div>

          {loadingDocs ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : submittedDocs.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No documents submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {submittedDocs.map((doc) => (
                <Card
                  key={doc.id}
                  className="cursor-pointer hover:shadow-md transition-all"
                  onClick={() => setViewingDoc(doc)}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium text-foreground">{doc.employee_name}</p>
                      <p className="text-sm text-muted-foreground">
                        Meal Period Waiver • {doc.form_date ? format(new Date(doc.form_date + "T12:00:00"), "MMM d, yyyy") : new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Eye className="w-5 h-5 text-muted-foreground" />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- WAIVER FORM VIEW ---
  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6 max-sm:flex-wrap">
          <Button variant="ghost" size="icon" onClick={() => setActiveView("menu")}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={crestLogo} alt="Crest" className="h-10" />
        </div>

        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Crest Pest Control</CardTitle>
            <p className="text-base font-semibold text-foreground mt-1">
              California Daily Meal Period Waiver (Shift-Specific)
            </p>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Employee Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Employee Name</Label>
                <Select value={employeeName} onValueChange={setEmployeeName}>
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYEES.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Work Date</Label>
                <Input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} />
              </div>
            </div>

            {/* Agreement text */}
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-foreground space-y-3">
              <p>California law generally requires a 30-minute unpaid, duty-free meal period for non-exempt employees who work more than five (5) hours in a workday.</p>

              <p className="font-semibold">For the work date listed above, I understand and agree:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>I am scheduled to work more than 5 hours but no more than 6 hours, and I voluntarily choose to waive my first 30-minute meal period for this shift only; OR</li>
                <li>I am scheduled to work more than 10 hours but no more than 12 hours, I took my first meal period, and I voluntarily choose to waive my second meal period for this shift only.</li>
              </ul>

              <p className="font-semibold">I understand:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>Meal period waivers are not permitted outside these limits.</li>
                <li>This decision is voluntary and applies only to the date above.</li>
                <li>I may choose not to waive a meal period and will not be subject to retaliation.</li>
                <li>I must accurately record all hours worked and any meal periods taken.</li>
              </ul>

              <div className="flex items-start gap-2 pt-2">
                <Checkbox checked={waiverConfirmed} onCheckedChange={(v) => setWaiverConfirmed(v === true)} id="waiver-confirm" className="mt-0.5" />
                <label htmlFor="waiver-confirm" className="text-sm leading-snug cursor-pointer">
                  I confirm my shift for the work date above qualifies for a meal period waiver under California law, and I voluntarily waive my meal period for this shift only.
                </label>
              </div>
            </div>

            {/* Employee Signature */}
            <div className="space-y-3 border-t pt-4">
              <Label>Employee Signature</Label>
              {employeeSignature ? (
                <div className="flex items-center gap-3">
                  <img src={employeeSignature} alt="Signature" className="h-14 border rounded p-1" />
                  <Button variant="outline" size="sm" onClick={() => openSignatureDialog("employee")}>Redo</Button>
                </div>
              ) : (
                <Button variant="outline" onClick={() => openSignatureDialog("employee")}>Sign Here</Button>
              )}
            </div>

            <Button
              className="w-full"
              onClick={handleSubmitWaiver}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Submit Waiver
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Signature Dialog */}
      <Dialog open={sigDialogOpen} onOpenChange={setSigDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Employee Signature</DialogTitle>
          </DialogHeader>
          <SignatureCanvas onSave={handleSignatureSave} />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TeamDocs;