import type { Company } from "@/types/company";
import { getAuthorizedCompanies } from "@/lib/company-catalog";

/**
 * Keycloak access token'ından realm rollerini okur. İmza doğrulanmaz —
 * token TLS üzerinden Keycloak token endpoint'inden geldi, burada sadece
 * payload okunur (RBAC kapısı değil, UI/session taşıma bilgisidir).
 * Runtime-safe: proxy.ts (edge dahil) + Node'da çalışır (Buffer yok).
 */
export function realmRolesFromAccessToken(accessToken: string): string[] {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return [];
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { realm_access?: { roles?: unknown } };
    const roles = payload.realm_access?.roles;
    return Array.isArray(roles) ? roles.filter((r): r is string => typeof r === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Kullanıcının yetkili şirketleri — şimdilik Next server tarafındaki
 * kataloğundan (bkz. lib/company-catalog.ts). Sims.Server ucu gelince
 * KATALOG kendisi proxy'ye çevrilir; bu çağrı ve oturum akışı değişmez.
 */
export async function fetchUserCompanies(user?: {
  sub?: string;
  accessToken?: string;
}): Promise<Company[]> {
  try {
    return await getAuthorizedCompanies(user);
  } catch (error) {
    console.error("[auth] yetkili şirketler alınamadı:", error);
    return [];
  }
}

/**
 * Provider'ın refresh token endpoint bilgisi (token değişimi istekleri).
 */
export function refreshEndpoint(provider: string): {
  url: string;
  clientId: string;
  clientSecret: string;
} | null {
  switch (provider) {
    case "google": {
      const clientId = process.env.AUTH_GOOGLE_ID;
      const clientSecret = process.env.AUTH_GOOGLE_SECRET;
      if (!clientId || !clientSecret) return null;
      return { url: "https://oauth2.googleapis.com/token", clientId, clientSecret };
    }
    case "keycloak": {
      const issuer = process.env.KEYCLOAK_ISSUER;
      const clientId = process.env.AUTH_KEYCLOAK_ID;
      const clientSecret = process.env.AUTH_KEYCLOAK_SECRET;
      if (!issuer || !clientId || !clientSecret) return null;
      const tokenUrl = `${issuer.replace(/\/+$/, "")}/protocol/openid-connect/token`;
      return { url: tokenUrl, clientId, clientSecret };
    }
    default:
      return null;
  }
}
