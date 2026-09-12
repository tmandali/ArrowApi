import { useCompanyStore } from "@/store/slices/company-store"
import { getAuthHeaders } from "@/lib/auth-headers"

/**
 * Header map for fetch / apiFetch: active company + login session token.
 * `getAuthHeaders()` (bkz. lib/auth-headers.ts) Keycloak access token'ını
 * `Authorization: Bearer` olarak ekler; token yoksa boş döner
 * (tek kullanıcı / provider'sız modda header eklenmez).
 */
export function getCompanyHeaders(): Record<string, string> {
  const activeCompanyId = useCompanyStore.getState().activeCompanyId
  const headers: Record<string, string> = {}
  if (activeCompanyId) headers["X-Company-Id"] = activeCompanyId
  return { ...headers, ...getAuthHeaders() }
}
