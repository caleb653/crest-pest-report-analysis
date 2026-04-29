import { useEffect, useRef, useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Inline editable text — click the pencil to edit, type freely, click Save (✓)
 * to persist or X to cancel. Used for portal property names so admins/PMs can
 * rename without opening a dialog. Pure presentation: parent owns persistence
 * via `onSave(next)` and is responsible for refreshing data afterwards.
 */
export function InlineEditableText({
  value,
  onSave,
  className = "",
  inputClassName = "",
  placeholder = "Untitled",
  ariaLabel = "Edit name",
  disabled = false,
  onClickWrapper,
}: {
  value: string;
  onSave: (next: string) => Promise<void> | void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  /** If provided, wraps the static text so parent click handlers (e.g. row navigation) still work when not editing. */
  onClickWrapper?: (e: React.MouseEvent) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) {
      // focus + select on next tick so click handlers don't steal focus
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    if (!next || next === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 max-w-full", className)}
        onClick={(e) => e.stopPropagation()}
      >
        <Input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            else if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          className={cn("h-8 px-2 py-1 text-base font-bold", inputClassName)}
        />
        <Button
          type="button"
          size="icon"
          variant="default"
          className="h-7 w-7 shrink-0"
          onClick={commit}
          disabled={saving}
          aria-label="Save"
        >
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-7 w-7 shrink-0"
          onClick={cancel}
          disabled={saving}
          aria-label="Cancel"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 group/edit max-w-full", className)}
      onClick={onClickWrapper}
    >
      <span className="truncate">{value || placeholder}</span>
      {!disabled && (
        <button
          type="button"
          aria-label={ariaLabel}
          onClick={(e) => { e.stopPropagation(); setEditing(true); }}
          className="opacity-40 hover:opacity-100 group-hover/edit:opacity-80 transition-opacity shrink-0 p-1 rounded hover:bg-muted"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      )}
    </span>
  );
}