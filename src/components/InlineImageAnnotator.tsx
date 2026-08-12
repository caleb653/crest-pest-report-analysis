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
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState("#FF0000");
  const [brushSize, setBrushSize] = useState(4);
  const [history, setHistory] = useState<ImageData[]>([]);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [canvasDims, setCanvasDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!wrapperRef.current) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    img.onload = () => {
      bgImageRef.current = img;
      // Use the wrapper's width (set by the parent aspect-[4/3] container)
      const wrapper = wrapperRef.current!;
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;

      // If parent has no height yet, calculate from aspect ratio
      const canvasW = w || 300;
      const canvasH = h || Math.round(canvasW * 0.75);

      setCanvasDims({ w: canvasW, h: canvasH });
    };
  }, [imageUrl]);

  // Once dims are set and canvas is mounted, draw the image
  useEffect(() => {
    if (!canvasDims || !canvasRef.current || !bgImageRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvasDims.w;
    canvas.height = canvasDims.h;
    ctx.drawImage(bgImageRef.current, 0, 0, canvasDims.w, canvasDims.h);
    setHistory([ctx.getImageData(0, 0, canvasDims.w, canvasDims.h)]);
    setReady(true);
  }, [canvasDims]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // The canvas is CSS-stretched (w-full h-full) over a fixed buffer, so
    // client coords must be scaled into buffer space or strokes drift.
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const point = "touches" in e ? (e.touches[0] || e.changedTouches[0]) : (e as React.MouseEvent);
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY,
    };
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
    <div ref={wrapperRef} className="w-full h-full relative">
      {/* Toolbar */}
      <div className="absolute top-1 left-1 right-1 z-20 flex flex-wrap items-center gap-1 bg-black/70 rounded-md px-2 py-1">
        <div className="flex gap-0.5">
          {COLORS.map((c) => (
            <button
              key={c}
              className={`w-5 h-5 max-md:w-8 max-md:h-8 rounded-full border-2 ${color === c ? "border-white ring-1 ring-primary" : "border-transparent"}`}
              style={{ backgroundColor: c }}
              onClick={() => setColor(c)}
            />
          ))}
        </div>
        <div className="flex gap-0.5 ml-1">
          {BRUSH_SIZES.map((b) => (
            <button
              key={b.size}
              className={`px-1.5 py-0.5 max-md:px-2.5 max-md:py-1.5 rounded text-[9px] max-md:text-xs font-medium ${brushSize === b.size ? "bg-primary text-primary-foreground" : "bg-white/20 text-white"}`}
              onClick={() => setBrushSize(b.size)}
            >
              {b.label}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="sm" onClick={undo} disabled={history.length <= 1} className="h-5 max-md:h-9 px-1 max-md:px-2 text-white hover:bg-white/20 text-[10px]">
          <Undo2 className="w-3 h-3" />
        </Button>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-5 max-md:h-9 px-1.5 max-md:px-2.5 text-white hover:bg-white/20 text-[10px]">
            <X className="w-3 h-3" />
          </Button>
          <Button size="sm" onClick={handleSave} className="h-5 max-md:h-9 px-1.5 max-md:px-2.5 text-[10px] max-md:text-xs bg-primary">
            <Check className="w-3 h-3 mr-0.5" /> Save
          </Button>
        </div>
      </div>

      {/* Canvas - fills the aspect-ratio container */}
      {canvasDims && (
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
          onTouchCancel={endDraw}
        />
      )}
    </div>
  );
};

export default InlineImageAnnotator;
