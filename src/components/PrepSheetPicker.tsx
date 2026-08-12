import { useEffect, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Paperclip, ChevronDown, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export interface PrepSheetOption {
  id: string;
  title: string;
  file_url: string | null;
}

interface Props {
  selectedIds: string[];
  onChange: (ids: string[], selectedSheets: PrepSheetOption[]) => void;
}

export function PrepSheetPicker({ selectedIds, onChange }: Props) {
  const [sheets, setSheets] = useState<PrepSheetOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("portal_prep_sheets")
        .select("id, title, file_url")
        .order("title");
      if (!active) return;
      setSheets((data || []).filter((s) => s.file_url));
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next, sheets.filter((s) => next.includes(s.id)));
  };

  const remove = (id: string) => {
    const next = selectedIds.filter((x) => x !== id);
    onChange(next, sheets.filter((s) => next.includes(s.id)));
  };

  const selected = sheets.filter((s) => selectedIds.includes(s.id));

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium flex items-center gap-1.5">
        <Paperclip className="w-3.5 h-3.5" />
        Prep Sheets (optional attachments)
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            disabled={loading}
          >
            <span className="text-sm text-muted-foreground">
              {selected.length === 0
                ? "Select prep sheets to attach…"
                : `${selected.length} prep sheet${selected.length === 1 ? "" : "s"} selected`}
            </span>
            <ChevronDown className="w-4 h-4 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <div className="max-h-72 overflow-y-auto p-1">
            {sheets.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground italic">No prep sheets available.</p>
            ) : sheets.map((s) => {
              const checked = selectedIds.includes(s.id);
              return (
                <button
                  type="button"
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-muted text-left"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  <span className="text-sm">{s.title}</span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <Badge key={s.id} variant="secondary" className="gap-1 pr-1">
              {s.title}
              <button
                type="button"
                onClick={() => remove(s.id)}
                className="hover:bg-muted-foreground/20 rounded-sm p-0.5 max-md:p-1.5"
                aria-label={`Remove ${s.title}`}
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

/** Build attachment payload for send-report-email. */
export function buildPrepSheetAttachments(sheets: PrepSheetOption[]) {
  return sheets
    .filter((s) => s.file_url)
    .map((s) => ({
      url: s.file_url as string,
      filename: `${s.title.replace(/[^\w\s.-]+/g, "").replace(/\s+/g, "_")}.pdf`,
    }));
}