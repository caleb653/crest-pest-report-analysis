import React, { useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Underline as UnderlineIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Lightweight rich text editor for Property Plan / Property Notes.
 * Supports Bold and Underline (Ctrl/Cmd+B, Ctrl/Cmd+U). Stores raw HTML.
 * Plain text values render fine — newlines are preserved via `white-space: pre-wrap`.
 *
 * Note: We do NOT re-sync the editor's innerHTML from `value` on every keystroke
 * (only when it differs from what's currently rendered AND the editor isn't
 * focused). This prevents the cursor jumping / characters disappearing while
 * the user is typing — a problem the previous Textarea-driven flow had.
 */
export default function PlanRichEditor({
  value,
  onChange,
  placeholder,
  className,
  minHeight = 160,
  readOnly,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  readOnly?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Sync external value -> DOM only when not focused and content actually differs.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const isFocused = document.activeElement === el;
    if (isFocused) return;
    if (el.innerHTML !== (value || "")) {
      el.innerHTML = value || "";
    }
  }, [value]);

  const handleInput = useCallback(() => {
    if (ref.current) onChange(ref.current.innerHTML);
  }, [onChange]);

  const exec = (cmd: "bold" | "underline") => {
    document.execCommand(cmd, false);
    ref.current?.focus();
    handleInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) {
      e.preventDefault();
      exec("bold");
    } else if ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U")) {
      e.preventDefault();
      exec("underline");
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    // Paste as plain text to avoid stray styles bleeding in.
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    handleInput();
  };

  return (
    <div className={cn("flex flex-col", className)}>
      {!readOnly && (
      <div className="flex gap-1 mb-1.5 items-center">
        <Button type="button" variant="outline" size="sm" className="h-7 px-2"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("bold")} title="Bold (Ctrl+B)">
          <Bold className="w-3.5 h-3.5" />
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-7 px-2"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec("underline")} title="Underline (Ctrl+U)">
          <UnderlineIcon className="w-3.5 h-3.5" />
        </Button>
        <span className="text-[11px] text-muted-foreground ml-1">Select text, then click B or U.</span>
      </div>
      )}
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onInput={readOnly ? undefined : handleInput}
        onKeyDown={readOnly ? undefined : handleKeyDown}
        onPaste={readOnly ? undefined : handlePaste}
        data-placeholder={placeholder || ""}
        className={cn(
          "flex-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-ring overflow-auto",
          readOnly && "bg-muted/30 cursor-default"
        )}
        style={{ minHeight, whiteSpace: "pre-wrap" }}
      />
      <style>{`
        [data-placeholder]:empty:before {
          content: attr(data-placeholder);
          color: hsl(var(--muted-foreground));
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}