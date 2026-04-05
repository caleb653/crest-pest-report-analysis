import { useRef, useEffect, useState } from 'react';
import { Canvas as FabricCanvas, FabricImage, Rect, Line, IText } from 'fabric';
import bugIcon from '@/assets/icons/bug-icon.svg';
import ratIcon from '@/assets/icons/rat-icon.svg';
import boxIcon from '@/assets/icons/box-icon.svg';
import squareIcon from '@/assets/icons/square-icon.svg';
import treeIcon from '@/assets/icons/tree-icon.svg';
import circleIcon from '@/assets/icons/circle-icon.svg';
import entryPointIcon from '@/assets/icons/entry-point-icon.svg';
import waterSourceIcon from '@/assets/icons/water-source-icon.svg';

interface ReadOnlyMapCanvasProps {
  mapUrl: string;
  mapData?: string | null;
  className?: string;
}

interface LegendItem {
  icon: string;
  label: string;
}

const AVAILABLE_ICONS = [
  { icon: 'bug', label: 'Pest Activity', svgPath: bugIcon },
  { icon: 'rat', label: 'Rodent Activity', svgPath: ratIcon },
  { icon: 'box', label: 'Trap', svgPath: boxIcon },
  { icon: 'square', label: 'Bait Box', svgPath: squareIcon },
  { icon: 'tree', label: 'Trim Trees', svgPath: treeIcon },
  { icon: 'circle', label: 'Mosquito Station', svgPath: circleIcon },
  { icon: 'entry-point', label: 'Entry Point', svgPath: entryPointIcon },
  { icon: 'water-source', label: 'Water Source', svgPath: waterSourceIcon },
];

// Reference size for normalizing coordinates (matches MapCanvas)
const REFERENCE_WIDTH = 750;
const REFERENCE_HEIGHT = 1000;

export const ReadOnlyMapCanvas = ({ mapUrl, mapData, className }: ReadOnlyMapCanvasProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const [legendItems, setLegendItems] = useState<LegendItem[]>([]);
  const hasLoadedRef = useRef(false);
  const [canvasReady, setCanvasReady] = useState(false);

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    const parentRect = containerRef.current.getBoundingClientRect();
    const canvasWidth = parentRect.width || 400;
    const canvasHeight = parentRect.height || 533;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: 'transparent',
      selection: false,
    });

    fabricCanvasRef.current = canvas;

    // Disable all interactions
    canvas.selection = false;
    canvas.hoverCursor = 'default';
    canvas.moveCursor = 'default';
    
    setCanvasReady(true);

    return () => {
      canvas.dispose();
      fabricCanvasRef.current = null;
      setCanvasReady(false);
    };
  }, []);

  // Load saved annotations data
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !mapData || hasLoadedRef.current || !canvasReady) return;

    try {
      const parsed = typeof mapData === 'string' ? JSON.parse(mapData) : mapData;
      console.log('ReadOnlyMapCanvas: Parsed map data:', parsed);
      
      // Handle the nested structure: { objects: { objects: [...] }, legendItems: [...] }
      let objectsArray: any[] = [];
      let savedLegendItems: LegendItem[] = [];
      
      if (parsed.objects?.objects && Array.isArray(parsed.objects.objects)) {
        // New format: { objects: { objects: [...] } }
        objectsArray = parsed.objects.objects;
      } else if (parsed.objects && Array.isArray(parsed.objects)) {
        // Old format: { objects: [...] }
        objectsArray = parsed.objects;
      }
      
      if (parsed.legendItems && Array.isArray(parsed.legendItems)) {
        savedLegendItems = parsed.legendItems;
      }
      
      console.log('ReadOnlyMapCanvas: Found objects:', objectsArray.length, 'legend items:', savedLegendItems.length);
      
      if (objectsArray.length === 0) {
        hasLoadedRef.current = true;
        return;
      }

      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      const scaleX = canvasWidth / REFERENCE_WIDTH;
      const scaleY = canvasHeight / REFERENCE_HEIGHT;
      const iconTargetScale = Math.min(canvasWidth, canvasHeight) / 800;

      const loadPromises: Promise<void>[] = [];
      const foundIcons = new Set<string>();

      objectsArray.forEach((obj: any) => {
        console.log('Processing object:', obj.type, obj);
        
        if (obj.type === 'image' && obj.data?.iconType) {
          const iconType = obj.data.iconType;
          const iconInfo = AVAILABLE_ICONS.find(i => i.icon === iconType);
          console.log('Loading icon:', iconType, 'found info:', !!iconInfo);
          
          if (iconInfo) {
            foundIcons.add(iconType);
            const promise = FabricImage.fromURL(iconInfo.svgPath).then((img) => {
              img.set({
                left: (obj.left || 0) * scaleX,
                top: (obj.top || 0) * scaleY,
                scaleX: iconTargetScale * (obj.scaleX || 1),
                scaleY: iconTargetScale * (obj.scaleY || 1),
                angle: obj.angle || 0,
                selectable: false,
                evented: false,
              });
              canvas.add(img);
              console.log('Added icon to canvas:', iconType);
            }).catch((err) => {
              console.error('Error loading icon:', iconType, err);
            });
            loadPromises.push(promise);
          }
        } else if (obj.type === 'rect') {
          const rect = new Rect({
            left: (obj.left || 0) * scaleX,
            top: (obj.top || 0) * scaleY,
            width: (obj.width || 100) * scaleX * (obj.scaleX || 1),
            height: (obj.height || 50) * scaleY * (obj.scaleY || 1),
            fill: obj.fill,
            stroke: obj.stroke,
            strokeWidth: obj.strokeWidth || 3,
            rx: obj.rx || 4,
            ry: obj.ry || 4,
            selectable: false,
            evented: false,
          });
          canvas.add(rect);
        } else if (obj.type === 'line') {
          const line = new Line([
            (obj.x1 || 0) * scaleX,
            (obj.y1 || 0) * scaleY,
            (obj.x2 || 0) * scaleX,
            (obj.y2 || 0) * scaleY,
          ], {
            stroke: obj.stroke || '#DC2626',
            strokeWidth: obj.strokeWidth || 5,
            selectable: false,
            evented: false,
          });
          canvas.add(line);
        } else if (obj.type === 'i-text' || obj.type === 'text') {
          const text = new IText(obj.text || '', {
            left: (obj.left || 0) * scaleX,
            top: (obj.top || 0) * scaleY,
            fontSize: (obj.fontSize || 16) * Math.min(scaleX, scaleY),
            fill: obj.fill || '#000000',
            fontFamily: obj.fontFamily || 'Space Grotesk, sans-serif',
            fontWeight: obj.fontWeight || 'bold',
            backgroundColor: obj.backgroundColor,
            selectable: false,
            editable: false,
            evented: false,
          });
          canvas.add(text);
        }
      });

      Promise.all(loadPromises).then(() => {
        canvas.renderAll();
        hasLoadedRef.current = true;
        console.log('ReadOnlyMapCanvas: Render complete, objects on canvas:', canvas.getObjects().length);

        // Use saved legend items if available, otherwise build from found icons
        if (savedLegendItems.length > 0) {
          setLegendItems(savedLegendItems);
        } else if (foundIcons.size > 0) {
          const legendData = Array.from(foundIcons).map(iconType => {
            const iconInfo = AVAILABLE_ICONS.find(i => i.icon === iconType);
            return {
              icon: iconType,
              label: iconInfo?.label || 'Icon',
            };
          });
          setLegendItems(legendData);
        }
      });
    } catch (e) {
      console.error('Error loading map annotations:', e);
    }
  }, [mapData, canvasReady]);

  return (
    <div ref={containerRef} className={`relative w-full h-full ${className || ''}`}>
      {/* Background map image */}
      <img
        src={mapUrl}
        alt="Property map"
        className="absolute inset-0 w-full h-full object-contain"
        onError={(e) => {
          console.error('Failed to load map image:', mapUrl);
        }}
      />
      
      {/* Canvas overlay for annotations */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Legend */}
      {legendItems.length > 0 && (
        <div className="absolute bottom-3 left-3 bg-white/95 border border-border rounded-lg p-4 shadow-sm">
          <div className="text-sm font-bold mb-2 text-foreground uppercase tracking-wide">Legend</div>
          <div className="space-y-1.5">
            {legendItems.map((item, idx) => {
              const iconInfo = AVAILABLE_ICONS.find(i => i.icon === item.icon);
              return (
                <div key={idx} className="flex items-center gap-2.5 text-sm">
                  {iconInfo?.svgPath && (
                    <img src={iconInfo.svgPath} alt="" className="w-6 h-6" />
                  )}
                  <span className="text-foreground">{item.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
