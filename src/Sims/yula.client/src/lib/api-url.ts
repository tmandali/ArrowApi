/**
 * Web-only: Tauri algılaması kaldırıldı; her zaman false.
 * (Proje kuralı — yula.client'a Tauri/Python kurulmaz.)
 */
export const isTauriEnv = false;

export const IS_DEV = process.env.NODE_ENV === "development";

/**
 * Göreli API yollarını (`/api/...`) mutlak backend URL'ine dönüştürür.
 *
 * - Dev'de Next rewrites proxy'si (/api -> Sims.Server) göreli yolu korur:
 *   HTTPS mixed-content ve self-signed SSL sorunları yaşanmaz.
 * - Production'da NEXT_PUBLIC_API_BASE_URL tanımlıysa eklenir.
 */
export function resolveApiUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  if (IS_DEV) {
    return path;
  }

  const base = process.env.NEXT_PUBLIC_API_BASE_URL || "";
  if (!base) return path;

  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}
