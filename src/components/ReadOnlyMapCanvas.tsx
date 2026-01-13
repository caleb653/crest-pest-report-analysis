import { useRef, useEffect, useState } from 'react';
import { Canvas as FabricCanvas, FabricImage } from 'fabric';
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
  const [legendItems, setLegendItems] = useState<{ icon: string; label: string }[]>([]);
  const hasLoadedRef = useRef(false);

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
      interactive: false,
    });

    fabricCanvasRef.current = canvas;

    // Disable all interactions
    canvas.selection = false;
    canvas.hoverCursor = 'default';
    canvas.moveCursor = 'default';

    return () => {
      canvas.dispose();
    };
  }, []);

  // Load saved annotations data
  useEffect(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas || !mapData || hasLoadedRef.current) return;

    try {
      const parsed = typeof mapData === 'string' ? JSON.parse(mapData) : mapData;
      if (!parsed || !parsed.objects) return;

      const canvasWidth = canvas.getWidth();
      const canvasHeight = canvas.getHeight();
      const scaleX = canvasWidth / REFERENCE_WIDTH;
      const scaleY = canvasHeight / REFERENCE_HEIGHT;
      const iconTargetScale = Math.min(canvasWidth, canvasHeight) / 800;

      const loadPromises: Promise<void>[] = [];
      const foundIcons = new Set<string>();

      parsed.objects.forEach((obj: any) => {
        if (obj.type === 'image' && obj.data?.iconType) {
          const iconType = obj.data.iconType;
          const iconInfo = AVAILABLE_ICONS.find(i => i.icon === iconType);
          if (iconInfo) {
            foundIcons.add(iconType);
            const promise = FabricImage.fromURL(iconInfo.svgPath).then((img) => {
              img.set({
                left: (obj.left || 0) * scaleX,
                top: (obj.top || 0) * scaleY,
                scaleX: iconTargetScale * (obj.normalizedScaleX || 1),
                scaleY: iconTargetScale * (obj.normalizedScaleY || 1),
                angle: obj.angle || 0,
                selectable: false,
                evented: false,
                data: { iconType },
              });
              canvas.add(img);
            });
            loadPromises.push(promise);
          }
        } else if (obj.type === 'rect') {
          // Load rectangles using fabric's built-in deserialization
          import('fabric').then(({ Rect }) => {
            const rect = new Rect({
              left: (obj.left || 0) * scaleX,
              top: (obj.top || 0) * scaleY,
              width: (obj.width || 100) * scaleX,
              height: (obj.height || 50) * scaleY,
              fill: obj.fill,
              stroke: obj.stroke,
              strokeWidth: obj.strokeWidth || 3,
              rx: obj.rx || 4,
              ry: obj.ry || 4,
              selectable: false,
              evented: false,
            });
            canvas.add(rect);
            canvas.renderAll();
          });
        } else if (obj.type === 'line') {
          import('fabric').then(({ Line }) => {
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
            canvas.renderAll();
          });
        } else if (obj.type === 'i-text' || obj.type === 'text') {
          import('fabric').then(({ IText }) => {
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
            canvas.renderAll();
          });
        }
      });

      Promise.all(loadPromises).then(() => {
        canvas.renderAll();
        hasLoadedRef.current = true;

        // Build legend from found icons
        const legendData = Array.from(foundIcons).map(iconType => {
          const iconInfo = AVAILABLE_ICONS.find(i => i.icon === iconType);
          return {
            icon: iconType,
            label: iconInfo?.label || 'Icon',
          };
        });
        
        if (parsed.legend && Array.isArray(parsed.legend)) {
          setLegendItems(parsed.legend);
        } else if (legendData.length > 0) {
          setLegendItems(legendData);
        }
      });
    } catch (e) {
      console.error('Error loading map annotations:', e);
    }
  }, [mapData]);

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
        <div className="absolute bottom-4 left-4 bg-white/95 border border-border rounded-lg p-2 shadow-sm">
          <div className="text-xs font-bold mb-1 text-foreground">Legend</div>
          <div className="space-y-1">
            {legendItems.map((item, idx) => {
              const iconInfo = AVAILABLE_ICONS.find(i => i.icon === item.icon);
              return (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  {iconInfo?.svgPath && (
                    <img src={iconInfo.svgPath} alt="" className="w-4 h-4" />
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
