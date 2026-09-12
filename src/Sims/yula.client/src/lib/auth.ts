/**
 * NextAuth v5 yapılandırması.
 * Keycloak (OIDC) + Google OAuth — istenildiğinde başka provider'lar da eklenebilir.
 *
 * Kurulum sonrası .env'e şu anahtarları ekleyin:
 *   AUTH_SECRET=                          (openssl rand -base64 32)
 *   AUTH_KEYCLOAK_ID=                     Keycloak Client ID
 *   AUTH_KEYCLOAK_SECRET=                 Keycloak Client Secret
 *   KEYCLOAK_ISSUER=                      https://<realm>/protocol/openid-connect/
 *   AUTH_GOOGLE_ID=                       Google OAuth Client ID (opsiyonel)
 *   AUTH_GOOGLE_SECRET=                   Google OAuth Client Secret (opsiyonel)
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
import type { Session as NextAuthSession } from "next-auth";

// Session type extension (refreshToken bilinçli olarak dışarı verilmez)
export interface Session extends NextAuthSession {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    accessToken?: string;
    provider?: string;
  };
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

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Keycloak({
      clientId: process.env.AUTH_KEYCLOAK_ID!,
      clientSecret: process.env.AUTH_KEYCLOAK_SECRET!,
      issuer: process.env.KEYCLOAK_ISSUER!,
    }),
    ...(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
          }),
        ]
      : []),
  ],
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account }) {
      // 1) İlk giriş (account mevcut): access + refresh + ömür saklanır.
      if (account) {
        token.accessToken = account.access_token;
        // Google her sign-in'de refresh_token döndürmeyebilir (offline access
        // daha önce verilmişse); mevcut refresh token'ı silmeyelim.
        if (account.refresh_token) token.refreshToken = account.refresh_token;
        token.expiresAt = (account.expires_in ?? 3600) * 1000 + Date.now();
        token.provider = account.provider;
      }

      // 2) Token hâlâ geçerli → iş yapma.
      if (token.expiresAt && Date.now() < (token.expiresAt as number)) return token;

      // 3) Token ömrü dolmuş → refresh token ile yenile.
      //    (refresh_token yoksa — eski oturumlar vb. — mevcut token'a dokunma.)
      if (!token.refreshToken) return token;

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
        (session.user as typeof session.user & { accessToken?: string; provider?: string }).accessToken =
          token.accessToken as string | undefined;
        (session.user as typeof session.user & { accessToken?: string; provider?: string }).provider =
          token.provider as string | undefined;
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
