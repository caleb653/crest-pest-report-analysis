import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, Square, Circle, Trash2, Type, X } from 'lucide-react';
import { Canvas as FabricCanvas, Rect as FabricRect, Circle as FabricCircle, IText, FabricObject } from 'fabric';

interface MapCanvasProps {
  mapUrl: string;
}

type Tool = 'select' | 'pen' | 'square' | 'circle' | 'text';

const SHAPE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8DADC', '#F4A261', '#E76F51'];

const DEFAULT_LEGEND_ITEMS = [
  { emoji: '🐭', label: 'Rodent activity (mice/rats)' },
  { emoji: '🐜', label: 'Ants' },
  { emoji: '🪳', label: 'Cockroaches' },
  { emoji: '🦗', label: 'Crickets' },
  { emoji: '🕷️', label: 'Spiders / general arachnids' },
  { emoji: '🐝', label: 'Bees' },
  { emoji: '🐝⚡', label: 'Aggressive bees / wasps / hornets' },
  { emoji: '🦟', label: 'Mosquitoes / flying insects' },
  { emoji: '🐛', label: 'Other crawling insects / larvae' },
  { emoji: '🕳️', label: 'Entry point (hole/opening)' },
  { emoji: '🚪', label: 'Door gap / threshold issue' },
  { emoji: '🪟', label: 'Window gap issue' },
  { emoji: '🧱', label: 'Foundation crack / wall issue' },
  { emoji: '✅', label: 'Treated area' },
  { emoji: '💊', label: 'Bait station / bait placed' },
  { emoji: '🧪', label: 'Chemical treatment / spray' },
  { emoji: '🪤', label: 'Trap placed' },
  { emoji: '🔁', label: 'Follow-up needed' },
  { emoji: '⚠️', label: 'Monitor this area' },
  { emoji: '🚫', label: 'Access restricted / do not enter' },
];

export const MapCanvas = ({ mapUrl }: MapCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [colorIndex, setColorIndex] = useState(0);
  const [usedColors, setUsedColors] = useState<Set<string>>(new Set());
  const [legendItems, setLegendItems] = useState(DEFAULT_LEGEND_ITEMS);
  const [showLegend, setShowLegend] = useState(true);

  useEffect(() => {
    if (!canvasRef.current) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: window.innerWidth / 2,
      height: window.innerHeight - 92,
      backgroundColor: 'transparent',
    });

    fabricCanvasRef.current = canvas;

    const resizeCanvas = () => {
      canvas.setDimensions({
        width: window.innerWidth / 2,
        height: window.innerHeight - 92,
      });
      canvas.renderAll();
    };

    window.addEventListener('resize', resizeCanvas);

    canvas.on('mouse:down', (e) => {
      if (tool === 'square' || tool === 'circle') {
        const pointer = canvas.getScenePoint(e.e);
        const currentColor = SHAPE_COLORS[colorIndex % SHAPE_COLORS.length];
        
        let shape: FabricObject;
        if (tool === 'square') {
          shape = new FabricRect({
            left: pointer.x - 50,
            top: pointer.y - 50,
            width: 100,
            height: 100,
            fill: 'transparent',
            stroke: currentColor,
            strokeWidth: 3,
          });
        } else {
          shape = new FabricCircle({
            left: pointer.x - 50,
            top: pointer.y - 50,
            radius: 50,
            fill: 'transparent',
            stroke: currentColor,
            strokeWidth: 3,
          });
        }
        
        canvas.add(shape);
        canvas.setActiveObject(shape);
        canvas.renderAll();
        
        setUsedColors(prev => new Set([...prev, currentColor]));
        setColorIndex(prev => prev + 1);
      } else if (tool === 'text') {
        const pointer = canvas.getScenePoint(e.e);
        const text = new IText('Type here', {
          left: pointer.x,
          top: pointer.y,
          fontSize: 16,
          fill: '#000000',
          fontWeight: 'bold',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        canvas.renderAll();
      }
    });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.dispose();
    };
  }, [tool, colorIndex]);

  const clearCanvas = () => {
    if (!fabricCanvasRef.current) return;
    fabricCanvasRef.current.clear();
    setUsedColors(new Set());
    setColorIndex(0);
  };

  const deleteSelected = () => {
    if (!fabricCanvasRef.current) return;
    const activeObjects = fabricCanvasRef.current.getActiveObjects();
    activeObjects.forEach(obj => fabricCanvasRef.current?.remove(obj));
    fabricCanvasRef.current.discardActiveObject();
    fabricCanvasRef.current.renderAll();
  };

  const updateLegendItem = (index: number, field: 'emoji' | 'label', value: string) => {
    setLegendItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const addLegendItem = () => {
    setLegendItems(prev => [...prev, { emoji: '❓', label: 'New item' }]);
  };

  const removeLegendItem = (index: number) => {
    setLegendItems(prev => prev.filter((_, i) => i !== index));
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
        className="absolute inset-0 w-full h-full"
        style={{ pointerEvents: tool === 'select' ? 'auto' : 'auto' }}
      />

      {/* Drawing tools */}
      <div className="absolute top-6 left-6 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-3 flex flex-col gap-2 border border-border">
        <Button
          size="icon"
          variant={tool === 'select' ? 'default' : 'outline'}
          onClick={() => setTool('select')}
          title="Select & Move"
          className="h-10 w-10"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          </svg>
        </Button>
        <Button
          size="icon"
          variant={tool === 'square' ? 'default' : 'outline'}
          onClick={() => setTool('square')}
          title="Rectangle"
          className="h-10 w-10"
        >
          <Square className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'circle' ? 'default' : 'outline'}
          onClick={() => setTool('circle')}
          title="Circle"
          className="h-10 w-10"
        >
          <Circle className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'text' ? 'default' : 'outline'}
          onClick={() => setTool('text')}
          title="Add Text/Emoji"
          className="h-10 w-10"
        >
          <Type className="w-5 h-5" />
        </Button>
        <div className="h-px bg-border my-1" />
        <Button
          size="icon"
          variant="outline"
          onClick={deleteSelected}
          title="Delete selected"
          className="h-10 w-10"
        >
          <X className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={clearCanvas}
          title="Clear all"
          className="h-10 w-10"
        >
          <Trash2 className="w-5 h-5" />
        </Button>
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="absolute bottom-6 left-6 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-4 max-w-sm max-h-96 overflow-y-auto border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">Legend</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowLegend(false)}
              className="h-6 w-6"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="space-y-2">
            {legendItems.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  value={item.emoji}
                  onChange={(e) => updateLegendItem(index, 'emoji', e.target.value)}
                  className="w-12 h-7 text-center text-sm p-0"
                />
                <Input
                  value={item.label}
                  onChange={(e) => updateLegendItem(index, 'label', e.target.value)}
                  className="flex-1 h-7 text-xs"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeLegendItem(index)}
                  className="h-7 w-7"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={addLegendItem}
            className="w-full mt-3 text-xs"
          >
            + Add Item
          </Button>
        </div>
      )}

      {!showLegend && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLegend(true)}
          className="absolute bottom-6 left-6 bg-card/95 backdrop-blur-sm shadow-xl border-border"
        >
          Show Legend
        </Button>
      )}

      {/* Color indicator */}
      {usedColors.size > 0 && (
        <div className="absolute top-6 right-6 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-3 border border-border">
          <div className="text-xs font-medium mb-2">Colors in use:</div>
          <div className="flex gap-2">
            {Array.from(usedColors).map((color, i) => (
              <div
                key={i}
                className="w-6 h-6 rounded-full border-2 border-border"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
