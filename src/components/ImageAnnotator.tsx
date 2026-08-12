import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { X, Undo2, Trash2, Check } from "lucide-react";

interface ImageAnnotatorProps {
  imageUrl: string;
  open: boolean;
  onClose: () => void;
  onSave: (annotatedImageDataUrl: string) => void;
}

const COLORS = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#FFFFFF", "#000000"];
const BRUSH_SIZES = [2, 4, 8, 12];

const ImageAnnotator = ({ imageUrl, open, onClose, onSave }: ImageAnnotatorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#FF0000");
  const [brushSize, setBrushSize] = useState(4);
  const [history, setHistory] = useState<ImageData[]>([]);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const scaleRef = useRef(1);

  useEffect(() => {
    if (!open || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      bgImageRef.current = img;
      const container = containerRef.current!;
      const maxW = container.clientWidth - 32;
      const maxH = window.innerHeight * 0.6;
      
      const scale = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
      scaleRef.current = scale;
      
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
    };
  }, [open, imageUrl]);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // Scale client coords into buffer space in case the canvas is ever
    // CSS-constrained (dialog animations, small screens).
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const point = "touches" in e ? (e.touches[0] || e.changedTouches[0]) : (e as React.MouseEvent);
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const pos = getPos(e);
    lastPosRef.current = pos;
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    e.preventDefault();
    
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx || !lastPosRef.current) return;

    const pos = getPos(e);
    
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(lastPosRef.current.x, lastPosRef.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    
    lastPosRef.current = pos;
  };

  const endDraw = () => {
    if (!isDrawing || !canvasRef.current) return;
    setIsDrawing(false);
    lastPosRef.current = null;
    
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      setHistory((prev) => [...prev, ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)]);
    }
  };

  const undo = () => {
    if (history.length <= 1 || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
  };

  const clearAll = () => {
    if (!canvasRef.current || !bgImageRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    
    ctx.drawImage(bgImageRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    setHistory([ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height)]);
  };

  const handleSave = () => {
    if (!canvasRef.current || !bgImageRef.current) return;
    
    // Export at full resolution
    const exportCanvas = document.createElement("canvas");
    const img = bgImageRef.current;
    exportCanvas.width = img.naturalWidth;
    exportCanvas.height = img.naturalHeight;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;
    
    // Draw the annotated canvas scaled up to full resolution
    ctx.drawImage(canvasRef.current, 0, 0, img.naturalWidth, img.naturalHeight);
    
    const dataUrl = exportCanvas.toDataURL("image/jpeg", 0.85);
    onSave(dataUrl);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle>Annotate Image</DialogTitle>
        </DialogHeader>
        
        <div ref={containerRef} className="flex flex-col items-center gap-3">
          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`w-7 h-7 rounded-full border-2 ${color === c ? "border-foreground ring-2 ring-primary" : "border-muted-foreground/30"}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <div className="flex gap-1">
              {BRUSH_SIZES.map((s) => (
                <button
                  key={s}
                  className={`w-8 h-8 rounded flex items-center justify-center border ${brushSize === s ? "border-primary bg-primary/10" : "border-border"}`}
                  onClick={() => setBrushSize(s)}
                >
                  <div className="rounded-full bg-foreground" style={{ width: s + 2, height: s + 2 }} />
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={undo} disabled={history.length <= 1}>
              <Undo2 className="w-4 h-4 mr-1" /> Undo
            </Button>
            <Button variant="outline" size="sm" onClick={clearAll}>
              <Trash2 className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>
          
          {/* Canvas */}
          <canvas
            ref={canvasRef}
            className="border-2 border-border rounded-lg cursor-crosshair touch-none max-w-full"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
            onTouchCancel={endDraw}
          />
        </div>
        
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            <X className="w-4 h-4 mr-1" /> Cancel
          </Button>
          <Button onClick={handleSave}>
            <Check className="w-4 h-4 mr-1" /> Save Annotations
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImageAnnotator;
