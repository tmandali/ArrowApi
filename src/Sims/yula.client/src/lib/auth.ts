/**
 * NextAuth v5 yapılandırması.
 * Keycloak (OIDC) + Google OAuth + Google One Tap (GIS, ana sayfa tek tık) —
 * istenildiğinde başka provider'lar da eklenebilir.
 *
 * Kurulum sonrası .env'e şu anahtarları ekleyin:
 *   AUTH_SECRET=                          (openssl rand -base64 32)
 *   AUTH_KEYCLOAK_ID=                     Keycloak Client ID
 *   AUTH_KEYCLOAK_SECRET=                 Keycloak Client Secret
 *   KEYCLOAK_ISSUER=                      https://<realm>/protocol/openid-connect/
 *   AUTH_GOOGLE_ID=                       Google OAuth Client ID (opsiyonel)
 *   AUTH_GOOGLE_SECRET=                   Google OAuth Client Secret (opsiyonel)
 *   (Google One Tap, AUTH_GOOGLE_ID'yi build'de NEXT_PUBLIC_GOOGLE_CLIENT_ID
 *    olarak client'a açar — bkz. next.config.ts ve google-onesig provider'ı.)
 *
 * Refresh Token Desteği:
 *   - Google ilk girişte refresh_token döndürmesi için, client tarafındaki
 *     signIn çağrısına `access_type: offline` authorization parametresi geçilir
 *     (bkz: src/features/auth/lib/provider-signin-params.ts).
 *   - `jwt` callback her istekte token ömrünü kontrol eder; dolunca refresh token
 *     ile arka planda yeni access token alır (kullanıcı yeniden login'e gitmez).
 *   - `refreshToken` güvenlik için client'a (session) verilmez; yalnız `accessToken`
 *     ve `provider` session'a taşınır.
 *   - Refresh başarısız olursa token'lar temizlenir → kullanıcı bir sonraki
 *     istekte doğal olarak yeniden giriş yapar.
 */
import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import Google from "next-auth/providers/google";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Session as NextAuthSession, User as NextAuthUser } from "next-auth";

// Session type extension (refreshToken bilinçli olarak dışarı verilmez)
export interface Session extends NextAuthSession {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    accessToken?: string;
    provider?: string;
    /**
     * Keycloak realm rolleri (access token'daki `realm_access.roles`).
     * Google ile girenlerde boş dizi — rol kapısı yazarken bunu unutma
     * (bkz. features/auth/lib/realm-roles.ts).
     */
    roles?: string[];
  };
}

/**
 * Keycloak access token'ından realm rollerini okur. İmza doğrulanmaz —
 * token TLS üzerinden Keycloak token endpoint'inden geldi, burada sadece
 * payload okunur (RBAC kapısı değil, UI/session taşıma bilgisidir).
 * Runtime-safe: proxy.ts (edge dahil) + Node'da çalışır (Buffer yok).
 */
function realmRolesFromAccessToken(accessToken: string): string[] {
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
 * Provider'ın refresh token endpoint bilgisi (token değişimi istekleri).
 */
function refreshEndpoint(provider: string): {
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
      // KEYCLOAK_ISSUER: http://localhost:8080/realms/yula-realm
      const tokenUrl = `${issuer.replace(/\/+$/, "")}/protocol/openid-connect/token`;
      return { url: tokenUrl, clientId, clientSecret };
    }
    default:
      return null;
  }
}

/**
 * Google One Tap (Google Identity Services) — sign-in kartındaki GIS butonu.
 *
 * Client'teki `GoogleOneTapButton` bileşeni GIS ile ID token alır ve
 * `signIn("google-onesig", { id_token })` olarak buraya POST'lar. `authorize`
 * ID token'ı Google JWKS ile yerel olarak doğrular (imza + iss + aud + exp)
 * ve profili token'ın içinden okur — ek access token/userinfo turu gerekmez.
 *
 * Notlar:
 *  - One Tap refresh_token dönmez; access token süresi dolarsa kullanıcı
 *    yine tek tıkla yeniden giriş yapar (tekrar redirect olmaz).
 *  - İd bilinçli olarak "google-onesig" — `getProviders()` bu provider'ı
 *    sign-in ekranına sızdırabilir; `ProviderButtons` bileşeninde gizli
 *    listede tutulur (One Tap YALNIZ sign-in kartındaki GIS butonundadır).
 */
const googleJwks = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

const googleOneTapProvider = {
  id: "google-onesig",
  name: "Google One Tap",
  type: "credentials" as const,
  credentials: {
    id_token: { label: "Google ID Token", type: "string" },
  },
  sign_in: "/sign-in",
  async authorize(credentials: Record<string, unknown>) {
    const idToken = typeof credentials?.id_token === "string" ? credentials.id_token : "";
    const clientId = process.env.AUTH_GOOGLE_ID;
    if (!idToken || !clientId) return null;

    // ID token'ı doğrula: imza (Google JWKS) + issuer + audience + süre.
    let payload: {
      sub?: string;
      name?: string;
      email?: string;
      picture?: string;
      exp?: number;
    };
    try {
      const verified = await jwtVerify(idToken, googleJwks, {
        issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: clientId,
      });
      payload = verified.payload;
    } catch (error) {
      console.error("[auth] Google One Tap ID token doğrulama hatası:", error);
      return null;
    }
    if (!payload.sub || !payload.exp) return null;

    // accessToken/expiresAt jwt callback'te tüketilir; provider "google" olarak
    // haritalanır ki refreshEndpoint() aynı Google endpoint'ini çözümsünlensin.
    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      image: payload.picture,
      expiresAt: payload.exp * 1000,
      provider: "google",
    };
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Koşullu: yalnızca tüm Keycloak env'leri varken register edilir.
    // Eksik provider (placeholder env) UI'de görünmez — bkz. getProviders().
    ...(process.env.AUTH_KEYCLOAK_ID &&
    process.env.AUTH_KEYCLOAK_SECRET &&
    process.env.KEYCLOAK_ISSUER
      ? [
          Keycloak({
            clientId: process.env.AUTH_KEYCLOAK_ID!,
            clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
            issuer: process.env.KEYCLOAK_ISSUER!,
          }),
        ]
      : []),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          }),
          // One Tap de aynı env'lerle register edilir (google-onesig).
          googleOneTapProvider,
        ]
      : []),
  ],
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, user }) {
      // 1) İlk giriş (account mevcut): access + refresh + ömür saklanır.
      if (account) {
        token.accessToken = account.access_token;
        // Google her sign-in'de refresh_token döndürmeyebilir (offline access
        // daha önce verilmişse); mevcut refresh token'ı silmeyelim.
        if (account.refresh_token) token.refreshToken = account.refresh_token;
        token.expiresAt = (account.expires_in ?? 3600) * 1000 + Date.now();
        token.provider = account.provider;
        // Keycloak ise roller access token'dan okunur (ilk girişte bir kez).
        token.roles =
          account.provider === "keycloak" && typeof account.access_token === "string"
            ? realmRolesFromAccessToken(account.access_token)
            : [];
      }

      // 1b) Google One Tap (credentials): ömür `user` üzerinden gelir
      //     (redirect'li OAuth'tan farklı olarak `account` yoktur; access
      //     token yoktur — ID token içindeki exp kullanılır).
      const oneTapUser = user as (NextAuthUser & {
        accessToken?: string;
        expiresAt?: number;
      }) | undefined;
      if (!account && typeof oneTapUser?.expiresAt === "number") {
        if (oneTapUser.accessToken) token.accessToken = oneTapUser.accessToken;
        token.expiresAt = oneTapUser.expiresAt;
        token.provider = "google";
      }

      // 2) Token hâlâ geçerli → iş yapma.
      if (token.expiresAt && Date.now() < (token.expiresAt as number)) return token;

      // 3) Token ömrü dolmuş → refresh token ile yenile.
      //    (refresh_token yoksa — One Tap vb. — mevcut token'a dokunma.)
      if (!token.refreshToken) {
        // One Tap'te refresh token olmadığı için süresi dolan access token'ı
        // arka planda yenilemek imkânsız; eskimiş token'ı dışarı verme.
        if (token.accessToken && token.expiresAt && Date.now() >= (token.expiresAt as number)) {
          delete token.accessToken;
        }
        return token;
      }

      const provider = typeof token.provider === "string" ? token.provider : "";
      const endpoint = refreshEndpoint(provider);
      if (!endpoint) return token;

      try {
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: String(token.refreshToken),
            client_id: endpoint.clientId,
            client_secret: endpoint.clientSecret,
          }),
          cache: "no-store",
        });
        const data = (await res.json()) as {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          error?: string;
          error_description?: string;
        };
        if (!res.ok || !data.access_token) {
          throw new Error(data.error_description ?? data.error ?? "Token refresh başarısız");
        }

        token.accessToken = data.access_token;
        token.expiresAt = (data.expires_in ?? 3600) * 1000 + Date.now();
        // Keycloak gibi refresh token'ı döndüren (rotasyon) provider'larda güncelle.
        if (data.refresh_token) token.refreshToken = data.refresh_token;
        // Yenilenen access token ile roller tazelenir (rol değişimi
        // tekrar giriş gerektirmez — en geç 5 dakikada yansır).
        if (provider === "keycloak") token.roles = realmRolesFromAccessToken(data.access_token);
      } catch (error) {
        // Refresh başarısız → token'ları temizle; kullanıcı bir sonraki
        // istekte yeniden giriş yapar (sessiz hata yok).
        console.error(`[auth] refresh token hatası (${provider}):`, error);
        delete token.accessToken;
        delete token.refreshToken;
        delete token.expiresAt;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "unknown";
        const user = session.user as typeof session.user & {
          accessToken?: string;
          provider?: string;
          roles?: string[];
        };
        user.accessToken = token.accessToken as string | undefined;
        user.provider = token.provider as string | undefined;
        user.roles = Array.isArray(token.roles)
          ? (token.roles as unknown[]).filter((r): r is string => typeof r === "string")
          : [];
      }
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
    signOut: "/sign-in",
    error: "/sign-in",
  },
});
