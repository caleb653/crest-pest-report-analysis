export type InferredImageUploadMeta = {
  ext: string;
  contentType: string;
};

function extToMime(ext: string): string {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
      return "image/heic";
    case "heif":
      return "image/heif";
    default:
      return "image/jpeg";
  }
}

function normalizeExt(ext: string): string {
  const lower = (ext || "").toLowerCase();
  if (lower === "jpeg") return "jpg";
  if (lower === "heif") return "heif";
  if (lower === "heic") return "heic";
  if (lower === "png") return "png";
  if (lower === "webp") return "webp";
  return lower || "jpg";
}

export function inferImageUploadMeta(file: File): InferredImageUploadMeta {
  const nameExtRaw = file.name.includes(".") ? file.name.split(".").pop() : undefined;
  const nameExt = normalizeExt(nameExtRaw || "");

  const type = (file.type || "").toLowerCase();
  const typeExtRaw = type.startsWith("image/") ? type.split("/")[1] : "";
  const typeExt = normalizeExt(typeExtRaw);

  const ext = normalizeExt(nameExt || typeExt || "jpg");

  // iPad Safari sometimes provides empty file.type for Photos. When contentType is missing,
  // storage may store it as application/octet-stream, and the image might not render.
  const contentType = type.startsWith("image/") ? type : extToMime(ext);

  return { ext, contentType };
}

/**
 * Compress an image file to reduce upload size.
 * Returns a compressed Blob and a local preview URL for instant display.
 */
export async function compressImage(
  file: File,
  options: { maxWidth?: number; maxHeight?: number; quality?: number } = {}
): Promise<{ blob: Blob; localUrl: string }> {
  const { maxWidth = 1200, maxHeight = 1200, quality = 0.7 } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const localUrl = URL.createObjectURL(file);
    img.src = localUrl;

    img.onload = () => {
      let { width, height } = img;

      // Calculate new dimensions while maintaining aspect ratio
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      // Create canvas and draw resized image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob with compression
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, localUrl });
          } else {
            reject(new Error("Failed to compress image"));
          }
        },
        "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      reject(new Error("Failed to load image"));
    };
  });
}
