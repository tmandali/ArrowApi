/**
 * Login oturumunun OIDC access token'ı (Keycloak) — API header senkronu.
 *
 * `AuthHeaderSync` gizli bileşeni (bkz. components/app/auth-header-sync.tsx)
 * `useSession()` değişiminde `session.user.accessToken`'i bu modüle iter;
 * tüm backend fetch'leri `getCompanyHeaders()` üzerinden `getAuthHeaders()`'i
 * topladığı için tek ek yer var — SSE/Arrow IPC/JSON isteklerin hepsi
 * `Authorization: Bearer <token>` taşır.
 *
 * Backend (Sims.Server) token'ı Keycloak JWKS ile doğrular; doğrulanamaz /
 * eksikse istek kimliksiz devam eder (tek kullanıcı modu fallback'i korunur).
 *
 * Google One Tap oturumlarında access token yoktur → `getAuthHeaders()`
 * boş dönebilir; `session.user.provider`'a bakmadan token'ın kendisine güven.
 */

let activeAccessToken: string | undefined;

/** Session değişiminde çağrılır (AuthHeaderSync). `null`/boş → token düşer. */
export function setAuthAccessToken(token: string | null | undefined): void {
  activeAccessToken = token || undefined;
}

/** Fetch header haritası — token yoksa boş nesne (header eklenmez). */
export function getAuthHeaders(): Record<string, string> {
  return activeAccessToken ? { Authorization: `Bearer ${activeAccessToken}` } : {};
}
