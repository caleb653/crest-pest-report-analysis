import { useEffect, useState } from "react";
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
import { ArrowLeft, FileText, FilePen, FolderLock, Loader2, Eye, ShieldCheck, Plus, Trash2, Download, Clock } from "lucide-react";
import { SignatureCanvas } from "@/components/SignatureCanvas";
import crestLogo from "@/assets/crest-logo-black.png";
import { format } from "date-fns";
import { RightToTreatSheet, RttHeader, RttTermsBody } from "@/components/teamdocs/RightToTreatSheet";
import { RTT_RIGHT_TO_ENTER_ACK, RTT_TERMS_ACK, type RightToTreatFormData } from "@/lib/rightToTreatTerms";
import { downloadRightToTreatAgreementPdf } from "@/lib/rightToTreatAgreementPdf";

// Everyone currently at Crest (office + field). "Other" lets any name be typed in.
const EMPLOYEES = [
  "Caleb Whalen",
  "Jake Shubin",
  "Cade Carnival",
  "Kiera Nicholson",
  "Darrell Tanner",
  "Jackson Latham",
  "Dylan Gallegos",
  "Michael Muniz",
  "David Longoria",
  "Nick Stovall",
  "Brock Lyttle",
  "Joseph Ibarbo",
];
const OTHER_EMPLOYEE = "__other__";

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
  form_data: Partial<RightToTreatFormData> | null;
  status?: string | null;
  created_at: string;
  updated_at?: string;
}

const DOC_LABEL: Record<string, string> = {
  meal_period_waiver: "Meal Period Waiver",
  right_to_treat: "Right to Treat",
};
const docLabel = (t: string) => DOC_LABEL[t] || t;
const isPending = (d: SubmittedDoc) => (d.status || "signed") === "pending";
const fmtDate = (d: string | null | undefined, fallback: string) =>
  d ? format(new Date(d + "T12:00:00"), "MMM d, yyyy") : new Date(fallback).toLocaleDateString();

type View =
  | "menu"           // Meal Period Waiver | Right to Treat
  | "rtt-menu"       // Right to Treat: Blank / Pre-Made / Submitted
  | "waiver-menu"    // Meal Period Waiver: Blank / Submitted
  | "blank-rtt"      // blank Right to Treat, sign now
  | "waiver"         // blank Meal Period Waiver
  | "premade"        // list of pre-made (pending) sheets
  | "premade-new"    // office prepares a sheet for a customer
  | "premade-sign"   // customer signs a pre-made sheet
  | "submitted";

const TeamDocs = () => {
  const navigate = useNavigate();
  const [activeView, setActiveView] = useState<View>("menu");

  // Waiver form state
  const [employeeName, setEmployeeName] = useState("");
  // Dropdown choice; OTHER_EMPLOYEE reveals a free-text name field.
  const [employeeChoice, setEmployeeChoice] = useState("");
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

  // All sheets (pending + signed) — one load, split client-side so the page
  // keeps working even before the `status` column migration has been run.
  const [docs, setDocs] = useState<SubmittedDoc[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<SubmittedDoc | null>(null);
  const [signingDoc, setSigningDoc] = useState<SubmittedDoc | null>(null);
  const [submittedType, setSubmittedType] = useState<"right_to_treat" | "meal_period_waiver">("right_to_treat");
  const pendingDocs = docs.filter(isPending);
  const submittedDocs = docs.filter((d) => !isPending(d) && d.document_type === submittedType);
  const submittedBack = () => setActiveView(submittedType === "meal_period_waiver" ? "waiver-menu" : "rtt-menu");

  // Submitted docs password
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);

  // Signature dialog state (waiver)
  const [sigDialogOpen, setSigDialogOpen] = useState(false);
  const [sigTarget, setSigTarget] = useState<"employee" | "rep">("employee");

  const loadDocs = async () => {
    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from("team_documents")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setDocs((data as any[]) || []);
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to load signature sheets");
    } finally {
      setLoadingDocs(false);
    }
  };
  useEffect(() => { loadDocs(); }, []);

  const resetForm = () => {
    setEmployeeName("");
    setEmployeeChoice("");
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
    if (!employeeName.trim()) {
      toast.error(employeeChoice === OTHER_EMPLOYEE ? "Please type the employee's name" : "Please select an employee");
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
        employee_name: employeeName.trim(),
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
      loadDocs();
      setActiveView("waiver-menu");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to submit waiver");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Right to Treat: blank sign / prepare / sign pre-made ─────────────────
  const rttRow = (data: RightToTreatFormData, signature: string | null) => ({
    document_type: "right_to_treat",
    employee_name: (signature ? data.signer_name.trim() : "") || data.service_address.trim(),
    employee_printed_name: data.signer_name.trim() || null,
    work_location: data.service_address.trim() || null,
    form_date: data.form_date || null,
    employee_signature: signature,
    employee_signed_date: signature ? format(new Date(), "yyyy-MM-dd") : null,
    representative_name: data.crest_representative?.trim() || null,
    status: signature ? "signed" : "pending",
    form_data: data,
  });

  const handleRttBlankSign = async (data: RightToTreatFormData, signature: string | null) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from("team_documents").insert(rttRow(data, signature) as any);
      if (error) throw error;
      toast.success("Signed Right to Treat saved to Submitted Signature Sheets");
      await loadDocs();
      setActiveView("rtt-menu");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save the signed sheet");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRttPrepare = async (data: RightToTreatFormData) => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from("team_documents").insert(rttRow(data, null) as any);
      if (error) throw error;
      toast.success(`Pre-made sheet saved for ${data.service_address}`);
      await loadDocs();
      setActiveView("premade");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to save the pre-made sheet");
    } finally {
      setSubmitting(false);
    }
  };

  const handleRttSignPremade = async (data: RightToTreatFormData, signature: string | null) => {
    if (!signingDoc) return;
    setSubmitting(true);
    try {
      const { data: updated, error } = await supabase
        .from("team_documents")
        .update(rttRow(data, signature) as any)
        .eq("id", signingDoc.id)
        .select("id");
      if (error) throw error;
      if (!updated || updated.length === 0) {
        throw new Error("Update returned no rows (is the team_documents status migration applied?)");
      }
      toast.success("Signed — the sheet moved to Submitted Signature Sheets");
      setSigningDoc(null);
      await loadDocs();
      setActiveView("rtt-menu");
    } catch (err: any) {
      console.error(err);
      toast.error("Could not record the signature");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeletePending = async (doc: SubmittedDoc) => {
    if (!window.confirm(`Delete the pre-made sheet for ${doc.employee_name}?`)) return;
    const { error, count } = await supabase
      .from("team_documents")
      .delete({ count: "exact" })
      .eq("id", doc.id)
      .eq("status", "pending");
    if (error || !count) {
      toast.error("Could not delete the sheet");
      return;
    }
    toast.success("Pre-made sheet deleted");
    loadDocs();
  };

  const handleOpenSubmitted = (type: "right_to_treat" | "meal_period_waiver") => {
    setSubmittedType(type);
    if (authenticated) {
      loadDocs();
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
      loadDocs();
      setActiveView("submitted");
    } else {
      toast.error("Incorrect password");
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

  const PageShell = ({ back, title, children }: { back: () => void; title?: string; children: React.ReactNode }) => (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6 max-sm:flex-wrap">
          <Button variant="ghost" size="icon" onClick={back}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <img src={crestLogo} alt="Crest" className="h-10" />
          {title && <h1 className="text-xl font-bold text-foreground">{title}</h1>}
        </div>
        {children}
      </div>
    </div>
  );

  const SectionCard = ({ title, sub, icon, tone, badge, onClick }: {
    title: string; sub: string; icon: React.ReactNode; tone: "violet" | "sky" | "amber" | "emerald"; badge?: number; onClick: () => void;
  }) => {
    const t = {
      violet: ["hover:border-violet-300", "bg-violet-50 group-hover:bg-violet-100", "text-violet-600"],
      sky: ["hover:border-sky-300", "bg-sky-50 group-hover:bg-sky-100", "text-sky-600"],
      amber: ["hover:border-amber-300", "bg-amber-50 group-hover:bg-amber-100", "text-amber-600"],
      emerald: ["hover:border-emerald-300", "bg-emerald-50 group-hover:bg-emerald-100", "text-emerald-600"],
    }[tone];
    return (
      <Card className={`cursor-pointer ${t[0]} hover:shadow-lg transition-all group`} onClick={onClick}>
        <CardContent className="flex flex-col items-center justify-center p-8 text-center min-h-[180px]">
          <div className={`w-16 h-16 rounded-full ${t[1]} flex items-center justify-center mb-3 transition-colors relative ${t[2]}`}>
            {icon}
            {!!badge && (
              <span className="absolute -top-1 -right-1 min-w-[22px] h-[22px] px-1.5 rounded-full bg-sky-600 text-white text-xs font-bold flex items-center justify-center">
                {badge}
              </span>
            )}
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1">{title}</h2>
          <p className="text-sm text-muted-foreground">{sub}</p>
        </CardContent>
      </Card>
    );
  };

  const PasswordDialog = () => (
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
            placeholder="Enter password to access submitted sheets"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button onClick={handlePasswordSubmit}>Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // --- MENU VIEW: pick a sheet type ---
  if (activeView === "menu") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-8 max-sm:flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={crestLogo} alt="Crest" className="h-10" />
            <h1 className="text-2xl font-bold text-foreground">Signature Sheets</h1>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionCard
              title="Meal Period Waiver"
              sub="California Meal Period Waiver Agreement"
              icon={<FileText className="w-8 h-8" />}
              tone="violet"
              onClick={() => setActiveView("waiver-menu")}
            />
            <SectionCard
              title="Right to Treat"
              sub="Customer authorization, release & pesticide notice"
              icon={<ShieldCheck className="w-8 h-8" />}
              tone="emerald"
              badge={pendingDocs.length}
              onClick={() => { loadDocs(); setActiveView("rtt-menu"); }}
            />
          </div>
        </div>
      </div>
    );
  }

  // --- RIGHT TO TREAT: Blank / Pre-Made / Submitted ---
  if (activeView === "rtt-menu") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center gap-3 mb-8 max-sm:flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => setActiveView("menu")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={crestLogo} alt="Crest" className="h-10" />
            <h1 className="text-2xl font-bold text-foreground">Right to Treat</h1>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <SectionCard
              title="Blank Signature Sheet"
              sub="Fill out and sign a Right to Treat on the spot"
              icon={<FileText className="w-8 h-8" />}
              tone="violet"
              onClick={() => setActiveView("blank-rtt")}
            />
            <SectionCard
              title="Pre-Made Signature Sheet"
              sub="Prepared for a specific customer, waiting to be signed"
              icon={<FilePen className="w-8 h-8" />}
              tone="sky"
              badge={pendingDocs.length}
              onClick={() => { loadDocs(); setActiveView("premade"); }}
            />
            <SectionCard
              title="Submitted Signature Sheets"
              sub="Every signed Right to Treat, kept for all of history"
              icon={<FolderLock className="w-8 h-8" />}
              tone="amber"
              onClick={() => handleOpenSubmitted("right_to_treat")}
            />
          </div>
        </div>
        <PasswordDialog />
      </div>
    );
  }

  // --- MEAL PERIOD WAIVER: Blank / Submitted ---
  if (activeView === "waiver-menu") {
    return (
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-8 max-sm:flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => setActiveView("menu")}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <img src={crestLogo} alt="Crest" className="h-10" />
            <h1 className="text-2xl font-bold text-foreground">Meal Period Waiver</h1>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionCard
              title="Blank Signature Sheet"
              sub="Fill out and sign a waiver on the spot"
              icon={<FileText className="w-8 h-8" />}
              tone="violet"
              onClick={() => setActiveView("waiver")}
            />
            <SectionCard
              title="Submitted Signature Sheets"
              sub="Every signed waiver, kept for all of history"
              icon={<FolderLock className="w-8 h-8" />}
              tone="amber"
              onClick={() => handleOpenSubmitted("meal_period_waiver")}
            />
          </div>
        </div>
        <PasswordDialog />
      </div>
    );
  }

  // --- BLANK Right to Treat: sign now ---
  if (activeView === "blank-rtt") {
    return (
      <PageShell back={() => setActiveView("rtt-menu")}>
        <RightToTreatSheet mode="sign" submitting={submitting} onSubmit={handleRttBlankSign} />
      </PageShell>
    );
  }

  // --- PRE-MADE: list ---
  if (activeView === "premade") {
    return (
      <PageShell back={() => setActiveView("rtt-menu")} title="Pre-Made Signature Sheets">
        <Button className="w-full mb-4" onClick={() => setActiveView("premade-new")}>
          <Plus className="w-4 h-4 mr-2" />Prepare a sheet for a customer
        </Button>
        {loadingDocs ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
        ) : pendingDocs.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No pre-made sheets waiting to be signed.</p>
        ) : (
          <div className="space-y-3">
            {pendingDocs.map((doc) => (
              <Card key={doc.id} className="hover:shadow-md transition-all">
                <CardContent className="flex items-center justify-between gap-3 p-4">
                  <div className="min-w-0 cursor-pointer flex-1" onClick={() => { setSigningDoc(doc); setActiveView("premade-sign"); }}>
                    <p className="font-medium text-foreground truncate">{doc.employee_name}</p>
                    <p className="text-sm text-muted-foreground truncate">
                      {docLabel(doc.document_type)}
                      {doc.form_data?.signer_name ? ` • ${doc.form_data.signer_name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />Prepared {new Date(doc.created_at).toLocaleDateString()} · waiting for signature
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button size="sm" onClick={() => { setSigningDoc(doc); setActiveView("premade-sign"); }}>
                      <FilePen className="w-4 h-4 mr-1" />Sign
                    </Button>
                    <Button
                      variant="ghost" size="icon" title="Download blank PDF"
                      onClick={() => downloadRightToTreatAgreementPdf({ ...(doc.form_data || {}), right_to_enter: false, terms_agreed: false })}
                    >
                      <Download className="w-4 h-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => handleDeletePending(doc)}>
                      <Trash2 className="w-4 h-4 text-muted-foreground" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </PageShell>
    );
  }

  // --- PRE-MADE: office prepares a sheet ---
  if (activeView === "premade-new") {
    return (
      <PageShell back={() => setActiveView("premade")}>
        <RightToTreatSheet mode="prepare" submitting={submitting} onSubmit={(d) => handleRttPrepare(d)} />
      </PageShell>
    );
  }

  // --- PRE-MADE: customer signs ---
  if (activeView === "premade-sign" && signingDoc) {
    return (
      <PageShell back={() => { setSigningDoc(null); setActiveView("premade"); }}>
        <RightToTreatSheet
          key={signingDoc.id}
          mode="sign"
          initial={signingDoc.form_data}
          submitting={submitting}
          onSubmit={handleRttSignPremade}
        />
      </PageShell>
    );
  }

  // --- SUBMITTED DOCS VIEW ---
  if (activeView === "submitted") {
    if (viewingDoc && viewingDoc.document_type === "right_to_treat") {
      const fd = viewingDoc.form_data || {};
      const Row = ({ l, v }: { l: string; v?: string | null }) => (
        <div><span className="font-medium">{l}:</span> {v || "—"}</div>
      );
      return (
        <PageShell back={() => setViewingDoc(null)} title={`Right to Treat — ${viewingDoc.employee_name}`}>
          <Card>
            <RttHeader />
            <CardContent className="space-y-4 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
                <div className="sm:col-span-2"><Row l="Service Address" v={fd.service_address || viewingDoc.work_location} /></div>
                {fd.property_name ? <Row l="Customer / Property" v={fd.property_name} /> : null}
                <Row l="Date" v={fd.form_date || viewingDoc.form_date} />
                {fd.unit_or_area ? <Row l="Unit / Area" v={fd.unit_or_area} /> : null}
                <Row l="Crest Representative" v={fd.crest_representative} />
                <Row l="Signer" v={fd.signer_name || viewingDoc.employee_printed_name} />
                {fd.signer_relationship ? <Row l="Relationship" v={fd.signer_relationship} /> : null}
                <Row l="Email" v={fd.signer_email} />
                <Row l="Phone" v={fd.signer_phone} />
              </div>
              <hr />
              <RttTermsBody compact />
              <div className="space-y-1.5 text-xs">
                <p>{fd.right_to_enter ? "☑" : "☐"} {RTT_RIGHT_TO_ENTER_ACK}</p>
                <p>{fd.terms_agreed ? "☑" : "☐"} {RTT_TERMS_ACK}</p>
              </div>
              <hr />
              {viewingDoc.employee_signature ? (
                <div>
                  <span className="font-medium">Signature:</span>
                  <img src={viewingDoc.employee_signature} alt="Signature" className="h-20 mt-1 border rounded p-1 bg-white" />
                </div>
              ) : (
                <div><span className="font-medium">Signature:</span> Not signed</div>
              )}
              <p className="text-xs text-muted-foreground">
                Signed: {viewingDoc.employee_signed_date ? fmtDate(viewingDoc.employee_signed_date, viewingDoc.created_at) : "—"}
                {" · "}Submitted: {new Date(viewingDoc.updated_at || viewingDoc.created_at).toLocaleString()}
                {fd.terms_version ? ` · Terms v${fd.terms_version}` : ""}
              </p>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => downloadRightToTreatAgreementPdf({
                  ...fd,
                  signatureDataUrl: viewingDoc.employee_signature,
                  signedAt: viewingDoc.employee_signed_date ? `${viewingDoc.employee_signed_date}T12:00:00` : viewingDoc.updated_at || viewingDoc.created_at,
                })}
              >
                <Download className="w-4 h-4 mr-2" />Download signed PDF
              </Button>
            </CardContent>
          </Card>
        </PageShell>
      );
    }

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
            <Button variant="ghost" size="icon" onClick={submittedBack}>
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">Submitted {docLabel(submittedType)} Sheets</h1>
          </div>

          {loadingDocs ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : submittedDocs.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No {docLabel(submittedType).toLowerCase()} sheets submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {submittedDocs.map((doc) => (
                <Card
                  key={doc.id}
                  className="cursor-pointer hover:shadow-md transition-all"
                  onClick={() => setViewingDoc(doc)}
                >
                  <CardContent className="flex items-center justify-between p-4 gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{doc.employee_name}</p>
                      <p className="text-sm text-muted-foreground truncate">
                        {docLabel(doc.document_type)}
                        {doc.document_type === "right_to_treat" && doc.work_location && doc.work_location !== doc.employee_name
                          ? ` • ${doc.work_location}` : ""}
                        {" • "}{fmtDate(doc.employee_signed_date || doc.form_date, doc.created_at)}
                      </p>
                    </div>
                    <Eye className="w-5 h-5 text-muted-foreground shrink-0" />
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
          <Button variant="ghost" size="icon" onClick={() => setActiveView("waiver-menu")}>
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
                <Select
                  value={employeeChoice}
                  onValueChange={(v) => {
                    setEmployeeChoice(v);
                    setEmployeeName(v === OTHER_EMPLOYEE ? "" : v);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYEES.map((name) => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                    <SelectItem value={OTHER_EMPLOYEE}>Other (type a name)</SelectItem>
                  </SelectContent>
                </Select>
                {employeeChoice === OTHER_EMPLOYEE && (
                  <Input
                    value={employeeName}
                    onChange={(e) => setEmployeeName(e.target.value)}
                    placeholder="Type the employee's full name"
                    autoFocus
                  />
                )}
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
