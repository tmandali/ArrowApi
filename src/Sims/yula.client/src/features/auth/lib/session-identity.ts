/**
 * Session → (provider, provider_id) kimlik çözümü — SAF modül.
 *
 * `app-user-sync` pg Pool açar; test prosesini asmamak için saf
 * yardımcılar burada yaşar (yalnız tip importları tırnakta).
 */
import type { Session } from "@/lib/auth";

/**
 * Provider normalizasyonu: Google One Tap ("google-onesig") aslında Google
 * kimliğidir — aynı Google hesabı GIS butonu + One Tap ile 2 satır
 * üretmesin diye `google`'a yansır.
 */
export function normalizeProvider(provider?: string | null): string | null {
  if (!provider) return null;
  const p = provider.trim().toLowerCase();
  if (!p) return null;
  if (p === "google-onesig" || p === "google") return "google";
  if (p === "keycloak") return "keycloak";
  return p;
}

/**
 * Oturum kullanıcısının `(provider, provider_id)` kimliğini döndürür.
 * Geçerli session yoksa (provider'sız tek kullanıcı modu) null.
 */
export function sessionIdentity(
  session: Session | null | undefined,
): { provider: string; providerId: string } | null {
  const sub = session?.user?.id;
  if (!sub || sub === "unknown") return null;
  const provider = normalizeProvider(session?.user?.provider);
  if (!provider) return null;
  return { provider, providerId: sub };
}
