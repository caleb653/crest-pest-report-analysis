import { useEffect, useRef, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Undo2, Check, X } from "lucide-react";

interface InlineImageAnnotatorProps {
  imageUrl: string;
  onSave: (annotatedImageDataUrl: string) => void;
  onCancel: () => void;
}

const COLORS = ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#FFFFFF", "#000000"];
const BRUSH_SIZES = [
  { label: "Thin", size: 2 },
  { label: "Med", size: 4 },
  { label: "Thick", size: 8 },
  { label: "Bold", size: 12 },
];

const InlineImageAnnotator = ({ imageUrl, onSave, onCancel }: InlineImageAnnotatorProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#FF0000");
  const [brushSize, setBrushSize] = useState(4);
  const [history, setHistory] = useState<ImageData[]>([]);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      bgImageRef.current = img;
      const container = containerRef.current!;
      const containerW = container.clientWidth;
      const containerH = container.clientHeight;

      canvas.width = containerW;
      canvas.height = containerH;

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setHistory([ctx.getImageData(0, 0, canvas.width, canvas.height)]);
      setReady(true);
    };
  }, [imageUrl]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      const touch = e.touches[0] || e.changedTouches[0];
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDrawing(true);
    lastPosRef.current = getPos(e);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !canvasRef.current) return;
    e.preventDefault();
    e.stopPropagation();

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
  }, [isDrawing, color, brushSize, getPos]);

  const endDraw = useCallback(() => {
    if (!isDrawing || !canvasRef.current) return;
    setIsDrawing(false);
    lastPosRef.current = null;
    const ctx = canvasRef.current.getContext("2d");
    if (ctx) {
      setHistory((prev) => [...prev, ctx.getImageData(0, 0, canvasRef.current!.width, canvasRef.current!.height)]);
    }
  }, [isDrawing]);

  const undo = () => {
    if (history.length <= 1 || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const newHistory = history.slice(0, -1);
    setHistory(newHistory);
    ctx.putImageData(newHistory[newHistory.length - 1], 0, 0);
  };

  const handleSave = () => {
    if (!canvasRef.current || !bgImageRef.current) return;
    const exportCanvas = document.createElement("canvas");
    const img = bgImageRef.current;
    exportCanvas.width = img.naturalWidth;
    exportCanvas.height = img.naturalHeight;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(canvasRef.current, 0, 0, img.naturalWidth, img.naturalHeight);
    onSave(exportCanvas.toDataURL("image/jpeg", 0.85));
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Toolbar - positioned above the image */}
      <div className="absolute top-1 left-1 right-1 z-20 flex flex-wrap items-center gap-1 bg-black/70 rounded-md px-2 py-1">
        <div className="flex gap-0.5">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`w-5 h-5 rounded-full border-2 ${color === c ? "border-white ring-1 ring-primary" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="flex gap-0.5 ml-1">
          {BRUSH_SIZES.map((b) => (
            <button
              key={b.size}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${brushSize === b.size ? "bg-primary text-primary-foreground" : "bg-white/20 text-white"}`}
              onClick={() => setBrushSize(b.size)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={undo} disabled={history.length <= 1} className="h-5 px-1 text-white hover:bg-white/20 text-[10px]">
          <Undo2 className="w-3 h-3" />
        </Button>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-5 px-1.5 text-white hover:bg-white/20 text-[10px]">
            <X className="w-3 h-3" />
          </Button>
          <Button size="sm" onClick={handleSave} className="h-5 px-1.5 text-[10px] bg-primary">
            <Check className="w-3 h-3 mr-0.5" /> Save
          </Button>
        </div>
      </div>

      {/* Canvas overlay */}
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full z-10 ${ready ? "cursor-crosshair" : ""} touch-none`}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
    </div>
  );
};

export default InlineImageAnnotator;
