import { useRef, useEffect, useState } from 'react';
import { Canvas as FabricCanvas, FabricImage, Rect, IText, Group, Circle as FabricCircle } from 'fabric';
import bugIcon from '@/assets/icons/bug-icon.svg';
import ratIcon from '@/assets/icons/rat-icon.svg';
import boxIcon from '@/assets/icons/box-icon.svg';
import squareIcon from '@/assets/icons/square-icon.svg';
import treeIcon from '@/assets/icons/tree-icon.svg';
import circleIcon from '@/assets/icons/circle-icon.svg';
import entryPointIcon from '@/assets/icons/entry-point-icon.svg';
import waterSourceIcon from '@/assets/icons/water-source-icon.svg';
import { createSavedLineObject, getSavedMapObjects, getSavedMapVersion, isSavedTextObject, reviveSavedFabricObject } from '@/lib/mapCanvasLoader';

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
      const objectsArray = getSavedMapObjects(parsed);
      let savedLegendItems: LegendItem[] = [];
      const savedVersion = getSavedMapVersion(parsed);
      
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
        const objType = String(obj.type || '').toLowerCase();
        console.log('Processing object:', objType, obj);
        
        // Handle group objects (numbered icons)
        if ((objType === 'group' || objType === 'image') && obj.data?.iconType) {
          const iconType = obj.data.iconType;
          const iconNumber = obj.data.iconNumber;
          const iconInfo = AVAILABLE_ICONS.find(i => i.icon === iconType);
          
          if (iconInfo) {
            foundIcons.add(iconType);
            const promise = FabricImage.fromURL(iconInfo.svgPath).then((img) => {
              const groupObjects: any[] = [img];
              
              if (iconNumber) {
                const badgeSize = 14;
                const badge = new FabricCircle({
                  radius: badgeSize / 2,
                  fill: '#DC2626',
                  originX: 'center',
                  originY: 'center',
                  left: (img.width || 32) / 2 + 8,
                  top: -4,
                });
                const numberText = new IText(String(iconNumber), {
                  fontSize: 10,
                  fill: '#FFFFFF',
                  fontFamily: 'Arial, sans-serif',
                  fontWeight: 'bold',
                  originX: 'center',
                  originY: 'center',
                  left: (img.width || 32) / 2 + 8,
                  top: -4,
                  editable: false,
                  selectable: false,
                });
                groupObjects.push(badge, numberText);
              }
              
              const group = new Group(groupObjects, {
                left: (obj.left || 0) * scaleX,
                top: (obj.top || 0) * scaleY,
                scaleX: iconTargetScale * (obj.scaleX || 1),
                scaleY: iconTargetScale * (obj.scaleY || 1),
                angle: obj.angle || 0,
                selectable: false,
                evented: false,
              });
              canvas.add(group);
            }).catch((err) => {
              console.error('Error loading icon:', iconType, err);
            });
            loadPromises.push(promise);
          }
        } else if (objType === 'image' && obj.data?.iconType) {
          const iconType = obj.data.iconType;
          const iconInfo = AVAILABLE_ICONS.find(i => i.icon === iconType);
          
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
            }).catch((err) => {
              console.error('Error loading icon:', iconType, err);
            });
            loadPromises.push(promise);
          }
        } else if (objType === 'rect') {
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
        } else if (objType === 'line') {
          const line = createSavedLineObject({
            obj,
            left: (obj.left || 0) * scaleX,
            top: (obj.top || 0) * scaleY,
            scaleX: (obj.scaleX || 1) * iconTargetScale,
            scaleY: (obj.scaleY || 1) * iconTargetScale,
            selectable: false,
            evented: false,
          });
          canvas.add(line);
        } else if (isSavedTextObject(obj.type)) {
          const text = new IText(obj.text || '', {
            left: (obj.left || 0) * scaleX,
            top: (obj.top || 0) * scaleY,
            fontSize: (obj.fontSize || 16) * Math.min(scaleX, scaleY) * (obj.scaleX || 1),
            fill: obj.fill || '#000000',
            fontFamily: obj.fontFamily || 'Space Grotesk, sans-serif',
            fontWeight: obj.fontWeight || 'bold',
            backgroundColor: obj.backgroundColor,
            width: obj.width ? obj.width * scaleX : undefined,
            angle: obj.angle || 0,
            selectable: false,
            editable: false,
            evented: false,
          });
          canvas.add(text);
        } else if (objType === 'path') {
          // Freehand drawing paths - reconstruct via loadFromJSON for this single object
          const pathPromise = new Promise<void>((resolveP) => {
            const tempCanvas = new FabricCanvas(document.createElement('canvas'), {
              width: canvas.getWidth(),
              height: canvas.getHeight(),
            });
            tempCanvas.loadFromJSON({ objects: [obj], version: savedVersion }, () => {
              const pathObj = tempCanvas.getObjects()[0];
              if (pathObj) {
                pathObj.set({
                  left: (obj.left || 0) * scaleX,
                  top: (obj.top || 0) * scaleY,
                  scaleX: (obj.scaleX || 1) * Math.min(scaleX, scaleY),
                  scaleY: (obj.scaleY || 1) * Math.min(scaleX, scaleY),
                  selectable: false,
                  evented: false,
                });
                pathObj.setCoords();
                canvas.add(pathObj);
              }
              tempCanvas.dispose();
              resolveP();
            });
          });
          loadPromises.push(pathPromise);
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
