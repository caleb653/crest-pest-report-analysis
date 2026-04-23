import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { MessageSquare, Send, Trash2 } from "lucide-react";

export type CommentSender = "crest" | "pm";

export interface ServiceComment {
  id: string;
  sender: CommentSender;
  author: string;
  text: string;
  created_at: string;
}

interface Props {
  comments: ServiceComment[];
  serviceId: string;
  /** When set, comments are stored on unit_details[unitIndex].comments. Otherwise on report_data.comments. */
  unitIndex?: number;
  /** Existing service.report_data — needed when writing service-level comments so we don't overwrite siblings. */
  reportData?: any;
  /** Existing service.unit_details — needed when writing unit-level comments so we don't overwrite siblings. */
  unitDetails?: any[];
  sender: CommentSender;
  /** Default author name (e.g. tech name for crest, POC name for pm). */
  defaultAuthor?: string;
  /** Force read-only (e.g. for non-admin views that don't allow Crest comments). */
  readOnly?: boolean;
  /** Compact label (used inside unit cards). */
  compact?: boolean;
  /** Only display + post comments from this sender. Used to render two side-by-side boxes. */
  filterSender?: CommentSender;
  /** Override box label (defaults derived from sender/compact). */
  title?: string;
  onChange: () => void | Promise<void>;
}

const senderMeta: Record<CommentSender, { label: string; chipClass: string; avatarClass: string; initials: (name: string) => string }> = {
  crest: {
    label: "Crest Team",
    chipClass: "bg-primary text-primary-foreground",
    avatarClass: "bg-primary text-primary-foreground",
    initials: (n) => (n.trim()[0] || "C").toUpperCase(),
  },
  pm: {
    label: "Property Manager",
    chipClass: "bg-sky-600 text-white",
    avatarClass: "bg-sky-600 text-white",
    initials: (n) => (n.trim()[0] || "P").toUpperCase(),
  },
};

const fmtTime = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  } catch { return ""; }
};

export const ServiceComments = ({
  comments, serviceId, unitIndex, reportData, unitDetails,
  sender, defaultAuthor = "", readOnly = false, compact = false, filterSender, title, onChange,
}: Props) => {
  const [draft, setDraft] = useState("");
  const [author, setAuthor] = useState(defaultAuthor);
  const [saving, setSaving] = useState(false);

  const sorted = useMemo(
    () => [...comments]
      .filter(c => filterSender ? c.sender === filterSender : true)
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "")),
    [comments, filterSender]
  );

  const persist = async (next: ServiceComment[]) => {
    setSaving(true);
    let payload: Record<string, any>;
    if (typeof unitIndex === "number") {
      const arr = Array.isArray(unitDetails) ? [...unitDetails] : [];
      arr[unitIndex] = { ...(arr[unitIndex] || {}), comments: next };
      payload = { unit_details: arr };
    } else {
      payload = { report_data: { ...(reportData || {}), comments: next } };
    }
    const { error } = await supabase.from("portal_services").update(payload).eq("id", serviceId);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save comment", description: error.message, variant: "destructive" });
      return false;
    }
    return true;
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    const finalAuthor = author.trim() || senderMeta[sender].label;
    const newComment: ServiceComment = {
      id: (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      sender, author: finalAuthor, text, created_at: new Date().toISOString(),
    };
    // Persist against the FULL comments array (not the filtered view) so the other side's posts are preserved.
    const ok = await persist([...comments, newComment]);
    if (ok) {
      setDraft("");
      await onChange();
    }
  };

  const remove = async (id: string) => {
    const ok = await persist(comments.filter(c => c.id !== id));
    if (ok) await onChange();
  };

  return (
    <div className={compact ? "mt-2" : "mt-3"}>
      <div className="flex items-center gap-1.5 mb-2">
        <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {title ?? (compact ? "Comments" : "Service Comments")} ({sorted.length})
        </p>
      </div>

      {sorted.length > 0 && (
        <div className="space-y-2 mb-2">
          {sorted.map((c) => {
            const meta = senderMeta[c.sender] || senderMeta.crest;
            const isMine = c.sender === sender;
            return (
              <div key={c.id} className={`flex gap-2 ${isMine ? "flex-row-reverse" : ""}`}>
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${meta.avatarClass}`}>
                  {meta.initials(c.author)}
                </div>
                <div className={`flex-1 max-w-[85%] ${isMine ? "text-right" : ""}`}>
                  <div className={`flex items-center gap-1.5 text-[10px] mb-0.5 ${isMine ? "justify-end" : ""}`}>
                    <span className={`px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${meta.chipClass}`}>{meta.label}</span>
                    <span className="text-muted-foreground font-medium">{c.author}</span>
                    <span className="text-muted-foreground">· {fmtTime(c.created_at)}</span>
                  </div>
                  <div className={`inline-block text-left rounded-lg px-3 py-2 text-xs whitespace-pre-wrap shadow-sm border ${
                    isMine ? "bg-primary/10 border-primary/60" : "bg-muted/60 border-border"
                  }`}>
                    {c.text}
                  </div>
                  {!readOnly && isMine && (
                    <button
                      type="button"
                      onClick={() => remove(c.id)}
                      className="text-[10px] text-muted-foreground hover:text-destructive ml-2 mt-0.5 inline-flex items-center gap-0.5"
                    >
                      <Trash2 className="w-2.5 h-2.5" /> remove
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!readOnly && (
        <div className="rounded-lg border border-border bg-background p-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${senderMeta[sender].avatarClass}`}>
              {senderMeta[sender].initials(author || defaultAuthor)}
            </div>
            <Input
              placeholder={sender === "crest" ? "Your name (Crest)" : "Your name (PM)"}
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className="h-7 text-xs"
            />
          </div>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              compact
                ? `Leave a comment on this unit as ${senderMeta[sender].label}…`
                : `Leave a comment on this service as ${senderMeta[sender].label}…`
            }
            className="text-xs min-h-[60px] resize-y"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={submit} disabled={!draft.trim() || saving} className="h-7 text-xs">
              <Send className="w-3 h-3 mr-1" />{saving ? "Saving…" : "Post"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServiceComments;