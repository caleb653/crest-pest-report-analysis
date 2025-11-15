import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Type, X, Smile, Square } from 'lucide-react';
import { Canvas as FabricCanvas, IText, Rect as FabricRect, FabricObject } from 'fabric';

interface MapCanvasProps {
  mapUrl: string;
}

type Tool = 'select' | 'text' | 'emoji' | 'rectangle';

interface LegendItem {
  emoji: string;
  label: string;
}

const SHAPE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8DADC', '#F4A261', '#E76F51', '#95A197', '#C3D1C5'];

const AVAILABLE_EMOJIS = [
  '🐭', '🐜', '🪳', '🦗', '🕷️', '🐝', '🦟', '🐛',
  '🕳️', '🚪', '🪟', '🧱', '✅', '💊', '🧪', '🪤',
  '🔁', '⚠️', '🚫', '📍', '🎯', '❌', '✔️', '⭐'
];

export const MapCanvas = ({ mapUrl }: MapCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [legendItems, setLegendItems] = useState<LegendItem[]>([]);
  const [showLegend, setShowLegend] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<string>('📍');
  const [isDraggingOverDelete, setIsDraggingOverDelete] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);
  const toolRef = useRef<Tool>('select');
  const selectedEmojiRef = useRef<string>('📍');

  // Keep refs in sync with state
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    selectedEmojiRef.current = selectedEmoji;
  }, [selectedEmoji]);

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
      const currentTool = toolRef.current;
      const currentEmoji = selectedEmojiRef.current;
      
      console.log('Canvas clicked, tool:', currentTool, 'emoji:', currentEmoji);
      
      if (currentTool === 'emoji') {
        const pointer = canvas.getScenePoint(e.e);
        const emoji = new IText(currentEmoji, {
          left: pointer.x,
          top: pointer.y,
          fontSize: 32,
          fontFamily: 'sans-serif',
          selectable: true,
          editable: false, // Not editable, only moveable
        });
        canvas.add(emoji);
        canvas.setActiveObject(emoji);
        canvas.renderAll();
        
        console.log('Emoji added to canvas:', currentEmoji);
        
        // Add to legend if not already there
        setLegendItems(prev => {
          if (!prev.find(item => item.emoji === currentEmoji)) {
            const defaultLabel = getDefaultLabel(currentEmoji);
            setShowLegend(true);
            return [...prev, { emoji: currentEmoji, label: defaultLabel }];
          }
          return prev;
        });
        
        setTool('select');
        setShowEmojiPicker(false);
      } else if (currentTool === 'rectangle') {
        const pointer = canvas.getScenePoint(e.e);
        
        const rect = new FabricRect({
          left: pointer.x - 60,
          top: pointer.y - 40,
          width: 120,
          height: 80,
          fill: '#C3D1C5',
          stroke: '#000000',
          strokeWidth: 4,
          selectable: true,
          hasControls: true,
        });
        
        canvas.add(rect);
        canvas.setActiveObject(rect);
        canvas.renderAll();
        
        setTool('select');
      } else if (currentTool === 'text') {
        const pointer = canvas.getScenePoint(e.e);
        const text = new IText('Type here', {
          left: pointer.x,
          top: pointer.y,
          fontSize: 16,
          fill: '#000000',
          fontWeight: 'bold',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          selectable: true,
          editable: false, // Not editable after creation, only moveable
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.renderAll();
      }
    });

    // Track object movement for drag-to-delete
    canvas.on('object:moving', (e) => {
      if (!deleteButtonRef.current || !e.target) return;
      
      const obj = e.target;
      const objBounds = obj.getBoundingRect();
      const deleteButton = deleteButtonRef.current.getBoundingClientRect();
      
      // Check if object overlaps with delete button
      const isOverDelete = (
        objBounds.left < deleteButton.right &&
        objBounds.left + objBounds.width > deleteButton.left &&
        objBounds.top < deleteButton.bottom &&
        objBounds.top + objBounds.height > deleteButton.top
      );
      
      setIsDraggingOverDelete(isOverDelete);
    });

    // Delete on drop over delete button
    canvas.on('mouse:up', (e) => {
      if (!deleteButtonRef.current || !e.target) {
        setIsDraggingOverDelete(false);
        return;
      }
      
      const obj = e.target;
      const objBounds = obj.getBoundingRect();
      const deleteButton = deleteButtonRef.current.getBoundingClientRect();
      
      // Check if dropped over delete button
      const isOverDelete = (
        objBounds.left < deleteButton.right &&
        objBounds.left + objBounds.width > deleteButton.left &&
        objBounds.top < deleteButton.bottom &&
        objBounds.top + objBounds.height > deleteButton.top
      );
      
      if (isOverDelete) {
        canvas.remove(obj);
        canvas.renderAll();
      }
      
      setIsDraggingOverDelete(false);
    });

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      canvas.dispose();
    };
  }, []); // Only run once on mount

  const getDefaultLabel = (emoji: string): string => {
    const labels: Record<string, string> = {
      '🐭': 'Rodent activity',
      '🐜': 'Ants',
      '🪳': 'Cockroaches',
      '🦗': 'Crickets',
      '🕷️': 'Spiders',
      '🐝': 'Bees',
      '🦟': 'Mosquitoes',
      '🐛': 'Insects',
      '🕳️': 'Entry point',
      '🚪': 'Door gap',
      '🪟': 'Window gap',
      '🧱': 'Foundation crack',
      '✅': 'Treated area',
      '💊': 'Bait station',
      '🧪': 'Chemical treatment',
      '🪤': 'Trap placed',
      '🔁': 'Follow-up needed',
      '⚠️': 'Monitor area',
      '🚫': 'Access restricted',
      '📍': 'Point of interest',
    };
    return labels[emoji] || 'Custom marker';
  };

  const clearCanvas = () => {
    if (!fabricCanvasRef.current) return;
    fabricCanvasRef.current.clear();
    setLegendItems([]);
    setShowLegend(false);
  };

  const updateLegendItem = (index: number, field: 'emoji' | 'label', value: string) => {
    setLegendItems(prev => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };
      return newItems;
    });
  };

  const removeLegendItem = (index: number) => {
    setLegendItems(prev => prev.filter((_, i) => i !== index));
    if (legendItems.length === 1) {
      setShowLegend(false);
    }
  };

  const handleEmojiSelect = (emoji: string) => {
    setSelectedEmoji(emoji);
    setTool('emoji');
    setShowEmojiPicker(false);
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
          variant={tool === 'rectangle' ? 'default' : 'outline'}
          onClick={() => setTool('rectangle')}
          title="Rectangle"
          className="h-10 w-10"
        >
          <Square className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'emoji' || showEmojiPicker ? 'default' : 'outline'}
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          title="Add Emoji/Icon"
          className="h-10 w-10"
        >
          <Smile className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'text' ? 'default' : 'outline'}
          onClick={() => setTool('text')}
          title="Add Text"
          className="h-10 w-10"
        >
          <Type className="w-5 h-5" />
        </Button>
        <div className="h-px bg-border my-1" />
        <Button
          ref={deleteButtonRef}
          size="icon"
          variant={isDraggingOverDelete ? 'destructive' : 'outline'}
          title="Drag items here to delete"
          className={`h-10 w-10 transition-all ${isDraggingOverDelete ? 'scale-110 shadow-lg' : ''}`}
        >
          <Trash2 className="w-5 h-5" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={clearCanvas}
          title="Clear all"
          className="h-10 w-10"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div className="absolute top-6 left-24 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-4 border border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-bold text-sm">Select Icon</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowEmojiPicker(false)}
              className="h-6 w-6"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-6 gap-2 max-w-xs">
            {AVAILABLE_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                onClick={() => handleEmojiSelect(emoji)}
                className={`text-2xl p-2 rounded hover:bg-muted transition-colors ${
                  selectedEmoji === emoji ? 'bg-primary/20 ring-2 ring-primary' : ''
                }`}
                title={emoji}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      {showLegend && legendItems.length > 0 && (
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
                <span className="text-xl w-8 text-center">{item.emoji}</span>
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
        </div>
      )}

      {!showLegend && legendItems.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLegend(true)}
          className="absolute bottom-6 left-6 bg-card/95 backdrop-blur-sm shadow-xl border-border"
        >
          Show Legend ({legendItems.length})
        </Button>
      )}
    </div>
  );
};
