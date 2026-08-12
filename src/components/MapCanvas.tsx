import { useRef, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2, Type, X, Square, Bug, Minus, Eraser, Pencil } from 'lucide-react';
import { Canvas as FabricCanvas, IText, Rect as FabricRect, FabricObject, FabricImage, Line, Group, PencilBrush, Circle as FabricCircle } from 'fabric';
import { toast } from 'sonner';
import bugIcon from '@/assets/icons/bug-icon.svg';
import ratIcon from '@/assets/icons/rat-icon.svg';
import boxIcon from '@/assets/icons/box-icon.svg';
import squareIcon from '@/assets/icons/square-icon.svg';
import treeIcon from '@/assets/icons/tree-icon.svg';
import circleIcon from '@/assets/icons/circle-icon.svg';
import entryPointIcon from '@/assets/icons/entry-point-icon.svg';
import waterSourceIcon from '@/assets/icons/water-source-icon.svg';
import { createSavedImageObject, createSavedLineObject, getSavedMapObjects, getSavedMapVersion, isSavedTextObject, reviveSavedFabricObject, safeDisposeFabricCanvas } from '@/lib/mapCanvasLoader';

interface MapCanvasProps {
  mapUrl: string;
  onSave?: (canvasData: string) => void;
  onExportImage?: (imageDataUrl: string) => void;
  initialData?: string | null;
  exportId?: string;
  showToolbar?: boolean;
  imageFit?: 'cover' | 'contain';
}

type Tool = 'select' | 'text' | 'icon' | 'rectangle' | 'line' | 'eraser' | 'draw';

interface LegendItem {
  icon: string;
  label: string;
}

const SHAPE_COLORS = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8DADC', '#F4A261', '#E76F51', '#95A197', '#C3D1C5'];

// Badge color palette assigned per icon TYPE in placement order.
// First icon type placed = red, second type = blue, third = green, etc.
// All emblems of the same type share the same color.
const ICON_BADGE_COLORS = [
  '#DC2626', // red
  '#2563EB', // blue
  '#16A34A', // green
  '#D97706', // amber
  '#9333EA', // purple
  '#0891B2', // cyan
  '#DB2777', // pink
  '#525252', // neutral
];

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

export const MapCanvas = ({ mapUrl, onSave, onExportImage, initialData, exportId, showToolbar = true, imageFit = 'cover' }: MapCanvasProps) => {
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
  const iconCountsRef = useRef<Record<string, number>>({});
  // Tracks the assignment order of icon types so each type gets a distinct
  // badge color. First type placed -> ICON_BADGE_COLORS[0] (red), second
  // type -> [1] (blue), etc. Persists across saves via obj.data.iconType.
  const iconTypeOrderRef = useRef<string[]>([]);

  const getBadgeColorForIconType = (iconType: string): string => {
    const order = iconTypeOrderRef.current;
    let idx = order.indexOf(iconType);
    if (idx === -1) {
      order.push(iconType);
      idx = order.length - 1;
    }
    return ICON_BADGE_COLORS[idx % ICON_BADGE_COLORS.length];
  };
  // Line drawing state
  const [lineStartPoint, setLineStartPoint] = useState<{ x: number; y: number } | null>(null);
  const lineStartRef = useRef<{ x: number; y: number } | null>(null);
  const tempLineRef = useRef<Line | null>(null);
  const [drawColor, setDrawColor] = useState('#DC2626');
  const [drawBrushSize, setDrawBrushSize] = useState(4);
  const [lineColor, setLineColor] = useState('#DC2626');
  const [lineWidth, setLineWidth] = useState(5);
  const lineColorRef = useRef('#DC2626');
  const lineWidthRef = useRef(5);

  useEffect(() => { lineColorRef.current = lineColor; }, [lineColor]);
  useEffect(() => { lineWidthRef.current = lineWidth; }, [lineWidth]);
  
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

  // Disable selection when tool is 'line', 'eraser', or 'draw' to prevent moving objects
  useEffect(() => {
    if (!fabricCanvasRef.current) return;
    const canvas = fabricCanvasRef.current;
    if (tool === 'line' || tool === 'eraser' || tool === 'draw') {
      canvas.selection = false;
      canvas.getObjects().forEach(obj => {
        obj.selectable = false;
        obj.evented = tool === 'eraser';
      });
    } else {
      canvas.selection = true;
      canvas.getObjects().forEach(obj => {
        if (obj !== tempLineRef.current) {
          obj.selectable = true;
          obj.evented = true;
        }
      });
    }
    
    // Toggle freehand drawing mode
    if (tool === 'draw') {
      canvas.isDrawingMode = true;
      const brush = new PencilBrush(canvas);
      brush.color = drawColor;
      brush.width = drawBrushSize;
      canvas.freeDrawingBrush = brush;
    } else {
      canvas.isDrawingMode = false;
    }

    // Touch devices: let page scroll pass through the canvas while in select
    // mode; lock it only while a drawing tool is active so gestures draw
    // instead of scrolling. Fabric reads allowTouchScrolling per-event.
    canvas.allowTouchScrolling = tool === 'select';
    const touchAction = tool === 'select' ? 'manipulation' : 'none';
    if (canvas.wrapperEl) canvas.wrapperEl.style.touchAction = touchAction;
    if (canvas.upperCanvasEl) canvas.upperCanvasEl.style.touchAction = touchAction;

    canvas.renderAll();
  }, [tool, drawColor, drawBrushSize]);

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
      allowTouchScrolling: true,
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
      // Skip resize scaling while loading saved data to prevent position corruption
      if (isLoadingDataRef.current) return;
      
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
        
        // Find next available number for this icon type (reuse gaps from deleted icons)
        const counts = iconCountsRef.current;
        const existingNumbers = new Set<number>();
        canvas.getObjects().forEach((canvasObj: any) => {
          if (canvasObj.data?.iconType === currentIcon && canvasObj.data?.iconNumber) {
            existingNumbers.add(canvasObj.data.iconNumber);
          }
        });
        let iconNumber = 1;
        while (existingNumbers.has(iconNumber)) {
          iconNumber++;
        }
        counts[currentIcon] = Math.max(counts[currentIcon] || 0, iconNumber);
        
        // Load and add SVG icon with number badge
        FabricImage.fromURL(svgPath).then((img) => {
          // Create number badge
          const badgeSize = 14;
          const badgeColor = getBadgeColorForIconType(currentIcon);
          const badge = new FabricCircle({
            radius: badgeSize / 2,
            fill: badgeColor,
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
          
          const group = new Group([img, badge, numberText], {
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
          });
          (group as any).data = { iconType: currentIcon, iconNumber };
          
          canvas.add(group);
          canvas.discardActiveObject();
          canvas.renderAll();
          
          console.log('Icon added to canvas:', currentIcon, 'number:', iconNumber);
          
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
          stroke: lineColorRef.current,
          strokeWidth: lineWidthRef.current,
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
            stroke: lineColorRef.current,
            strokeWidth: lineWidthRef.current,
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
      fabricCanvasRef.current = null;
      void safeDisposeFabricCanvas(canvas);
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
    
    // Set flags BEFORE loading to prevent race conditions
    hasLoadedInitialRef.current = true;
    isLoadingDataRef.current = true;
    
    try {
      const savedData = JSON.parse(initialData);
      console.log('Parsed saved data:', { 
        hasObjects: !!savedData.objects,
        objectCount: savedData.objects?.objects?.length,
        hasLegend: !!savedData.legendItems 
      });
      
      if (savedData.objects) {
        const canvas = fabricCanvasRef.current!;
        
        // Re-sync canvas dimensions with actual parent before scaling
        const parentRect = canvasRef.current?.parentElement?.getBoundingClientRect();
        if (parentRect) {
          const actualW = Math.floor(parentRect.width);
          const actualH = Math.floor(parentRect.height);
          const canvasW = canvas.getWidth();
          const canvasH = canvas.getHeight();
          if (Math.abs(canvasW - actualW) > 1 || Math.abs(canvasH - actualH) > 1) {
            canvas.setDimensions({ width: actualW, height: actualH });
          }
        }
        
        const currW = canvas.getWidth();
        const currH = canvas.getHeight();
        const baseW = savedData.base?.width || REFERENCE_WIDTH;
        const baseH = savedData.base?.height || REFERENCE_HEIGHT;
        const scaleX = currW / baseW;
        const scaleY = currH / baseH;
        const isNormalized = savedData.version === 2;
        const targetIconScale = Math.min(currW, currH) / 800;
        
        const objectsArray = getSavedMapObjects(savedData);
        const savedVersion = getSavedMapVersion(savedData);
        
        console.log('Manually reconstructing', objectsArray.length, 'objects');
        
        const loadPromises: Promise<void>[] = [];
        const counts: Record<string, number> = {};
        
        objectsArray.forEach((obj: any) => {
          const objectType = String(obj.type || '').toLowerCase();

          // Handle group objects (numbered icons)
          if ((objectType === 'group' || objectType === 'image') && obj.data?.iconType) {
            const iconType = obj.data.iconType;
            const iconNumber = obj.data.iconNumber;
            const iconInfo = AVAILABLE_ICONS.find(i => i.icon === iconType);
            
            if (iconInfo) {
              if (iconType && iconNumber) {
                counts[iconType] = Math.max(counts[iconType] || 0, iconNumber);
              }
              const promise = FabricImage.fromURL(iconInfo.svgPath).then((img) => {
                const groupObjects: any[] = [img];
                
                if (iconNumber) {
                  const badgeSize = 14;
                  const badgeColor = getBadgeColorForIconType(iconType);
                  const badge = new FabricCircle({
                    radius: badgeSize / 2,
                    fill: badgeColor,
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
                
                const scaledScaleX = isNormalized ? (obj.scaleX || 1) * targetIconScale : Math.min(obj.scaleX || 1, targetIconScale * 1.5);
                const scaledScaleY = isNormalized ? (obj.scaleY || 1) * targetIconScale : Math.min(obj.scaleY || 1, targetIconScale * 1.5);
                
                const group = new Group(groupObjects, {
                  left: (obj.left || 0) * scaleX,
                  top: (obj.top || 0) * scaleY,
                  scaleX: scaledScaleX,
                  scaleY: scaledScaleY,
                  angle: obj.angle || 0,
                  selectable: true,
                  hasControls: true,
                  hasBorders: true,
                  lockScalingFlip: true,
                  cornerSize: 8,
                  cornerColor: '#16a34a',
                  cornerStrokeColor: '#166534',
                  transparentCorners: false,
                });
                (group as any).data = { iconType, iconNumber };
                canvas.add(group);
              }).catch((err) => {
                console.error('Error loading icon:', iconType, err);
              });
              loadPromises.push(promise);
            }
          } else if (objectType === 'image' && obj.src) {
            const imagePromise = createSavedImageObject({
              obj,
              left: (obj.left || 0) * scaleX,
              top: (obj.top || 0) * scaleY,
              scaleX: isNormalized ? (obj.scaleX || 1) * targetIconScale : (obj.scaleX || 1),
              scaleY: isNormalized ? (obj.scaleY || 1) * targetIconScale : (obj.scaleY || 1),
              selectable: true,
              evented: true,
              hasControls: true,
              hasBorders: true,
            }).then((image) => {
              canvas.add(image);
            }).catch((err) => {
              console.error('Error loading legacy image object:', err, obj);
            });
            loadPromises.push(imagePromise);
          } else if (objectType === 'rect') {
            const rect = new FabricRect({
              left: (obj.left || 0) * scaleX,
              top: (obj.top || 0) * scaleY,
              width: (obj.width || 100) * (isNormalized ? scaleX * (obj.scaleX || 1) : 1),
              height: (obj.height || 50) * (isNormalized ? scaleY * (obj.scaleY || 1) : 1),
              scaleX: isNormalized ? 1 : (obj.scaleX || 1),
              scaleY: isNormalized ? 1 : (obj.scaleY || 1),
              fill: obj.fill,
              stroke: obj.stroke,
              strokeWidth: obj.strokeWidth || 3,
              rx: obj.rx || 4,
              ry: obj.ry || 4,
              selectable: true,
              hasControls: true,
            });
            canvas.add(rect);
          } else if (objectType === 'line') {
            const line = createSavedLineObject({
              obj,
              left: (obj.left || 0) * scaleX,
              top: (obj.top || 0) * scaleY,
              scaleX: isNormalized ? (obj.scaleX || 1) * Math.min(scaleX, scaleY) : (obj.scaleX || 1),
              scaleY: isNormalized ? (obj.scaleY || 1) * Math.min(scaleX, scaleY) : (obj.scaleY || 1),
              selectable: true,
              evented: true,
              hasControls: true,
              hasBorders: true,
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
              selectable: true,
              editable: true,
            });
            canvas.add(text);
          } else if (objectType === 'path') {
            // For freehand drawing paths, use loadFromJSON for just this object
            const pathPromise = reviveSavedFabricObject({
              canvas,
              obj,
              version: savedVersion,
              left: (obj.left || 0) * scaleX,
              top: (obj.top || 0) * scaleY,
              scaleX: isNormalized ? (obj.scaleX || 1) * Math.min(scaleX, scaleY) : (obj.scaleX || 1),
              scaleY: isNormalized ? (obj.scaleY || 1) * Math.min(scaleX, scaleY) : (obj.scaleY || 1),
              selectable: true,
              evented: true,
              hasControls: true,
              hasBorders: true,
            }).then(() => undefined).catch((err) => {
              console.error('Error reviving path object:', err, obj);
            });
            loadPromises.push(pathPromise);
          }
        });
        
        Promise.all(loadPromises).then(() => {
          canvas.renderAll();
          iconCountsRef.current = counts;
          console.log('Manual reconstruction complete, objects:', canvas.getObjects().length);
          setTimeout(() => {
            isLoadingDataRef.current = false;
          }, 300);
        });
      } else {
        isLoadingDataRef.current = false;
      }
      if (savedData.legendItems) {
        setLegendItems(savedData.legendItems);
        setShowLegend(true);
      }
      console.log('Load complete');
    } catch (error) {
      console.error('Error loading canvas data:', error);
      isLoadingDataRef.current = false;
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

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      img.src = src;
    });

  const drawLegendToContext = async (
    ctx: CanvasRenderingContext2D,
    exportWidth: number,
    exportHeight: number,
  ) => {
    if (legendItems.length === 0) return;

    const legendPadding = 12;
    const iconSize = 22;
    const legendLineHeight = 30;
    const legendWidth = 200;
    const legendHeight = 34 + legendItems.length * legendLineHeight;
    const legendX = 14;
    const legendY = exportHeight - legendHeight - 14;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('LEGEND', legendX + legendPadding, legendY + 20);

    const iconPromises = legendItems.map((item, i) => {
      return new Promise<void>((resolveIcon) => {
        const iconInfo = AVAILABLE_ICONS.find((ic) => ic.icon === item.icon);
        const y = legendY + 34 + i * legendLineHeight;

        if (iconInfo?.svgPath) {
          const iconImg = new Image();
          iconImg.onload = () => {
            ctx.drawImage(iconImg, legendX + legendPadding, y, iconSize, iconSize);
            ctx.fillStyle = '#374151';
            ctx.font = '14px sans-serif';
            ctx.fillText(item.label, legendX + legendPadding + iconSize + 6, y + 16);
            resolveIcon();
          };
          iconImg.onerror = () => {
            ctx.fillStyle = '#374151';
            ctx.font = '14px sans-serif';
            ctx.fillText(`• ${item.label}`, legendX + legendPadding, y + 16);
            resolveIcon();
          };
          iconImg.src = iconInfo.svgPath;
        } else {
          ctx.fillStyle = '#374151';
          ctx.font = '14px sans-serif';
          ctx.fillText(`• ${item.label}`, legendX + legendPadding, y + 16);
          resolveIcon();
        }
      });
    });

    await Promise.all(iconPromises);
  };

  const buildNormalizedCanvasState = () => {
    if (!fabricCanvasRef.current) return null;

    const canvas = fabricCanvasRef.current;
    const currW = canvas.getWidth();
    const currH = canvas.getHeight();

    if (!currW || !currH) return null;

    const targetObjectScale = Math.min(currW, currH) / 800;
    const normalizedObjects = canvas.getObjects().map((obj: any) => {
      const objJSON = obj.toJSON(['data']);
      objJSON.left = ((obj.left || 0) / currW) * REFERENCE_WIDTH;
      objJSON.top = ((obj.top || 0) / currH) * REFERENCE_HEIGHT;
      objJSON.scaleX = (obj.scaleX || 1) / targetObjectScale;
      objJSON.scaleY = (obj.scaleY || 1) / targetObjectScale;
      // Ensure data is preserved for groups
      if (obj.data) {
        objJSON.data = obj.data;
      }
      // Lines: do NOT normalize x1/y1/x2/y2 — they are relative to the line's
      // center and define its shape. Position is handled by left/top, size by scaleX/scaleY.
      return objJSON;
    });

    return {
      objects: { ...canvas.toJSON(), objects: normalizedObjects },
      legendItems,
      base: { width: REFERENCE_WIDTH, height: REFERENCE_HEIGHT },
      version: 2,
    };
  };

  const exportCanvasState = () => {
    if (isLoadingDataRef.current) return null;

    const canvasState = buildNormalizedCanvasState();
    return canvasState ? JSON.stringify(canvasState) : null;
  };

  // Export canvas with background as a single image
  const exportAsImage = async (
  ): Promise<string | null> => {
    if (!fabricCanvasRef.current || !canvasRef.current) return null;

    const canvas = fabricCanvasRef.current;
    const displayWidth = canvas.getWidth();
    const displayHeight = canvas.getHeight();

    if (!displayWidth || !displayHeight) return null;

    const exportWidth = REFERENCE_WIDTH;
    const exportScale = exportWidth / displayWidth;
    const exportHeight = Math.round(displayHeight * exportScale);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = exportWidth;
    tempCanvas.height = exportHeight;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return null;

    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    let bgSrc = mapUrl;

    try {
      const resp = await fetch(mapUrl);
      const blob = await resp.blob();
      bgSrc = URL.createObjectURL(blob);
    } catch {
      // Fall back to direct URL
    }

    try {
      const bgImg = await loadImage(bgSrc);
      const imgAspect = bgImg.width / bgImg.height;
      const canvasAspect = exportWidth / exportHeight;

      let drawWidth = exportWidth;
      let drawHeight = exportHeight;
      let drawX = 0;
      let drawY = 0;

      const shouldContain = imageFit === 'contain';
      if (shouldContain ? imgAspect > canvasAspect : imgAspect <= canvasAspect) {
        drawWidth = exportWidth;
        drawHeight = exportWidth / imgAspect;
        drawY = (exportHeight - drawHeight) / 2;
      } else {
        drawHeight = exportHeight;
        drawWidth = exportHeight * imgAspect;
        drawX = (exportWidth - drawWidth) / 2;
      }

      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(0, 0, exportWidth, exportHeight);
      ctx.drawImage(bgImg, drawX, drawY, drawWidth, drawHeight);

      // Export the live Fabric canvas annotations directly — positions are already
      // correct relative to the display canvas, and the multiplier scales them
      // to the export resolution, keeping exact alignment.
      if (canvas.getObjects().length > 0) {
        try {
          const annotationsDataUrl = canvas.toDataURL({
            multiplier: exportScale,
            format: 'png',
          });
          const annotationsImg = await loadImage(annotationsDataUrl);
          ctx.drawImage(annotationsImg, 0, 0, exportWidth, exportHeight);
        } catch (e) {
          console.warn('Canvas tainted, exporting without annotation overlay:', e);
        }
      }

      await drawLegendToContext(ctx, exportWidth, exportHeight);
      return tempCanvas.toDataURL('image/jpeg', 0.85);
    } catch (e) {
      console.error('Failed to export map image:', e);
      return null;
    } finally {
      if (bgSrc !== mapUrl) {
        URL.revokeObjectURL(bgSrc);
      }
    }
  };
  
  // Expose export function via window for external access
  useEffect(() => {
    const globalWindow = window as any;
    const registry = (globalWindow.mapExportRegistry ??= {});
    const stateRegistry = (globalWindow.mapStateRegistry ??= {});

    if (exportId) {
      registry[exportId] = exportAsImage;
      stateRegistry[exportId] = exportCanvasState;
      if (exportId === 'main') {
        globalWindow.exportMapAsImage = exportAsImage;
        globalWindow.exportMapState = exportCanvasState;
      }
    } else {
      globalWindow.exportMapAsImage = exportAsImage;
      globalWindow.exportMapState = exportCanvasState;
    }

    return () => {
      if (exportId) {
        delete registry[exportId];
        delete stateRegistry[exportId];
        if (exportId === 'main' && globalWindow.exportMapAsImage === exportAsImage) {
          delete globalWindow.exportMapAsImage;
        }
        if (exportId === 'main' && globalWindow.exportMapState === exportCanvasState) {
          delete globalWindow.exportMapState;
        }
      } else if (globalWindow.exportMapAsImage === exportAsImage) {
        delete globalWindow.exportMapAsImage;
        if (globalWindow.exportMapState === exportCanvasState) {
          delete globalWindow.exportMapState;
        }
      }
    };
  }, [mapUrl, legendItems, exportId, imageFit]);

  // Auto-save canvas data whenever it changes
  useEffect(() => {
    if (!fabricCanvasRef.current || !onSave) return;
    
    const saveCanvasData = async () => {
      // CRITICAL: Never save while loading data - objects are in intermediate state
      if (!fabricCanvasRef.current || isLoadingDataRef.current) return;
      const canvasState = buildNormalizedCanvasState();
      if (!canvasState) return;

      const canvasData = JSON.stringify(canvasState);
      console.log('Saving normalized canvas data:', { 
        objectCount: canvasState.objects.objects.length,
        legendCount: canvasState.legendItems.length,
      });
      onSave(canvasData);
      
      // Also export as static image if callback provided
      if (onExportImage && canvas.getObjects().length > 0) {
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
    canvas.on('text:changed', handleDebouncedSave as any);
    canvas.on('path:created', handleImmediateSave);
    
    return () => {
      clearTimeout(saveTimeout);
      canvas.off('object:added', handleImmediateSave);
      canvas.off('object:modified', handleImmediateSave);
      canvas.off('object:removed', handleImmediateSave);
      canvas.off('text:changed', handleDebouncedSave as any);
      canvas.off('path:created', handleImmediateSave);
    };
  }, [onSave, onExportImage, legendItems, mapUrl]);

  const clearCanvas = () => {
    if (!fabricCanvasRef.current) return;
    fabricCanvasRef.current.clear();
    setLegendItems([]);
    setShowLegend(false);
    iconCountsRef.current = {};
    iconTypeOrderRef.current = [];
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

  const handleLegendMouseDown = (e: React.PointerEvent) => {
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
    const handleMouseMove = (e: PointerEvent) => {
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
      document.addEventListener('pointermove', handleMouseMove);
      document.addEventListener('pointerup', handleMouseUp);
      document.addEventListener('pointercancel', handleMouseUp);
    }

    return () => {
      document.removeEventListener('pointermove', handleMouseMove);
      document.removeEventListener('pointerup', handleMouseUp);
      document.removeEventListener('pointercancel', handleMouseUp);
    };
  }, [isDraggingLegend, dragOffset]);

  return (
    <div className="relative w-full h-full">
      {/* Map - either static image or iframe */}
      {mapUrl.startsWith('data:image') || (mapUrl.startsWith('http') && !mapUrl.includes('openstreetmap')) ? (
          <img
            className={`absolute inset-0 w-full h-full rounded-lg border-2 border-foreground bg-card ${imageFit === 'contain' ? 'object-contain' : 'object-cover'}`}
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
      {showToolbar && <div className="no-print fixed bottom-[max(0.5rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-1 flex flex-row flex-wrap justify-center gap-1 max-w-[calc(100vw-0.5rem)] border border-border z-50">
        <Button
          size="icon"
          variant={tool === 'select' ? 'default' : 'outline'}
          onClick={() => setTool('select')}
          title="Select & Move"
          className="h-7 w-7 max-md:h-10 max-md:w-10"
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
          className="h-7 w-7 max-md:h-10 max-md:w-10"
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
                className="w-6 h-6 max-md:w-9 max-md:h-9 rounded cursor-pointer"
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
                className="cursor-pointer w-3 h-3 max-md:w-5 max-md:h-5"
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
                className="w-6 h-6 max-md:w-9 max-md:h-9 rounded cursor-pointer"
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
          className="h-7 w-7 max-md:h-10 max-md:w-10"
        >
          <Minus className="w-3.5 h-3.5" />
        </Button>
        {tool === 'line' && (
          <div className="flex items-center gap-1 px-1.5 py-1 border-l border-border">
            <input
              type="color"
              value={lineColor}
              onChange={(e) => {
                const newColor = e.target.value;
                setLineColor(newColor);
                // Recolor any currently-selected line(s)
                const canvas = fabricCanvasRef.current;
                if (canvas) {
                  const active = canvas.getActiveObjects();
                  active.forEach((obj) => {
                    if (obj instanceof Line) {
                      obj.set({ stroke: newColor });
                    }
                  });
                  if (active.length) canvas.renderAll();
                }
              }}
              className="w-6 h-6 max-md:w-9 max-md:h-9 rounded cursor-pointer"
              title="Line Color"
            />
            <select
              value={lineWidth}
              onChange={(e) => {
                const newWidth = Number(e.target.value);
                setLineWidth(newWidth);
                const canvas = fabricCanvasRef.current;
                if (canvas) {
                  const active = canvas.getActiveObjects();
                  active.forEach((obj) => {
                    if (obj instanceof Line) {
                      obj.set({ strokeWidth: newWidth });
                    }
                  });
                  if (active.length) canvas.renderAll();
                }
              }}
              className="h-6 max-md:h-9 text-[10px] max-md:text-xs bg-background border border-border rounded px-1"
            >
              <option value={2}>Thin</option>
              <option value={5}>Medium</option>
              <option value={8}>Thick</option>
              <option value={12}>Bold</option>
            </select>
          </div>
        )}
        <Button
          size="icon"
          variant={tool === 'draw' ? 'default' : 'outline'}
          onClick={() => { setTool('draw'); setShowIconPicker(false); }}
          title="Freehand Draw"
          className="h-7 w-7 max-md:h-10 max-md:w-10"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        {tool === 'draw' && (
          <div className="flex items-center gap-1 px-1.5 py-1 border-l border-border">
            <input
              type="color"
              value={drawColor}
              onChange={(e) => setDrawColor(e.target.value)}
              className="w-6 h-6 max-md:w-9 max-md:h-9 rounded cursor-pointer"
              title="Draw Color"
            />
            <select
              value={drawBrushSize}
              onChange={(e) => setDrawBrushSize(Number(e.target.value))}
              className="h-6 max-md:h-9 text-[10px] max-md:text-xs bg-background border border-border rounded px-1"
            >
              <option value={2}>Thin</option>
              <option value={4}>Medium</option>
              <option value={8}>Thick</option>
              <option value={12}>Bold</option>
            </select>
          </div>
        )}
        <Button
          variant={tool === 'icon' || showIconPicker ? 'default' : 'outline'}
          onClick={() => { setTool('icon'); setShowIconPicker((prev) => !prev); }}
          title="Add Icon"
          className="h-7 w-7 max-md:h-10 max-md:w-10"
        >
          <Bug className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'text' ? 'default' : 'outline'}
          onClick={() => setTool('text')}
          title="Add Text"
          className="h-7 w-7 max-md:h-10 max-md:w-10"
        >
        <Type className="w-3.5 h-3.5" />
        </Button>
        <Button
          size="icon"
          variant={tool === 'eraser' ? 'destructive' : 'outline'}
          onClick={() => { setTool('eraser'); setShowIconPicker(false); }}
          title="Eraser - Click to delete"
          className="h-7 w-7 max-md:h-10 max-md:w-10"
        >
          <Eraser className="w-3.5 h-3.5" />
        </Button>
        <div className="w-px bg-border mx-0.5" />
        <Button
          ref={deleteButtonRef}
          size="icon"
          variant={isDraggingOverDelete ? 'destructive' : 'outline'}
          title="Delete selected (or drag items here)"
          onClick={() => {
            const canvas = fabricCanvasRef.current;
            if (!canvas) return;
            const active = canvas.getActiveObjects();
            if (!active.length) return;
            active.forEach((obj) => { if (!(obj as any).isEditing) canvas.remove(obj); });
            canvas.discardActiveObject();
            canvas.renderAll();
          }}
          className={`h-7 w-7 max-md:h-10 max-md:w-10 transition-all ${isDraggingOverDelete ? 'scale-110 shadow-lg' : ''}`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>}

      {/* Icon Picker */}
      {showToolbar && showIconPicker && (
        <div className="no-print fixed bottom-12 max-md:bottom-[max(4rem,calc(env(safe-area-inset-bottom)+3.5rem))] left-1/2 -translate-x-1/2 bg-card/95 backdrop-blur-sm rounded-lg shadow-xl p-3 border border-border z-50 max-w-[calc(100vw-1rem)] max-h-[50dvh] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-bold text-xs">Select Icon</h3>
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setShowIconPicker(false)}
              className="h-5 w-5 max-md:h-9 max-md:w-9"
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
                  className={`p-2 rounded hover:bg-muted transition-colors border flex flex-col items-center gap-1 ${
                    selectedIcon === iconData.icon ? 'bg-primary/20 border-primary' : 'border-border'
                  }`}
                  title={iconData.label}
                >
                  <img src={iconData.svgPath} alt={iconData.label} className="w-8 h-8" />
                  <span className="text-[9px] max-md:text-[11px] leading-tight text-muted-foreground text-center">{iconData.label}</span>
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
            userSelect: 'none',
            touchAction: 'none'
          }}
          onPointerDown={handleLegendMouseDown}
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
              className="no-print h-5 w-5 max-md:h-9 max-md:w-9"
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
                    className="no-print flex-1 h-6 max-md:h-9 text-xs"
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onPointerDown={(e) => e.stopPropagation()}
                  />
                  <span className="hidden print-legend-label text-[7px] leading-tight">{item.label}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeLegendItem(index);
                    }}
                    className="h-6 w-6 max-md:h-9 max-md:w-9"
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
          className="no-print absolute bottom-12 left-2 bg-card/95 backdrop-blur-sm shadow-xl border-border text-[10px] h-6 px-2 max-md:h-9 max-md:px-3 max-md:text-xs"
        >
          Legend ({legendItems.length})
        </Button>
      )}
    </div>
  );
};
