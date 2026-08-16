import { env } from "@/config/env";

export const isTauriEnv =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

/**
 * Göreli API yollarını (`/api/...`) mutlak backend URL'ine dönüştürür.
 * 
 * - Vite dev sunucusu çalışırken (Tauri dev veya tarayıcı):
 *   Vite proxy'si (/api -> Sims.Server) kullanıldığı için göreli yol korunur.
 *   Bu sayede HTTPS -> HTTP Mixed Content engeli ve self-signed SSL sorunları yaşanmaz.
 * 
 * - Production Tauri bundle veya özel VITE_API_BASE_URL tanımlı olduğunda:
 *   Hedef backend API adresi eklenir.
 */
export function resolveApiUrl(path: string): string {
  if (!path) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  // Vite dev sunucusunda çalışırken Vite dahili proxy'sini kullan
  if (import.meta.env.DEV || (typeof window !== "undefined" && window.location.port === "56402")) {
    return path;
  }

  const base = env.apiBaseUrl || (isTauriEnv ? "https://localhost:7137" : "");
  if (!base) return path;

  const normalizedBase = base.endsWith("/") ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  return `${normalizedBase}${normalizedPath}`;
}
