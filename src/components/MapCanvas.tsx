import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Type, X, Smile, Square } from 'lucide-react';
import { Canvas as FabricCanvas, IText, Rect as FabricRect, FabricObject } from 'fabric';
import { toast } from 'sonner';

interface MapCanvasProps {
  mapUrl: string;
  onSave?: (canvasData: string) => void;
  initialData?: string | null;
}

type Tool = 'select' | 'text' | 'emoji' | 'rectangle';

interface LegendItem {
  emoji: string;
  label: string;
}

const SHAPE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8DADC', '#F4A261', '#E76F51', '#95A197', '#C3D1C5'];

const AVAILABLE_EMOJIS = [
  '🐭', '🐜', '🪳', '🦗', '🕷️', '🐝', '🦟', '🐛',
  '🕳️', '🚪', '🪟', '🧱', '✅', '🔲', '🪦', '🪤',
  '🔁', '⚠️', '🚫', '📍', '🎯', '❌', '✔️', '⭐',
  '🌳', '💧', '1️⃣', '2️⃣', '3️⃣', '4️⃣'
];

export const MapCanvas = ({ mapUrl, onSave, initialData }: MapCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const rectTextMap = useRef(new WeakMap<FabricRect, boolean>());
  const [tool, setTool] = useState<Tool>('select');
  const [legendItems, setLegendItems] = useState<LegendItem[]>([]);
  const [showLegend, setShowLegend] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState<string>('📍');
  const [isDraggingOverDelete, setIsDraggingOverDelete] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);
  const toolRef = useRef<Tool>('select');
  const selectedEmojiRef = useRef<string>('📍');
  const rectFillColorRef = useRef<string>('#C3D1C5');
  const rectBorderColorRef = useRef<string>('#000000');
  const rectFillTransparentRef = useRef<boolean>(false);
  const [legendPosition, setLegendPosition] = useState({ x: 24, y: 24 });
  const [isDraggingLegend, setIsDraggingLegend] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const legendRef = useRef<HTMLDivElement>(null);
  const [rectFillColor, setRectFillColor] = useState('#C3D1C5');
  const [rectBorderColor, setRectBorderColor] = useState('#000000');
  const [rectFillTransparent, setRectFillTransparent] = useState(false);
  const hasLoadedInitialRef = useRef(false);
  const isTouchRef = useRef(false);
  const clickPlacedRef = useRef(false);
  
  // Map is always non-interactive; overlay canvas handles all interactions so annotations stay above
  const isMapInteractive = false;

  // Keep refs in sync with state
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    selectedEmojiRef.current = selectedEmoji;
  }, [selectedEmoji]);

  useEffect(() => {
    rectFillColorRef.current = rectFillColor;
  }, [rectFillColor]);

  useEffect(() => {
    rectBorderColorRef.current = rectBorderColor;
  }, [rectBorderColor]);

  useEffect(() => {
    rectFillTransparentRef.current = rectFillTransparent;
  }, [rectFillTransparent]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const parentRect = canvasRef.current.parentElement?.getBoundingClientRect();
    const canvas = new FabricCanvas(canvasRef.current, {
      width: parentRect?.width ? Math.floor(parentRect.width) : window.innerWidth,
      height: parentRect?.height ? Math.floor(parentRect.height) : Math.floor(window.innerHeight * 0.6),
      backgroundColor: 'transparent',
    });

    fabricCanvasRef.current = canvas;

    // Detect touch devices to avoid drag-to-delete on mobile
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    isTouchRef.current = !!isTouch;

    const resizeCanvas = () => {
      const parentRect = canvasRef.current?.parentElement?.getBoundingClientRect();
      if (parentRect) {
        canvas.setDimensions({
          width: Math.floor(parentRect.width),
          height: Math.floor(parentRect.height),
        });
        canvas.renderAll();
      }
    };

    window.addEventListener('resize', resizeCanvas);

    canvas.on('mouse:down', (e) => {
      const currentTool = toolRef.current;
      const currentEmoji = selectedEmojiRef.current;
      
      // Robust pointer extraction for Fabric v6
      const evtAny: any = e as any;
      const pt = evtAny?.absolutePointer || evtAny?.pointer || fabricCanvasRef.current?.getPointer(evtAny?.e);

      console.log('Canvas clicked, tool:', currentTool, 'emoji:', currentEmoji, 'pointer:', pt);
      
      if (!pt) return;
      
      if (currentTool === 'emoji') {
        const emoji = new IText(currentEmoji, {
          left: pt.x,
          top: pt.y,
          fontSize: 27,
          fontFamily: 'sans-serif',
          selectable: true,
          editable: false, // Not editable, only moveable
          backgroundColor: '#FFFFFF',
          padding: 4,
          stroke: '#000000',
          strokeWidth: 1,
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
        
        clickPlacedRef.current = true;
        setTool('select');
        setShowEmojiPicker(false);
      } else if (currentTool === 'rectangle') {
        // Create a text box that looks like a rectangle (text is directly editable inside)
        const text = new IText('Type here...', {
          left: pt.x - 60,
          top: pt.y - 40,
          width: 120,
          fontSize: 14,
          fill: '#000000',
          fontWeight: '300',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          textAlign: 'left',
          selectable: true,
          editable: true,
          backgroundColor: rectFillTransparentRef.current ? 'rgba(255,255,255,0.9)' : rectFillColorRef.current,
          stroke: '#000000',
          strokeWidth: 2,
          padding: 10,
          lineHeight: 1.4,
          charSpacing: 0,
        });
        
        canvas.add(text);
        canvas.setActiveObject(text);
        canvas.renderAll();
        
        // Small delay then enter edit mode
        setTimeout(() => {
          text.enterEditing();
          text.selectAll();
          canvas.renderAll();
        }, 100);
        
        clickPlacedRef.current = true;
        setTool('select');
      } else if (currentTool === 'text') {
        const text = new IText('Type here', {
          left: pt.x,
          top: pt.y,
          fontSize: 16,
          fill: '#000000',
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 'bold',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          selectable: true,
          editable: true,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        canvas.renderAll();
        
        clickPlacedRef.current = true;
        setTool('select');
      }
    });

    // No need for separate keydown handler since rectangles are now text boxes

    // Track object movement for drag-to-delete
    canvas.on('object:moving', (e) => {
      if (isTouchRef.current) return;
      if (!deleteButtonRef.current || !e.target || !canvasRef.current) return;
      
      const obj = e.target;
      const objBounds = obj.getBoundingRect();
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const objDom = {
        left: canvasRect.left + objBounds.left,
        top: canvasRect.top + objBounds.top,
        right: canvasRect.left + objBounds.left + objBounds.width,
        bottom: canvasRect.top + objBounds.top + objBounds.height,
      };
      const deleteButton = deleteButtonRef.current.getBoundingClientRect();
      
      // Check if object overlaps with delete button (DOM space)
      const isOverDelete = (
        objDom.left < deleteButton.right &&
        objDom.right > deleteButton.left &&
        objDom.top < deleteButton.bottom &&
        objDom.bottom > deleteButton.top
      );
      
      setIsDraggingOverDelete(isOverDelete);
    });

    // Delete on drop over delete button
    canvas.on('mouse:up', (e) => {
      if (isTouchRef.current) {
        setIsDraggingOverDelete(false);
        return;
      }
      if (!deleteButtonRef.current || !e.target || !canvasRef.current) {
        setIsDraggingOverDelete(false);
        return;
      }
      
      const obj = e.target;
      const objBounds = obj.getBoundingRect();
      const canvasRect = canvasRef.current.getBoundingClientRect();
      const objDom = {
        left: canvasRect.left + objBounds.left,
        top: canvasRect.top + objBounds.top,
        right: canvasRect.left + objBounds.left + objBounds.width,
        bottom: canvasRect.top + objBounds.top + objBounds.height,
      };
      const deleteButton = deleteButtonRef.current.getBoundingClientRect();
      
      // Check if dropped over delete button (DOM space)
      const isOverDelete = (
        objDom.left < deleteButton.right &&
        objDom.right > deleteButton.left &&
        objDom.top < deleteButton.bottom &&
        objDom.bottom > deleteButton.top
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

  // Load saved data once (on first mount with data)
  useEffect(() => {
    console.log('MapCanvas load effect triggered', { 
      hasCanvas: !!fabricCanvasRef.current, 
      hasInitialData: !!initialData,
      hasLoaded: hasLoadedInitialRef.current,
      initialDataPreview: initialData ? initialData.substring(0, 100) : 'null'
    });
    
    if (!fabricCanvasRef.current || !initialData || hasLoadedInitialRef.current) return;
    
    try {
      const savedData = JSON.parse(initialData);
      console.log('Parsed saved data:', { 
        hasObjects: !!savedData.objects,
        objectCount: savedData.objects?.objects?.length,
        hasLegend: !!savedData.legendItems 
      });
      
      if (savedData.objects) {
        fabricCanvasRef.current.loadFromJSON(savedData.objects, () => {
          const canvas = fabricCanvasRef.current!;
          console.log('Canvas loaded, object count:', canvas.getObjects().length);
          
          if (savedData.base?.width && savedData.base?.height) {
            const currW = canvas.getWidth();
            const currH = canvas.getHeight();
            const scaleX = currW / savedData.base.width;
            const scaleY = currH / savedData.base.height;
            console.log('Scaling objects:', { scaleX, scaleY, currW, currH, baseW: savedData.base.width, baseH: savedData.base.height });
            
            canvas.getObjects().forEach((obj: any) => {
              obj.scaleX = (obj.scaleX || 1) * scaleX;
              obj.scaleY = (obj.scaleY || 1) * scaleY;
              obj.left = (obj.left || 0) * scaleX;
              obj.top = (obj.top || 0) * scaleY;
              obj.setCoords();
            });
          }
          canvas.renderAll();
        });
      }
      if (savedData.legendItems) {
        setLegendItems(savedData.legendItems);
        setShowLegend(true);
      }
      hasLoadedInitialRef.current = true;
      console.log('Load complete, hasLoadedInitialRef set to true');
    } catch (error) {
      console.error('Error loading canvas data:', error);
    }
  }, [initialData]);

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
      '🔲': 'Bait station',
      '🪦': 'Rodent tunnel',
      '🪤': 'Trap placed',
      '🔁': 'Follow-up needed',
      '⚠️': 'Monitor area',
      '🚫': 'Access restricted',
      '📍': 'Point of interest',
      '🌳': 'Cut trees',
      '💧': 'Reduce water',
      '1️⃣': 'Point 1',
      '2️⃣': 'Point 2',
      '3️⃣': 'Point 3',
      '4️⃣': 'Point 4',
    };
    return labels[emoji] || 'Bait station';
  };

  // Auto-save canvas data whenever it changes
  useEffect(() => {
    if (!fabricCanvasRef.current || !onSave) return;
    
    const saveCanvasData = () => {
      if (!fabricCanvasRef.current) return;
      const canvasJSON = fabricCanvasRef.current.toJSON();
      const canvasData = JSON.stringify({
        objects: canvasJSON,
        legendItems: legendItems,
        base: { width: fabricCanvasRef.current.getWidth(), height: fabricCanvasRef.current.getHeight() }
      });
      console.log('Saving canvas data:', { 
        objectCount: canvasJSON.objects?.length,
        legendCount: legendItems.length,
        dataLength: canvasData.length 
      });
      onSave(canvasData);
    };

    const canvas = fabricCanvasRef.current;
    
    // Save immediately on final actions (mouse up, object modified)
    const handleImmediateSave = () => {
      saveCanvasData();
    };
    
    // Debounce only for continuous events like text editing
    let saveTimeout: NodeJS.Timeout;
    const handleDebouncedSave = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveCanvasData, 100);
    };
    
    canvas.on('object:added', handleImmediateSave);
    canvas.on('object:modified', handleImmediateSave);
    canvas.on('object:removed', handleImmediateSave);
    canvas.on('mouse:up', handleImmediateSave);
    canvas.on('text:changed', handleDebouncedSave as any);
    
    return () => {
      clearTimeout(saveTimeout);
      canvas.off('object:added', handleImmediateSave);
      canvas.off('object:modified', handleImmediateSave);
      canvas.off('object:removed', handleImmediateSave);
      canvas.off('mouse:up', handleImmediateSave);
      canvas.off('text:changed', handleDebouncedSave as any);
    };
  }, [onSave, legendItems]);

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

  const handleLegendMouseDown = (e: React.MouseEvent) => {
    if (legendRef.current) {
      const rect = legendRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDraggingLegend(true);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingLegend && legendRef.current) {
        const container = legendRef.current.parentElement;
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const newX = e.clientX - containerRect.left - dragOffset.x;
          const newY = e.clientY - containerRect.top - dragOffset.y;
          
          // Keep legend within bounds
          const legendRect = legendRef.current.getBoundingClientRect();
          const maxX = containerRect.width - legendRect.width;
          const maxY = containerRect.height - legendRect.height;
          
          setLegendPosition({
            x: Math.max(0, Math.min(newX, maxX)),
            y: Math.max(0, Math.min(newY, maxY))
          });
        }
      }
    };

    const handleMouseUp = () => {
      setIsDraggingLegend(false);
    };

    if (isDraggingLegend) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDraggingLegend, dragOffset]);

  return (
    <div className="relative w-full h-full">
      {/* Map iframe */}
      <iframe
        className="absolute inset-0 w-full h-full rounded-lg border-2 border-foreground"
        style={{ 
          border: '2px solid hsl(var(--foreground))',
          pointerEvents: 'none',
          zIndex: 0
        }}
        loading="lazy"
        allowFullScreen
        src={mapUrl}
      />

      {/* Drawing canvas overlay */}
      <canvas
        ref={canvasRef}
        id="map-overlay-canvas"
        className="absolute inset-0 w-full h-full"
        style={{ 
          pointerEvents: 'auto',
          zIndex: 10
        }}
      />

      {/* Drawing tools */}
      <div className="no-print absolute bottom-4 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-2 flex flex-row gap-1.5 border border-border z-50">
        <Button
          size="icon"
          variant={tool === 'select' ? 'default' : 'outline'}
          onClick={() => setTool('select')}
          title="Select & Move (Pan Map)"
          className="h-8 w-8"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          </svg>
        </Button>
        <Button
          size="icon"
          variant={tool === 'rectangle' ? 'default' : 'outline'}
          onClick={() => { setTool('rectangle'); setShowEmojiPicker(false); }}
          title="Rectangle"
          className="h-8 w-8"
        >
          <Square className="w-4 h-4" />
        </Button>
        {tool === 'rectangle' && (
          <div className="flex flex-col gap-1 p-2 border-l border-border">
            <div className="flex items-center gap-1">
              <label className="text-xs whitespace-nowrap">Fill:</label>
              <input
                type="color"
                value={rectFillColor}
                onChange={(e) => setRectFillColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
                title="Fill Color"
                disabled={rectFillTransparent}
              />
            </div>
            <div className="flex items-center gap-1 px-1">
              <input
                type="checkbox"
                id="transparent-fill"
                checked={rectFillTransparent}
                onChange={(e) => setRectFillTransparent(e.target.checked)}
                className="cursor-pointer"
              />
              <label htmlFor="transparent-fill" className="text-xs cursor-pointer">
                Transparent
              </label>
            </div>
            <div className="flex items-center gap-1">
              <label className="text-xs whitespace-nowrap">Border:</label>
              <input
                type="color"
                value={rectBorderColor}
                onChange={(e) => setRectBorderColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
                title="Border Color"
              />
            </div>
          </div>
        )}
        <Button
          size="icon"
          variant={tool === 'emoji' || showEmojiPicker ? 'default' : 'outline'}
          onClick={() => { setTool('emoji'); setShowEmojiPicker((prev) => !prev); }}
          title="Add Emoji/Icon"
          className="h-8 w-8"
        >
          <Smile className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'text' ? 'default' : 'outline'}
          onClick={() => setTool('text')}
          title="Add Text"
          className="h-8 w-8"
        >
          <Type className="w-4 h-4" />
        </Button>
        <div className="w-px bg-border mx-0.5" />
        <Button
          ref={deleteButtonRef}
          size="icon"
          variant={isDraggingOverDelete ? 'destructive' : 'outline'}
          title="Drag items here to delete"
          className={`h-8 w-8 transition-all ${isDraggingOverDelete ? 'scale-110 shadow-lg' : ''}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <Button
          size="icon"
          variant="outline"
          onClick={clearCanvas}
          title="Clear all"
          className="h-8 w-8"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <div className="no-print absolute bottom-16 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-4 border border-border z-50">
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
        <div 
          ref={legendRef}
          className="absolute bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-2 max-w-[200px] max-h-64 overflow-y-auto border border-border cursor-move z-40"
          style={{ 
            left: `${legendPosition.x}px`, 
            top: `${legendPosition.y}px`,
            userSelect: 'none'
          }}
          onMouseDown={handleLegendMouseDown}
        >
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-xs">Legend</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                setShowLegend(false);
              }}
              className="no-print h-5 w-5"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="space-y-1">
            {legendItems.map((item, index) => (
              <div key={index} className="flex items-center gap-1">
                <span className="text-sm w-6 text-center">{item.emoji}</span>
                <Input
                  value={item.label}
                  onChange={(e) => updateLegendItem(index, 'label', e.target.value)}
                  className="flex-1 h-6 text-xs"
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeLegendItem(index);
                  }}
                  className="h-6 w-6"
                >
                  <X className="w-2 h-2" />
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
          className="no-print absolute bottom-4 left-4 bg-card/95 backdrop-blur-sm shadow-xl border-border text-xs h-7"
        >
          Legend ({legendItems.length})
        </Button>
      )}
    </div>
  );
};
