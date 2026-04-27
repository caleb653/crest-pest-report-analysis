import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Video, Upload, Trash2, Calendar, User } from "lucide-react";

/**
 * QuarterlyVideoTab — HOA-only "Quarterly Video Review" feature.
 *
 * Shown as its own tab in BOTH portals when the property is an HOA:
 *   • Admin (mode="admin"): can upload new MP4/MOV reviews, set a title +
 *     summary comment, and delete past entries.
 *   • PM (mode="pm"): read-only — board members watch the video and read
 *     the summary comment.
 *
 * Storage: video files go to the public `portal-videos` bucket; metadata
 * (title, comment, video_url, uploader, created_at) lives in
 * `portal_quarterly_updates` keyed by `property_id`.
 */

interface QuarterlyUpdate {
  id: string;
  property_id: string;
  title: string | null;
  comment: string | null;
  video_url: string | null;
  file_name: string | null;
  uploaded_by: string | null;
  created_at: string;
}

interface Props {
  propertyId: string;
  mode: "admin" | "pm";
  /** Used to attribute uploads (admin only). */
  uploaderName?: string;
}

export function QuarterlyVideoTab({ propertyId, mode, uploaderName }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<QuarterlyUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [title, setTitle] = useState("");
  const [comment, setComment] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("portal_quarterly_updates")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    if (!error) setItems((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (propertyId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertyId]);

  const handleUpload = async () => {
    if (!pendingFile) {
      toast({ title: "Pick a video file first", variant: "destructive" });
      return;
    }
    if (!title.trim()) {
      toast({ title: "Please enter a title for this quarterly review", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const ext = pendingFile.name.split(".").pop() || "mp4";
      const path = `${propertyId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("portal-videos")
        .upload(path, pendingFile, { upsert: false, contentType: pendingFile.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("portal-videos").getPublicUrl(path);
      const videoUrl = pub.publicUrl;

      const { error: insErr } = await supabase.from("portal_quarterly_updates").insert({
        property_id: propertyId,
        title: title.trim(),
        comment: comment.trim() || null,
        video_url: videoUrl,
        file_name: pendingFile.name,
        uploaded_by: uploaderName || "Crest Admin",
      } as any);
      if (insErr) throw insErr;

      toast({ title: "Quarterly video uploaded" });
      setTitle("");
      setComment("");
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await load();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e?.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (item: QuarterlyUpdate) => {
    if (!window.confirm("Delete this quarterly video review? This cannot be undone.")) return;
    try {
      // Best-effort storage cleanup — derive object path from public URL.
      if (item.video_url) {
        const marker = "/portal-videos/";
        const idx = item.video_url.indexOf(marker);
        if (idx >= 0) {
          const objectPath = item.video_url.slice(idx + marker.length);
          await supabase.storage.from("portal-videos").remove([objectPath]);
        }
      }
      const { error } = await supabase.from("portal_quarterly_updates").delete().eq("id", item.id);
      if (error) throw error;
      toast({ title: "Deleted" });
      await load();
    } catch (e: any) {
      toast({ title: "Delete failed", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      {mode === "admin" && (
        <Card className="border-2 border-primary/40">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Video className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-base">Upload Quarterly Video Review</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Record a short walk-through summarizing the past quarter's pest
              activity, treatments, and recommendations. The HOA board will
              see it on their portal under this same tab.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Title *</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Q4 2026 — Quarterly Review"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Video file (.mp4 / .mov)</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  onChange={(e) => setPendingFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Summary comment (optional)</Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Bullet out key takeaways the board should walk away with…"
                rows={3}
              />
            </div>
            <Button onClick={handleUpload} disabled={uploading || !pendingFile} className="gap-2">
              <Upload className="w-4 h-4" />
              {uploading ? "Uploading…" : "Publish to HOA Board"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base flex items-center gap-2">
            <Video className="w-5 h-5 text-primary" />
            Quarterly Video Reviews
            <Badge variant="secondary" className="ml-1">{items.length}</Badge>
          </h3>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No quarterly video reviews yet.
              {mode === "admin" && " Upload the first one above."}
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {items.map((it) => (
              <Card key={it.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {it.video_url ? (
                    <video
                      src={it.video_url}
                      controls
                      className="w-full bg-black aspect-video"
                      preload="metadata"
                    />
                  ) : (
                    <div className="w-full aspect-video bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      Video unavailable
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-sm truncate">{it.title || "Untitled review"}</p>
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {new Date(it.created_at).toLocaleDateString()}
                          </span>
                          {it.uploaded_by && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {it.uploaded_by}
                            </span>
                          )}
                        </div>
                      </div>
                      {mode === "admin" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:bg-destructive/10"
                          onClick={() => handleDelete(it)}
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    {it.comment && (
                      <p className="text-sm whitespace-pre-wrap text-foreground/90 leading-relaxed">
                        {it.comment}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}