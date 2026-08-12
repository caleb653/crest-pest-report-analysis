import React, { useRef, useEffect, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Minus, Plus, Palette } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  className?: string;
  showControls?: boolean;
}

const FONT_COLORS = [
  { name: "Black", value: "#000000" },
  { name: "Dark Gray", value: "#374151" },
  { name: "Gray", value: "#6b7280" },
  { name: "Red", value: "#dc2626" },
  { name: "Orange", value: "#ea580c" },
  { name: "Green", value: "#16a34a" },
  { name: "Blue", value: "#2563eb" },
  { name: "Purple", value: "#7c3aed" },
];

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = "Enter text...",
  fontSize,
  onFontSizeChange,
  className,
  showControls = true,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const isComposing = useRef(false);
  const [currentColor, setCurrentColor] = useState("#000000");

  // Convert plain text with • bullets to display format
  const formatForDisplay = (text: string): string => {
    if (!text) return "";
    // Just return the text as-is, preserving any HTML
    return text;
  };

  // Initialize and sync content. Never rewrite the DOM mid-composition —
  // iOS autocorrect/dictation fires composition events, and an innerHTML
  // rewrite during one resets the caret to the start of the field.
  useEffect(() => {
    if (isComposing.current) return;
    if (editorRef.current && !isInternalChange.current) {
      const currentContent = editorRef.current.innerHTML;
      const newContent = formatForDisplay(value);
      if (currentContent !== newContent) {
        editorRef.current.innerHTML = newContent;
      }
    }
    isInternalChange.current = false;
  }, [value]);

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true;
      onChange(editorRef.current.innerHTML);
    }
  }, [onChange]);

  const handleBold = useCallback(() => {
    document.execCommand("bold", false);
    editorRef.current?.focus();
    handleInput();
  }, [handleInput]);

  const handleColorChange = useCallback((color: string) => {
    setCurrentColor(color);
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      document.execCommand("foreColor", false, color);
      editorRef.current?.focus();
      handleInput();
    }
  }, [handleInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle Ctrl+B / Cmd+B for bold
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      handleBold();
    }
    
    // Handle Enter to add a bullet point
    if (e.key === "Enter") {
      e.preventDefault();
      document.execCommand("insertHTML", false, "<br>• ");
      handleInput();
    }
  }, [handleBold, handleInput]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    // Convert each line to have a bullet
    const lines = text.split("\n").map(line => {
      const trimmed = line.trim();
      if (!trimmed) return "";
      // Remove existing bullets/dashes and add our bullet
      const cleanLine = trimmed.replace(/^[-•*]\s*/, "");
      return `• ${cleanLine}`;
    }).filter(Boolean).join("<br>");
    
    document.execCommand("insertHTML", false, lines);
    handleInput();
  }, [handleInput]);

  return (
    <div className="flex flex-col h-full">
      {showControls && (
        <div className="flex gap-2 mb-2 no-print items-center flex-wrap">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground">Size:</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onFontSizeChange(Math.max(8, fontSize - 1))}
              className="h-6 w-6 max-md:h-9 max-md:w-9 p-0"
            >
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-xs w-6 text-center">{fontSize}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onFontSizeChange(Math.min(24, fontSize + 1))}
              className="h-6 w-6 max-md:h-9 max-md:w-9 p-0"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBold}
            className="h-6 px-2 max-md:h-9 max-md:px-3"
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-3 h-3" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 max-md:h-9 max-md:px-3"
                title="Text Color"
              >
                <Palette className="w-3 h-3" />
                <div 
                  className="w-2 h-2 rounded-full ml-1 border border-border" 
                  style={{ backgroundColor: currentColor }}
                />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2 bg-white z-50" align="start">
              <div className="flex flex-wrap gap-1 max-w-[120px]">
                {FONT_COLORS.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    className={cn(
                      "w-6 h-6 max-md:w-9 max-md:h-9 rounded border-2 transition-all",
                      currentColor === color.value ? "border-primary scale-110" : "border-transparent hover:border-muted-foreground"
                    )}
                    style={{ backgroundColor: color.value }}
                    onClick={() => handleColorChange(color.value)}
                    title={color.name}
                  />
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">Select text first, then pick color</p>
            </PopoverContent>
          </Popover>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onCompositionStart={() => { isComposing.current = true; }}
        onCompositionEnd={() => { isComposing.current = false; handleInput(); }}
        className={cn(
          "flex-1 leading-relaxed border border-input rounded-md p-3 focus:outline-none focus:ring-2 focus:ring-ring overflow-auto bg-background",
          className
        )}
        style={{ fontSize: `${fontSize}px`, minHeight: "100px" }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
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
};

export default RichTextEditor;
