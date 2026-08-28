/**
 * Hassas ayar alanları (API anahtarları) için güvenli depolama.
 * Web-only kararı: OS anahtar zinciri (Tauri) kaldırıldı;
 * sekme oturumu (`sessionStorage`) kullanılır — tarayıcı kapanınca silinir,
 * kalıcı düz metin depolama yapılmaz.
 *
 * Anahtar içermeyen yapılandırma ayrıca localStorage'da tutulur (useAgentBridge).
 */

const SECRET_STORAGE_KEY = "yula_ai_api_key"

/** Güvenli depodan API anahtarını okur; yoksa null döner. */
export async function loadSecret(): Promise<string | null> {
  try {
    return sessionStorage.getItem(SECRET_STORAGE_KEY)
  } catch {
    return null
  }
}

/** API anahtarını güvenli depoya yazar; boş değer verilirse siler. */
export async function saveSecret(value: string): Promise<void> {
  const trimmed = value.trim()
  try {
    if (trimmed) sessionStorage.setItem(SECRET_STORAGE_KEY, trimmed)
    else sessionStorage.removeItem(SECRET_STORAGE_KEY)
  } catch {
    // sessionStorage kapalı olabilir (gizli pencere vb.) — anahtar sadece bellekte yaşar.
  }
}
