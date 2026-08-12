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
    const saveTimerRef = useRef<number | null>(null);
    const onSaveRef = useRef(onSave);
    useEffect(() => { onSaveRef.current = onSave; }, [onSave]);
    useEffect(() => () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    }, []);

    // Expose forceSave method to parent
    useImperativeHandle(ref, () => ({
      forceSave: () => {
        const canvas = canvasRef.current;
        if (!canvas || !hasSignature) return null;
        if (saveTimerRef.current) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }
        const dataUrl = canvas.toDataURL("image/png");
        onSaveRef.current?.(dataUrl);
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

    // Keep the buffer in sync with the element's rendered size. The dialog
    // this mounts in animates open with a 95% zoom, so the mount-time
    // measurement is stale by the time the user signs; rotation and keyboard
    // open/close also resize the element. Preserve ink across resizes.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ro = new ResizeObserver(() => {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        if (
          Math.abs(canvas.width - rect.width * 2) < 2 &&
          Math.abs(canvas.height - rect.height * 2) < 2
        )
          return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const snapshot = canvas.toDataURL("image/png");
        canvas.width = rect.width * 2;
        canvas.height = rect.height * 2;
        ctx.scale(2, 2);
        ctx.strokeStyle = "#1a1a2e";
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height);
        img.src = snapshot;
      });
      ro.observe(canvas);
      return () => ro.disconnect();
    }, []);

    const getCoordinates = (e: PointerEvent | React.PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: 0, y: 0 };
      // Map client coords into the canvas's logical (post-ctx.scale) space so
      // strokes stay accurate even when rendered size != buffer size.
      const scaleX = canvas.width / 2 / rect.width;
      const scaleY = canvas.height / 2 / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
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
      // Debounce save so users can lift the pen mid-signature without
      // prematurely finalizing. Save 1.2s after the last stroke ends.
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        saveSignature();
      }, 1200);
    };

    const saveSignature = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const dataUrl = canvas.toDataURL("image/png");
      onSaveRef.current?.(dataUrl);
    };

    const clearSignature = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!ctx || !canvas) return;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasSignature(false);
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      onSave(null);
    };

    return (
      <div className="h-full flex flex-col">
        {label && (
          <span className="text-sm font-medium text-foreground">{label}</span>
        )}
        <div className="relative flex-1 flex min-h-0">
          <div className="border border-muted-foreground/30 rounded bg-white overflow-hidden flex-1">
            <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair touch-none"
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
              className="no-print h-5 max-md:h-9 text-xs absolute top-0 right-0 px-1 max-md:px-2 bg-background/80"
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
