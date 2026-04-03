import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Type, X, Square, Bug, Minus, Eraser } from 'lucide-react';
import { Canvas as FabricCanvas, IText, Rect as FabricRect, FabricObject, FabricImage, Line, Group } from 'fabric';
import { toast } from 'sonner';
import bugIcon from '@/assets/icons/bug-icon.svg';
import ratIcon from '@/assets/icons/rat-icon.svg';
import boxIcon from '@/assets/icons/box-icon.svg';
import squareIcon from '@/assets/icons/square-icon.svg';
import treeIcon from '@/assets/icons/tree-icon.svg';
import circleIcon from '@/assets/icons/circle-icon.svg';
import entryPointIcon from '@/assets/icons/entry-point-icon.svg';
import waterSourceIcon from '@/assets/icons/water-source-icon.svg';

interface MapCanvasProps {
  mapUrl: string;
  onSave?: (canvasData: string) => void;
  onExportImage?: (imageDataUrl: string) => void;
  initialData?: string | null;
}

type Tool = 'select' | 'text' | 'icon' | 'rectangle' | 'line' | 'eraser';

interface LegendItem {
  icon: string;
  label: string;
}

const SHAPE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8DADC', '#F4A261', '#E76F51', '#95A197', '#C3D1C5'];

const AVAILABLE_ICONS = [
  { icon: 'bug', label: 'Pest Activity', symbol: '◉', svgPath: bugIcon },
  { icon: 'rat', label: 'Rodent Activity', symbol: '▲', svgPath: ratIcon },
  { icon: 'box', label: 'Trap', symbol: '◆', svgPath: boxIcon },
  { icon: 'square', label: 'Bait Box', symbol: '■', svgPath: squareIcon },
  { icon: 'tree', label: 'Trim Trees', symbol: '▼', svgPath: treeIcon },
  { icon: 'circle', label: 'Mosquito Station', symbol: '◯', svgPath: circleIcon },
  { icon: 'entry-point', label: 'Entry Point', symbol: '⊙', svgPath: entryPointIcon },
  { icon: 'water-source', label: 'Water Source', symbol: '💧', svgPath: waterSourceIcon },
];

// Reference size for normalizing coordinates (3:4 aspect ratio to match container)
const REFERENCE_WIDTH = 750;
const REFERENCE_HEIGHT = 1000;

export const MapCanvas = ({ mapUrl, onSave, onExportImage, initialData }: MapCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<FabricCanvas | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  const rectTextMap = useRef(new WeakMap<FabricRect, boolean>());
  const [tool, setTool] = useState<Tool>('select');
  const [legendItems, setLegendItems] = useState<LegendItem[]>([]);
  const [showLegend, setShowLegend] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string>('bug');
  const [isDraggingOverDelete, setIsDraggingOverDelete] = useState(false);
  const [colorIndex, setColorIndex] = useState(0);
  const toolRef = useRef<Tool>('select');
  const selectedIconRef = useRef<string>('bug');
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
  const isLoadingDataRef = useRef(false);
  const isTouchRef = useRef(false);
  const clickPlacedRef = useRef(false);
  // Line drawing state
  const [lineStartPoint, setLineStartPoint] = useState<{ x: number; y: number } | null>(null);
  const lineStartRef = useRef<{ x: number; y: number } | null>(null);
  const tempLineRef = useRef<Line | null>(null);
  
  // Map is always non-interactive; overlay canvas handles all interactions so annotations stay above
  const isMapInteractive = false;

  // Keep refs in sync with state
  useEffect(() => {
    toolRef.current = tool;
  }, [tool]);

  useEffect(() => {
    selectedIconRef.current = selectedIcon;
  }, [selectedIcon]);

  useEffect(() => {
    rectFillColorRef.current = rectFillColor;
  }, [rectFillColor]);

  useEffect(() => {
    rectBorderColorRef.current = rectBorderColor;
  }, [rectBorderColor]);

  useEffect(() => {
    rectFillTransparentRef.current = rectFillTransparent;
  }, [rectFillTransparent]);

  // Disable selection when tool is 'line' or 'eraser' to prevent moving objects while drawing/erasing
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    if (tool === 'line' || tool === 'eraser') {
      canvas.selection = false;
      canvas.getObjects().forEach(obj => {
        obj.selectable = false;
        obj.evented = tool === 'eraser'; // Allow evented for eraser to detect clicks
      });
    } else {
      canvas.selection = true;
      canvas.getObjects().forEach(obj => {
        // Don't enable selection for temp lines
        if (obj !== tempLineRef.current) {
          obj.selectable = true;
          obj.evented = true;
        }
      });
    }
    canvas.renderAll();
  }, [tool]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const parentRect = canvasRef.current.parentElement?.getBoundingClientRect();
    // Use exact dimensions without rounding to prevent coordinate drift
    const canvasWidth = parentRect?.width || window.innerWidth;
    const canvasHeight = parentRect?.height || (window.innerHeight * 0.6);
    
    const canvas = new FabricCanvas(canvasRef.current, {
      width: canvasWidth,
      height: canvasHeight,
      backgroundColor: 'transparent',
      // Custom selection styling - blue border for selected objects
      selectionColor: 'rgba(59, 130, 246, 0.2)',
      selectionBorderColor: '#3B82F6',
      selectionLineWidth: 2,
    });

    // Set default selection styles for all objects via prototype defaults
    FabricObject.prototype.borderColor = '#3B82F6';
    FabricObject.prototype.cornerColor = '#3B82F6';
    FabricObject.prototype.cornerStrokeColor = '#FFFFFF';
    FabricObject.prototype.cornerSize = 10;
    FabricObject.prototype.cornerStyle = 'circle';
    FabricObject.prototype.transparentCorners = false;
    FabricObject.prototype.borderScaleFactor = 2;

    fabricCanvasRef.current = canvas;
    (window as any).fabricCanvasInstance = canvas;

    // Detect touch devices to avoid drag-to-delete on mobile
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    isTouchRef.current = !!isTouch;

    // Handle Delete/Backspace key to delete selected objects
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.repeat) {
        // Don't delete if user is typing in an input/textarea
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || (activeEl as HTMLElement).isContentEditable)) {
          return;
        }
        
        const activeObj = canvas.getActiveObject();
        if (activeObj) {
          // Don't delete if user is editing text
          if ((activeObj as any).isEditing) {
            return;
          }
          canvas.remove(activeObj);
          canvas.discardActiveObject();
          canvas.renderAll();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    const resizeCanvas = () => {
      const parentRect = canvasRef.current?.parentElement?.getBoundingClientRect();
      if (parentRect) {
        const oldWidth = canvas.getWidth();
        const oldHeight = canvas.getHeight();
        const newWidth = Math.floor(parentRect.width);
        const newHeight = Math.floor(parentRect.height);
        
        // Only resize and scale if dimensions actually changed significantly
        if (Math.abs(oldWidth - newWidth) > 1 || Math.abs(oldHeight - newHeight) > 1) {
          const scaleX = newWidth / oldWidth;
          const scaleY = newHeight / oldHeight;
          
          // Calculate old and new target icon scales
          const oldTargetScale = Math.min(oldWidth, oldHeight) / 800;
          const newTargetScale = Math.min(newWidth, newHeight) / 800;
          const iconScaleRatio = newTargetScale / oldTargetScale;
          
          // Scale positions proportionally, icon sizes based on target scale ratio
          canvas.getObjects().forEach((obj: any) => {
            obj.left = (obj.left || 0) * scaleX;
            obj.top = (obj.top || 0) * scaleY;
            obj.scaleX = (obj.scaleX || 1) * iconScaleRatio;
            obj.scaleY = (obj.scaleY || 1) * iconScaleRatio;
            obj.setCoords();
          });
          
          canvas.setDimensions({
            width: newWidth,
            height: newHeight,
          });
        }
        canvas.renderAll();
      }
    };

    // Debounce resize to prevent conflicts with initial load
    let resizeTimeout: ReturnType<typeof setTimeout>;
    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resizeCanvas, 100);
    };

    window.addEventListener('resize', debouncedResize);

    canvas.on('mouse:down', (e) => {
      const currentTool = toolRef.current;
      const currentIcon = selectedIconRef.current;
      
      // Robust pointer extraction for Fabric v6
      const evtAny: any = e as any;
      const pt = evtAny?.absolutePointer || evtAny?.pointer || fabricCanvasRef.current?.getPointer(evtAny?.e);

      const iconData = AVAILABLE_ICONS.find(i => i.icon === currentIcon);
      console.log('Canvas clicked, tool:', currentTool, 'icon:', currentIcon, 'pointer:', pt);
      
      if (!pt) return;
      
      if (currentTool === 'eraser') {
        // Eraser tool - delete the object that was clicked on
        if (e.target) {
          canvas.remove(e.target);
          canvas.discardActiveObject();
          canvas.renderAll();
        }
        return; // Stay in eraser mode
      } else if (currentTool === 'icon') {
        const svgPath = iconData?.svgPath || bugIcon;
        
        // Load and add SVG icon
        FabricImage.fromURL(svgPath).then((img) => {
          img.set({
            left: pt.x - 16,
            top: pt.y - 16,
            selectable: true,
            hasControls: true,
            hasBorders: true,
            lockScalingFlip: true,
            cornerSize: 8,
            cornerColor: '#16a34a',
            cornerStrokeColor: '#166534',
            transparentCorners: false,
            // Store icon type for legend purposes
            data: { iconType: currentIcon }
          });
          canvas.add(img);
          canvas.discardActiveObject();
          canvas.renderAll();
          
          console.log('Icon added to canvas:', currentIcon);
          
          // Add to legend if not already there
          setLegendItems(prev => {
            if (!prev.find(item => item.icon === currentIcon)) {
              const defaultLabel = iconData?.label || 'Icon';
              setShowLegend(true);
              return [...prev, { icon: currentIcon, label: defaultLabel }];
            }
            return prev;
          });
          
          clickPlacedRef.current = true;
          // Stay in icon mode so user can place multiple icons
        });
      } else if (currentTool === 'rectangle') {
        // Create a callout box that is fully resizable
        const rect = new FabricRect({
          left: pt.x - 60,
          top: pt.y - 40,
          width: 140,
          height: 60,
          fill: rectFillTransparentRef.current ? 'rgba(255,255,255,0.2)' : rectFillColorRef.current,
          stroke: rectBorderColorRef.current,
          strokeWidth: 3,
          strokeUniform: true,
          rx: 4,
          ry: 4,
          selectable: true,
          hasControls: true,
          hasBorders: true,
          lockUniScaling: false,
        });
        
        // Add to canvas
        canvas.add(rect);
        canvas.discardActiveObject();
        canvas.renderAll();
        
        clickPlacedRef.current = true;
        setTool('select');
      } else if (currentTool === 'text') {
        const text = new IText('', {
          left: pt.x,
          top: pt.y,
          fontSize: 16,
          fill: '#000000',
          fontFamily: 'Space Grotesk, sans-serif',
          fontWeight: 'bold',
          backgroundColor: 'rgba(255, 255, 255, 0.8)',
          selectable: true,
          editable: true,
          padding: 8,
        });
        canvas.add(text);
        canvas.setActiveObject(text);
        text.enterEditing();
        text.selectAll();
        canvas.renderAll();
        
        clickPlacedRef.current = true;
        setTool('select');
      } else if (currentTool === 'line') {
        // Deselect any active objects before starting line draw
        canvas.discardActiveObject();
        canvas.renderAll();
        
        // Start drawing a line
        lineStartRef.current = { x: pt.x, y: pt.y };
        const tempLine = new Line([pt.x, pt.y, pt.x, pt.y], {
          stroke: '#DC2626',
          strokeWidth: 5,
          selectable: false,
          evented: false,
        });
        tempLineRef.current = tempLine;
        canvas.add(tempLine);
        canvas.renderAll();
      }
    });

    // Handle mouse move for line drawing
    canvas.on('mouse:move', (e) => {
      if (toolRef.current === 'line' && lineStartRef.current && tempLineRef.current) {
        const evtAny: any = e as any;
        const pt = evtAny?.absolutePointer || evtAny?.pointer || fabricCanvasRef.current?.getPointer(evtAny?.e);
        if (pt) {
          tempLineRef.current.set({ x2: pt.x, y2: pt.y });
          canvas.renderAll();
        }
      }
    });

    // Handle mouse up to finalize line
    canvas.on('mouse:up', (e) => {
      if (toolRef.current === 'line' && lineStartRef.current && tempLineRef.current) {
        const evtAny: any = e as any;
        const pt = evtAny?.absolutePointer || evtAny?.pointer || fabricCanvasRef.current?.getPointer(evtAny?.e);
        if (pt) {
          // Remove temp line
          canvas.remove(tempLineRef.current);
          
          // Create final line (selectable)
          const finalLine = new Line([lineStartRef.current.x, lineStartRef.current.y, pt.x, pt.y], {
            stroke: '#DC2626',
            strokeWidth: 5,
            selectable: true,
            hasControls: true,
            hasBorders: true,
          });
          canvas.add(finalLine);
          canvas.discardActiveObject();
          canvas.renderAll();
        }
        lineStartRef.current = null;
        tempLineRef.current = null;
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
      clearTimeout(resizeTimeout);
      window.removeEventListener('resize', debouncedResize);
      document.removeEventListener('keydown', handleKeyDown);
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
    
    // Mark as loaded immediately if no initial data - prevents reload when we save our own changes
    if (!initialData && fabricCanvasRef.current) {
      hasLoadedInitialRef.current = true;
      return;
    }
    
    if (!fabricCanvasRef.current || !initialData || hasLoadedInitialRef.current) return;
    
    // Set this BEFORE loading to prevent race conditions
    hasLoadedInitialRef.current = true;
    
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
          
          const attemptAdjust = (attempt: number = 0) => {
            const objs = canvas.getObjects();
            if (objs.length === 0 && attempt < 5) {
              setTimeout(() => attemptAdjust(attempt + 1), 50);
              return;
            }
            
            const currW = canvas.getWidth();
            const currH = canvas.getHeight();
            
            // Check if using new normalized format (version 2) or legacy format
            const isNormalized = savedData.version === 2;
            const baseW = savedData.base?.width || REFERENCE_WIDTH;
            const baseH = savedData.base?.height || REFERENCE_HEIGHT;

            // Calculate scale factors - pure proportional scaling
            const scaleX = currW / baseW;
            const scaleY = currH / baseH;
            // Use uniform scale to maintain aspect ratio of icons
            // Cap the scale factor to prevent icons from getting too large on smaller screens
            const uniformScale = Math.min(scaleX, scaleY);
            
            // Target icon size relative to canvas - icons should be roughly same % of canvas on all devices
            // This ensures consistent visual appearance
            const targetIconScale = Math.min(currW, currH) / 800; // Normalize to ~800px reference
            
            console.log('Scaling objects:', { scaleX, scaleY, uniformScale, targetIconScale, currW, currH, baseW, baseH, objectCount: objs.length, isNormalized });
            
            objs.forEach((obj: any) => {
              if ((obj as any)._scaledFromBase) return;
              
              const origLeft = obj.left || 0;
              const origTop = obj.top || 0;
              
              // Pure proportional scaling - same relative position on all devices
              obj.left = origLeft * scaleX;
              obj.top = origTop * scaleY;
              
              // For object sizes, use target scale to ensure icons are consistent size relative to canvas
              // This makes a 32px icon on a 1600px canvas appear the same relative size as on a 800px canvas
              if (isNormalized) {
                // New format: scales were normalized, apply target scale
                obj.scaleX = (obj.scaleX || 1) * targetIconScale;
                obj.scaleY = (obj.scaleY || 1) * targetIconScale;
              } else {
                // Legacy format: keep original scales but cap them
                const maxScale = targetIconScale * 1.5;
                obj.scaleX = Math.min(obj.scaleX || 1, maxScale);
                obj.scaleY = Math.min(obj.scaleY || 1, maxScale);
              }
              
              (obj as any)._scaledFromBase = true;
              obj.setCoords();
            });
            canvas.renderAll();
          };

          attemptAdjust();
        });
      }
      if (savedData.legendItems) {
        setLegendItems(savedData.legendItems);
        setShowLegend(true);
      }
      console.log('Load complete');
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

  // Export canvas with background as a single image
  const exportAsImage = async (): Promise<string | null> => {
    if (!fabricCanvasRef.current || !canvasRef.current) return null;
    
    const canvas = fabricCanvasRef.current;
    const displayWidth = canvas.getWidth();
    const displayHeight = canvas.getHeight();
    
    // Export at reference resolution for consistent quality
    const exportWidth = REFERENCE_WIDTH;
    const exportHeight = REFERENCE_HEIGHT;
    const scaleX = exportWidth / displayWidth;
    const scaleY = exportHeight / displayHeight;
    
    // Create a temporary canvas at reference resolution
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = exportWidth;
    tempCanvas.height = exportHeight;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;
    
    // Draw the background map image first
    const bgImg = new Image();
    bgImg.crossOrigin = 'anonymous';
    
    return new Promise((resolve) => {
      bgImg.onload = () => {
        // Draw background image to fill canvas while maintaining aspect ratio
        const imgAspect = bgImg.width / bgImg.height;
        const canvasAspect = exportWidth / exportHeight;
        
        let drawWidth = exportWidth;
        let drawHeight = exportHeight;
        let drawX = 0;
        let drawY = 0;
        
        if (imgAspect > canvasAspect) {
          drawHeight = exportWidth / imgAspect;
          drawY = (exportHeight - drawHeight) / 2;
        } else {
          drawWidth = exportHeight * imgAspect;
          drawX = (exportWidth - drawWidth) / 2;
        }
        
        ctx.fillStyle = '#f5f5f5';
        ctx.fillRect(0, 0, exportWidth, exportHeight);
        ctx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);
        
        // Export annotations at higher resolution using multiplier
        const annotationsDataUrl = canvas.toDataURL({ 
          multiplier: scaleX, 
          format: 'png',
        });
        const annotationsImg = new Image();
        annotationsImg.onload = () => {
          ctx.drawImage(annotationsImg, 0, 0, exportWidth, exportHeight);
          
          // Draw legend if present
          if (legendItems.length > 0) {
            const legendPadding = 8;
            const iconSize = 14;
            const legendLineHeight = 20;
            const legendWidth = 140;
            const legendHeight = 24 + legendItems.length * legendLineHeight;
            const legendX = 12;
            const legendY = exportHeight - legendHeight - 12;
            
            // Legend background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.strokeStyle = '#e5e7eb';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 6);
            ctx.fill();
            ctx.stroke();
            
            // Legend title
            ctx.fillStyle = '#1f2937';
            ctx.font = 'bold 10px sans-serif';
            ctx.fillText('LEGEND', legendX + legendPadding, legendY + 14);
            
            // Load icon images and draw legend items
            const iconPromises = legendItems.map((item, i) => {
              return new Promise<void>((resolveIcon) => {
                const iconInfo = AVAILABLE_ICONS.find(ic => ic.icon === item.icon);
                const y = legendY + 24 + i * legendLineHeight;
                
                if (iconInfo?.svgPath) {
                  const iconImg = new Image();
                  iconImg.onload = () => {
                    ctx.drawImage(iconImg, legendX + legendPadding, y, iconSize, iconSize);
                    ctx.fillStyle = '#374151';
                    ctx.font = '10px sans-serif';
                    ctx.fillText(item.label, legendX + legendPadding + iconSize + 4, y + 11);
                    resolveIcon();
                  };
                  iconImg.onerror = () => {
                    ctx.fillStyle = '#374151';
                    ctx.font = '10px sans-serif';
                    ctx.fillText(`• ${item.label}`, legendX + legendPadding, y + 11);
                    resolveIcon();
                  };
                  iconImg.src = iconInfo.svgPath;
                } else {
                  ctx.fillStyle = '#374151';
                  ctx.font = '10px sans-serif';
                  ctx.fillText(`• ${item.label}`, legendX + legendPadding, y + 11);
                  resolveIcon();
                }
              });
            });
            
            Promise.all(iconPromises).then(() => {
              resolve(tempCanvas.toDataURL('image/jpeg', 0.7));
            });
          } else {
            resolve(tempCanvas.toDataURL('image/jpeg', 0.7));
          }
        };
        annotationsImg.onerror = () => resolve(null);
        annotationsImg.src = annotationsDataUrl;
      };
      bgImg.onerror = () => resolve(null);
      bgImg.src = mapUrl;
    });
  };
  
  // Expose export function via window for external access
  useEffect(() => {
    (window as any).exportMapAsImage = exportAsImage;
    return () => {
      delete (window as any).exportMapAsImage;
    };
  }, [mapUrl, legendItems]);

  // Auto-save canvas data whenever it changes
  useEffect(() => {
    if (!fabricCanvasRef.current || !onSave) return;
    
    const saveCanvasData = async () => {
      if (!fabricCanvasRef.current) return;
      const canvas = fabricCanvasRef.current;
      const currW = canvas.getWidth();
      const currH = canvas.getHeight();
      
      // Calculate the target scale that was applied on load
      const targetIconScale = Math.min(currW, currH) / 800;
      
      // Normalize all object positions and scales to reference coordinates before saving
      const normalizedObjects = canvas.getObjects().map((obj: any) => {
        const objJSON = obj.toJSON();
        // Convert current position to reference coordinates (percentage-based)
        objJSON.left = (obj.left / currW) * REFERENCE_WIDTH;
        objJSON.top = (obj.top / currH) * REFERENCE_HEIGHT;
        // Normalize scale back to reference size (divide by the scale we applied)
        objJSON.scaleX = (obj.scaleX || 1) / targetIconScale;
        objJSON.scaleY = (obj.scaleY || 1) / targetIconScale;
        return objJSON;
      });
      
      const canvasData = JSON.stringify({
        objects: { ...canvas.toJSON(), objects: normalizedObjects },
        legendItems: legendItems,
        base: { width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT },
        version: 2 // Mark as using normalized coordinates
      });
      console.log('Saving normalized canvas data:', { 
        objectCount: normalizedObjects.length,
        legendCount: legendItems.length,
        currW, currH
      });
      onSave(canvasData);
      
      // Also export as static image if callback provided
      if (onExportImage && normalizedObjects.length > 0) {
        const imageDataUrl = await exportAsImage();
        if (imageDataUrl) {
          onExportImage(imageDataUrl);
        }
      }
    };

    const canvas = fabricCanvasRef.current;
    
    // Save immediately on final actions (mouse up, object modified)
    const handleImmediateSave = () => {
      saveCanvasData();
    };
    
    // Debounce only for continuous events like text editing
    let saveTimeout: ReturnType<typeof setTimeout>;
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
  }, [onSave, onExportImage, legendItems, mapUrl]);

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

  const handleIconSelect = (iconKey: string) => {
    setSelectedIcon(iconKey);
    setTool('icon');
    setShowIconPicker(false);
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
      {/* Map - either static image or iframe */}
      {mapUrl.startsWith('data:image') || (mapUrl.startsWith('http') && !mapUrl.includes('openstreetmap')) ? (
        <img
          className="absolute inset-0 w-full h-full rounded-lg border-2 border-foreground object-contain bg-card"
          style={{ 
            border: '2px solid hsl(var(--foreground))',
            pointerEvents: 'none',
            zIndex: 0
          }}
          src={mapUrl}
          alt="Custom map"
        />
      ) : (
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
      )}

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
      <div className="no-print fixed bottom-2 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-1 flex flex-row gap-1 border border-border z-50">
        <Button
          size="icon"
          variant={tool === 'select' ? 'default' : 'outline'}
          onClick={() => setTool('select')}
          title="Select & Move"
          className="h-7 w-7"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
          </svg>
        </Button>
        <Button
          size="icon"
          variant={tool === 'rectangle' ? 'default' : 'outline'}
          onClick={() => { setTool('rectangle'); setShowIconPicker(false); }}
          title="Rectangle"
          className="h-7 w-7"
        >
          <Square className="w-3.5 h-3.5" />
        </Button>
        {tool === 'rectangle' && (
          <div className="flex flex-col gap-0.5 px-1.5 py-1 border-l border-border">
            <div className="flex items-center gap-1">
              <label className="text-[10px] whitespace-nowrap">Fill:</label>
              <input
                type="color"
                value={rectFillColor}
                onChange={(e) => setRectFillColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer"
                title="Fill Color"
                disabled={rectFillTransparent}
              />
            </div>
            <div className="flex items-center gap-0.5 px-0.5">
              <input
                type="checkbox"
                id="transparent-fill"
                checked={rectFillTransparent}
                onChange={(e) => setRectFillTransparent(e.target.checked)}
                className="cursor-pointer w-3 h-3"
              />
              <label htmlFor="transparent-fill" className="text-[10px] cursor-pointer">
                Trans
              </label>
            </div>
            <div className="flex items-center gap-1">
              <label className="text-[10px] whitespace-nowrap">Border:</label>
              <input
                type="color"
                value={rectBorderColor}
                onChange={(e) => setRectBorderColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer"
                title="Border Color"
              />
            </div>
          </div>
        )}
        <Button
          size="icon"
          variant={tool === 'line' ? 'default' : 'outline'}
          onClick={() => { setTool('line'); setShowIconPicker(false); }}
          title="Draw Line"
          className="h-7 w-7"
        >
          <Minus className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'icon' || showIconPicker ? 'default' : 'outline'}
          onClick={() => { setTool('icon'); setShowIconPicker((prev) => !prev); }}
          title="Add Icon"
          className="h-7 w-7"
        >
          <Bug className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'text' ? 'default' : 'outline'}
          onClick={() => setTool('text')}
          title="Add Text"
          className="h-7 w-7"
        >
        <Type className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'eraser' ? 'destructive' : 'outline'}
          onClick={() => { setTool('eraser'); setShowIconPicker(false); }}
          title="Eraser - Click to delete"
          className="h-7 w-7"
        >
          <Eraser className="w-3.5 h-3.5" />
        </Button>
        <div className="w-px bg-border mx-0.5" />
        <Button
          ref={deleteButtonRef}
          size="icon"
          variant={isDraggingOverDelete ? 'destructive' : 'outline'}
          title="Drag items here to delete"
          className={`h-7 w-7 transition-all ${isDraggingOverDelete ? 'scale-110 shadow-lg' : ''}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Icon Picker */}
      {showIconPicker && (
        <div className="no-print fixed bottom-12 left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-3 border border-border z-50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-xs">Select Icon</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowIconPicker(false)}
              className="h-5 w-5"
            >
              <X className="w-3 h-3" />
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {AVAILABLE_ICONS.map((iconData) => {
              return (
                <button
                  key={iconData.icon}
                  onClick={() => handleIconSelect(iconData.icon)}
                  className={`p-2 rounded hover:bg-muted transition-colors border ${
                    selectedIcon === iconData.icon ? 'bg-primary/20 border-primary' : 'border-border'
                  }`}
                  title={iconData.label}
                >
                  <img src={iconData.svgPath} alt={iconData.label} className="w-8 h-8" />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      {showLegend && legendItems.length > 0 && (
        <div 
          ref={legendRef}
          className="print-legend absolute bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-2 max-w-[200px] max-h-64 overflow-y-auto border border-border cursor-move z-40"
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
            {legendItems.map((item, index) => {
              const iconData = AVAILABLE_ICONS.find(i => i.icon === item.icon);
              return (
                <div key={index} className="flex items-center gap-1">
                  <img src={iconData?.svgPath || bugIcon} alt={item.label} className="w-6 h-6" />
                  <Input
                    value={item.label}
                    onChange={(e) => updateLegendItem(index, 'label', e.target.value)}
                    className="no-print flex-1 h-6 text-xs"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                  />
                  <span className="hidden print-legend-label text-[7px] leading-tight">{item.label}</span>
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
              );
            })}
          </div>
        </div>
      )}

      {!showLegend && legendItems.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowLegend(true)}
          className="no-print absolute bottom-12 left-2 bg-card/95 backdrop-blur-sm shadow-xl border-border text-[10px] h-6 px-2"
        >
          Legend ({legendItems.length})
        </Button>
      )}
    </div>
  );
};
