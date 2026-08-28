import { isTauriEnv } from "@/lib/api-url"

/**
 * Hassas ayar alanları (API anahtarları) için güvenli depolama köprüsü.
 *
 * - Masaüstü (Tauri): OS anahtar zinciri — macOS Keychain / Windows Credential Manager /
 *   Linux Secret Service (`set_secret` / `get_secret` / `delete_secret` komutları).
 * - Web: yalnızca sekme oturumu (`sessionStorage`) — tarayıcı kapanınca silinir;
 *   kalıcı düz metin depolama yapılmaz.
 *
 * Anahtar içermeyen yapılandırma ayrıca localStorage'da tutulur (useAgentBridge).
 */

const SECRET_STORAGE_KEY = "yula_ai_api_key"

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core")
  return core.invoke<T>(cmd, args)
}

/** Güvenli depodan API anahtarını okur; yoksa null döner. */
export async function loadSecret(): Promise<string | null> {
  if (isTauriEnv) {
    try {
      return await tauriInvoke<string | null>("get_secret", { key: SECRET_STORAGE_KEY })
    } catch (err) {
      console.warn("[SecureConfig] OS anahtar zinciri okunamadı:", err)
      return null
    }
  }
  try {
    return sessionStorage.getItem(SECRET_STORAGE_KEY)
  } catch {
    return null
  }
}

/** API anahtarını güvenli depoya yazar; boş değer verilirse siler. */
export async function saveSecret(value: string): Promise<void> {
  const trimmed = value.trim()
  if (isTauriEnv) {
    try {
      if (trimmed) {
        await tauriInvoke("set_secret", { key: SECRET_STORAGE_KEY, value: trimmed })
      } else {
        await tauriInvoke("delete_secret", { key: SECRET_STORAGE_KEY })
      }
      return
    } catch (err) {
      // Keychain erişimi reddedilirse oturum belleğine düş; kalıcı düz metin yazma.
      console.warn("[SecureConfig] OS anahtar zincirine yazılamadı, oturum belleği kullanılacak:", err)
    }
  }
  try {
    if (trimmed) sessionStorage.setItem(SECRET_STORAGE_KEY, trimmed)
    else sessionStorage.removeItem(SECRET_STORAGE_KEY)
  } catch {
    // sessionStorage kapalı olabilir (gizli pencere vb.) — anahtar sadece bellekte yaşar.
  }
}
