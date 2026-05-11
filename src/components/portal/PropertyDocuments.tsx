import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { FileText, Upload, Download, Trash2, Eye, Copy, FilePlus } from "lucide-react";

interface PortalDocument {
  id: string;
  property_id: string;
  title: string;
  description: string | null;
  file_url: string;
  file_name: string | null;
  file_type: string | null;
  category: string | null;
  uploaded_by: string | null;
  created_at: string;
}

interface Props {
  propertyId: string;
  uploadedBy?: string;
  /** Optional heading shown above the section. */
  heading?: string;
  /** Optional helper text under the heading. */
  helperText?: string;
}

export const PropertyDocuments = ({ propertyId, uploadedBy, heading, helperText }: Props) => {
  const [docs, setDocs] = useState<PortalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("portal_documents")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    setDocs(Array.isArray(data) ? data : []);
    setLoading(false);
  };

  useEffect(() => {
    if (propertyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Choose a file first", variant: "destructive" });
      return;
    }
    const finalTitle = title.trim() || file.name;
    setUploading(true);
    try {
      const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
      const path = `${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("portal-documents")
        .upload(path, file, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("portal-documents").getPublicUrl(path);

      const { error: insErr } = await (supabase as any).from("portal_documents").insert({
        property_id: propertyId,
        title: finalTitle,
        description: description.trim() || null,
        file_url: pub.publicUrl,
        file_name: file.name,
        file_type: file.type || null,
        category: "general",
        uploaded_by: uploadedBy || null,
      });
      if (insErr) throw insErr;

      toast({ title: "Document uploaded", description: finalTitle });
      setTitle("");
      setDescription("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Could not upload document.",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: PortalDocument) => {
    if (!confirm(`Delete "${doc.title}"?`)) return;
    try {
      await (supabase as any).from("portal_documents").delete().eq("id", doc.id);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
      toast({ title: "Document deleted" });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: e instanceof Error ? e.message : "Could not delete.",
        variant: "destructive",
      });
    }
  };

  const copyLink = async (url: string) => {
    await navigator.clipboard.writeText(url);
    toast({ title: "Link copied" });
  };

  return (
    <div className="space-y-4">
      <div className="border-b-2 border-primary/70 pb-3">
        <h3 className="text-xl font-bold flex items-center gap-2">
          <FileText className="w-6 h-6 text-secondary" />
          {heading || "Property Documents"}
          <Badge variant="secondary" className="text-xs ml-1">{docs.length}</Badge>
        </h3>
        <p className="text-xs text-muted-foreground mt-1">
          {helperText ||
            "Upload PDFs, images, or other files (notices, agreements, forms). These are visible to anyone with the property link."}
        </p>
      </div>

      {/* Upload card */}
      <Card className="shadow-sm border-primary/30 bg-primary/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FilePlus className="w-4 h-4 text-primary" />
            <p className="text-sm font-semibold">Upload a new document</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Title (optional)</Label>
              <Input
                placeholder="Defaults to filename"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">File</Label>
              <Input
                ref={fileInputRef}
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="h-9 text-sm"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp,.heic,.txt,.csv"
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Description (optional)</Label>
            <Textarea
              placeholder="Short note about this document"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="text-sm min-h-[60px]"
            />
          </div>
          <Button onClick={handleUpload} disabled={uploading || !file} size="sm" className="h-9">
            <Upload className="w-4 h-4 mr-1.5" />
            {uploading ? "Uploading…" : "Upload Document"}
          </Button>
        </CardContent>
      </Card>

      {/* Document list */}
      {loading ? (
        <Card className="shadow-sm"><CardContent className="p-6 text-center text-sm text-muted-foreground">Loading…</CardContent></Card>
      ) : docs.length === 0 ? (
        <Card className="shadow-sm"><CardContent className="p-8 text-center text-sm text-muted-foreground">No documents uploaded yet</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {docs.map(doc => (
            <Card key={doc.id} className="shadow-sm">
              <CardContent className="p-3 flex flex-wrap items-start gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="text-sm font-semibold">{doc.title}</p>
                  {doc.description && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{doc.description}</p>}
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {doc.file_name || "file"} · {new Date(doc.created_at).toLocaleString()}
                    {doc.uploaded_by ? ` · by ${doc.uploaded_by}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" className="h-9 text-sm"
                    onClick={() => window.open(doc.file_url, "_blank", "noopener,noreferrer")}>
                    <Eye className="w-3.5 h-3.5 mr-1" />View
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 text-sm" asChild>
                    <a href={doc.file_url} download={doc.file_name || doc.title}>
                      <Download className="w-3.5 h-3.5 mr-1" />Download
                    </a>
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 text-sm" onClick={() => copyLink(doc.file_url)}>
                    <Copy className="w-3.5 h-3.5 mr-1" />Copy Link
                  </Button>
                  <Button size="sm" variant="outline" className="h-9 text-sm text-destructive hover:text-destructive"
                    onClick={() => handleDelete(doc)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default PropertyDocuments;