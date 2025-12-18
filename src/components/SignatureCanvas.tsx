import { useRef, useEffect, useState, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignatureCanvasProps {
  onSave: (signatureData: string | null) => void;
  initialData?: string | null;
  label?: string;
}

export interface SignatureCanvasRef {
  forceSave: () => string | null;
}

export const SignatureCanvas = forwardRef<SignatureCanvasRef, SignatureCanvasProps>(
  ({ onSave, initialData, label = "Customer Signature" }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);

    // Expose forceSave method to parent
    useImperativeHandle(ref, () => ({
      forceSave: () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasSignature) return null;
        const dataUrl = canvas.toDataURL("image/png");
        onSave(dataUrl);
        return dataUrl;
      },
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Set canvas size
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      ctx.scale(2, 2);

      // Style
      ctx.strokeStyle = "#1a1a2e";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Load initial data if present
      if (initialData) {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, 0, 0, rect.width, rect.height);
          setHasSignature(true);
        };
        img.src = initialData;
      }
    }, [initialData]);

    const getCoordinates = (e: PointerEvent | React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const startDrawing = (e: React.PointerEvent) => {
      e.preventDefault();
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;

      // Capture pointer for reliable tracking on touch devices
      canvas.setPointerCapture(e.pointerId);

      const { x, y } = getCoordinates(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      setIsDrawing(true);
      setHasSignature(true);
    };

    const draw = (e: React.PointerEvent) => {
      e.preventDefault();
      if (!isDrawing) return;

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx) return;

      const { x, y } = getCoordinates(e);
      ctx.lineTo(x, y);
      ctx.stroke();
    };

    const stopDrawing = (e: React.PointerEvent) => {
      if (!isDrawing) return;
      
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.releasePointerCapture(e.pointerId);
      }
      
      setIsDrawing(false);
      saveSignature();
    };

    const saveSignature = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dataUrl = canvas.toDataURL("image/png");
      onSave(dataUrl);
    };

    const clearSignature = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;

      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      setHasSignature(false);
      onSave(null);
    };

    return (
      <div className="space-y-1">
        {label && (
          <span className="text-sm font-medium text-foreground">{label}</span>
        )}
        <div className="relative">
          <div className="border-2 border-border rounded-lg bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              className="w-full h-24 cursor-crosshair touch-none"
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerLeave={stopDrawing}
              onPointerCancel={stopDrawing}
            />
          </div>
          {hasSignature && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearSignature}
              className="no-print h-5 text-xs absolute -bottom-5 right-0 px-1"
            >
              <Eraser className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>
    );
  }
);

SignatureCanvas.displayName = "SignatureCanvas";
