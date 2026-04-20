import { Canvas as FabricCanvas, FabricImage, Line } from 'fabric';

export const normalizeSavedObjectType = (value: unknown) => String(value ?? '').toLowerCase();

export const isSavedTextObject = (value: unknown) => {
  const type = normalizeSavedObjectType(value);
  return type === 'text' || type === 'i-text' || type === 'itext';
};

export const getSavedMapObjects = (parsed: any): any[] => {
  if (parsed?.objects?.objects && Array.isArray(parsed.objects.objects)) {
    return parsed.objects.objects;
  }

  if (Array.isArray(parsed?.objects)) {
    return parsed.objects;
  }

  return [];
};

export const getSavedMapVersion = (parsed: any, obj?: any) => {
  return parsed?.objects?.version || parsed?.version || obj?.version || '6.0.0';
};

interface CreateSavedLineObjectOptions {
  obj: any;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  selectable: boolean;
  evented: boolean;
  hasControls?: boolean;
  hasBorders?: boolean;
}

interface CreateSavedImageObjectOptions {
  obj: any;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  selectable: boolean;
  evented: boolean;
  hasControls?: boolean;
  hasBorders?: boolean;
}

export const createSavedLineObject = ({
  obj,
  left,
  top,
  scaleX,
  scaleY,
  selectable,
  evented,
  hasControls,
  hasBorders,
}: CreateSavedLineObjectOptions) => {
  const line = new Line([obj.x1 || 0, obj.y1 || 0, obj.x2 || 0, obj.y2 || 0], {
    left,
    top,
    scaleX,
    scaleY,
    angle: obj.angle || 0,
    originX: obj.originX || 'left',
    originY: obj.originY || 'top',
    stroke: obj.stroke || '#DC2626',
    strokeWidth: obj.strokeWidth || 5,
    strokeLineCap: obj.strokeLineCap || 'butt',
    strokeLineJoin: obj.strokeLineJoin || 'miter',
    strokeDashArray: Array.isArray(obj.strokeDashArray) ? obj.strokeDashArray : undefined,
    strokeDashOffset: obj.strokeDashOffset || 0,
    strokeMiterLimit: obj.strokeMiterLimit || 4,
    strokeUniform: obj.strokeUniform || false,
    fill: obj.fill || 'rgb(0,0,0)',
    opacity: obj.opacity ?? 1,
    visible: obj.visible ?? true,
    flipX: obj.flipX || false,
    flipY: obj.flipY || false,
    skewX: obj.skewX || 0,
    skewY: obj.skewY || 0,
    selectable,
    evented,
    ...(typeof hasControls === 'boolean' ? { hasControls } : {}),
    ...(typeof hasBorders === 'boolean' ? { hasBorders } : {}),
  });

  line.setCoords();
  return line;
};

export const createSavedImageObject = async ({
  obj,
  left,
  top,
  scaleX,
  scaleY,
  selectable,
  evented,
  hasControls,
  hasBorders,
}: CreateSavedImageObjectOptions) => {
  const image = await FabricImage.fromURL(obj.src || '');

  image.set({
    left,
    top,
    scaleX,
    scaleY,
    angle: obj.angle || 0,
    originX: obj.originX || 'left',
    originY: obj.originY || 'top',
    cropX: obj.cropX || 0,
    cropY: obj.cropY || 0,
    opacity: obj.opacity ?? 1,
    visible: obj.visible ?? true,
    flipX: obj.flipX || false,
    flipY: obj.flipY || false,
    skewX: obj.skewX || 0,
    skewY: obj.skewY || 0,
    selectable,
    evented,
    ...(typeof hasControls === 'boolean' ? { hasControls } : {}),
    ...(typeof hasBorders === 'boolean' ? { hasBorders } : {}),
  });

  image.setCoords();
  return image;
};

export const safeDisposeFabricCanvas = async (canvas: FabricCanvas | null | undefined) => {
  if (!canvas) return;

  try {
    const disposeResult = canvas.dispose();
    if (disposeResult && typeof (disposeResult as Promise<unknown>).then === 'function') {
      await (disposeResult as Promise<unknown>).catch(() => undefined);
    }
  } catch {
    // Ignore Fabric cleanup errors from detached/temp canvases
  }
};

interface ReviveSavedFabricObjectOptions {
  canvas: FabricCanvas;
  obj: any;
  version?: string;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  selectable: boolean;
  evented: boolean;
  editable?: boolean;
  hasControls?: boolean;
  hasBorders?: boolean;
}

export const reviveSavedFabricObject = async ({
  canvas,
  obj,
  version,
  left,
  top,
  scaleX,
  scaleY,
  selectable,
  evented,
  editable,
  hasControls,
  hasBorders,
}: ReviveSavedFabricObjectOptions) => {
  const tempCanvas = new FabricCanvas(document.createElement('canvas'), {
    width: canvas.getWidth(),
    height: canvas.getHeight(),
  });

  try {
    // Fabric v6: loadFromJSON returns a Promise. The 2nd argument is a per-object
    // reviver, NOT a completion callback (that was v5). Awaiting the returned
    // Promise is the only correct way to know loading finished.
    const loadResult = tempCanvas.loadFromJSON({
      objects: [obj],
      version: version || obj?.version || '6.0.0',
    });
    if (loadResult && typeof (loadResult as Promise<unknown>).then === 'function') {
      await (loadResult as Promise<unknown>).catch(() => undefined);
    }

    const revivedObject = tempCanvas.getObjects()[0];
    if (!revivedObject) return null;

    revivedObject.set({
      left,
      top,
      scaleX,
      scaleY,
      selectable,
      evented,
      ...(typeof hasControls === 'boolean' ? { hasControls } : {}),
      ...(typeof hasBorders === 'boolean' ? { hasBorders } : {}),
    });

    if (typeof editable === 'boolean' && 'editable' in revivedObject) {
      (revivedObject as any).editable = editable;
    }

    revivedObject.setCoords();
    canvas.add(revivedObject);
    return revivedObject;
  } finally {
    await safeDisposeFabricCanvas(tempCanvas);
  }
};