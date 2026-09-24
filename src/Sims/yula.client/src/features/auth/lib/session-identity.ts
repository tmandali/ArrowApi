/**
 * Session → (provider, provider_id) kimlik çözümü — SAF modül.
 *
 * `app-user-sync` pg Pool açar; test prosesini asmamak için saf
 * yardımcılar burada yaşar (yalnız tip importları tırnakta).
 */
import type { Session } from "@/lib/auth";

/**
 * Provider normalizasyonu (URN Formatı - Method A):
 * - Google: "google"
 * - SMS: "sms"
 * - Keycloak: Aktif Issuer'a göre `keycloak:<host>` olarak çözülür.
 *   Örn: `keycloak:keycloaktest.lcwaikiki.com` vs `keycloak:localhost:8080`.
 *   Böylece Docker Keycloak ile Şirket Keycloak'u birbirinden %100 izole edilir.
 * - LDAP (gelecekte): `ldap:<host>` (örn: `ldap:dc01.corp.lcwaikiki.local`).
 */
export function normalizeProvider(provider?: string | null): string | null {
  if (!provider) return null;
  const p = provider.trim().toLowerCase();
  if (!p) return null;
  if (p === "google-onesig" || p === "google") return "google";
  if (p === "sms") return "sms";

  // Zaten URN formatındaysa (keycloak:host, ldap:host, azure:tenant vb.) koru:
  if (p.startsWith("keycloak:") || p.startsWith("ldap:") || p.startsWith("azure:")) {
    return p;
  }

  // Yalın "keycloak" geldiyse aktif KEYCLOAK_ISSUER env'inden hostu çöz:
  if (p === "keycloak") {
    const issuer = process.env.KEYCLOAK_ISSUER;
    if (issuer) {
      try {
        const url = new URL(issuer);
        return `keycloak:${url.host.toLowerCase()}`;
      } catch {
        return `keycloak:${issuer.toLowerCase()}`;
      }
    }
    return "keycloak";
  }

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
