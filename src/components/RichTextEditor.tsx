import React, { useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Bold, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  className?: string;
  showControls?: boolean;
}

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

  // Convert plain text with • bullets to display format
  const formatForDisplay = (text: string): string => {
    if (!text) return "";
    // Just return the text as-is, preserving any HTML
    return text;
  };

  // Initialize and sync content
  useEffect(() => {
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

  const handleFontSizeChange = useCallback((newSize: number) => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
      // Get the selected range
      const range = selection.getRangeAt(0);
      const selectedText = range.extractContents();
      
      // Create a span with the new font size
      const span = document.createElement("span");
      span.style.fontSize = `${newSize}px`;
      span.appendChild(selectedText);
      
      // Insert the styled span
      range.insertNode(span);
      
      // Update the content
      handleInput();
    }
    // Also update the base font size
    onFontSizeChange(newSize);
  }, [onFontSizeChange, handleInput]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Handle Ctrl+B for bold
    if (e.ctrlKey && e.key === "b") {
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
              onClick={() => handleFontSizeChange(Math.max(8, fontSize - 1))}
              className="h-6 w-6 p-0"
            >
              <Minus className="w-3 h-3" />
            </Button>
            <span className="text-xs w-6 text-center">{fontSize}</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleFontSizeChange(Math.min(24, fontSize + 1))}
              className="h-6 w-6 p-0"
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleBold}
            className="h-6 px-2"
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-3 h-3" />
          </Button>
        </div>
      )}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
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
