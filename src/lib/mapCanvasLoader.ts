import { Canvas as FabricCanvas } from 'fabric';

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
    await new Promise<void>((resolve) => {
      tempCanvas.loadFromJSON({ objects: [obj], version: version || obj?.version || '6.0.0' }, () => resolve());
    });

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
    tempCanvas.dispose();
  }
};