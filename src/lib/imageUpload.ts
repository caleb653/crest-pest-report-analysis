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
