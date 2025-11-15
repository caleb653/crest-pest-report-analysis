import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Pencil, Eraser, Square, Circle, Undo, Trash2 } from 'lucide-react';

interface MapCanvasProps {
  mapUrl: string;
}

type Tool = 'pen' | 'eraser' | 'square' | 'circle';

export const MapCanvas = ({ mapUrl }: MapCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tool, setTool] = useState<Tool>('pen');
  const [color] = useState('#FF0000');
  const [lineWidth] = useState(3);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to match parent
    const resizeCanvas = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.offsetWidth;
        canvas.height = parent.offsetHeight;
      }
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => window.removeEventListener('resize', resizeCanvas);
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsDrawing(true);
    setStartPos({ x, y });

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = tool === 'eraser' ? '#FFFFFF' : color;
    ctx.lineWidth = tool === 'eraser' ? lineWidth * 3 : lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'pen' || tool === 'eraser') {
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'pen' || tool === 'eraser') {
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  };

  const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === 'square') {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(startPos.x, startPos.y, x - startPos.x, y - startPos.y);
    } else if (tool === 'circle') {
      const radius = Math.sqrt(Math.pow(x - startPos.x, 2) + Math.pow(y - startPos.y, 2));
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(startPos.x, startPos.y, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }

    setIsDrawing(false);
    setStartPos(null);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  return (
    <div className="relative w-full h-full">
      {/* Map iframe */}
      <iframe
        className="absolute inset-0 w-full h-full"
        style={{ border: 0 }}
        loading="lazy"
        src={mapUrl}
      />

      {/* Drawing canvas overlay */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full cursor-crosshair"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
      />

      {/* Drawing tools */}
      <div className="absolute top-4 left-4 bg-card rounded-lg shadow-lg p-2 flex flex-col gap-2">
        <Button
          size="icon"
          variant={tool === 'pen' ? 'default' : 'outline'}
          onClick={() => setTool('pen')}
          title="Pen"
        >
          <Pencil className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'square' ? 'default' : 'outline'}
          onClick={() => setTool('square')}
          title="Rectangle"
        >
          <Square className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'circle' ? 'default' : 'outline'}
          onClick={() => setTool('circle')}
          title="Circle"
        >
          <Circle className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'eraser' ? 'default' : 'outline'}
          onClick={() => setTool('eraser')}
          title="Eraser"
        >
          <Eraser className="w-4 h-4" />
        </Button>
        <div className="h-px bg-border my-1" />
        <Button
          size="icon"
          variant="outline"
          onClick={clearCanvas}
          title="Clear all"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};
