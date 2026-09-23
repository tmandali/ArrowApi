/**
 * NextAuth v5 yapılandırması.
 * Keycloak (OIDC) + Google OAuth + Google One Tap (GIS, ana sayfa tek tık) —
 * istenildiğinde başka provider'lar da eklenebilir.
 */
import NextAuth from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import Google from "next-auth/providers/google";
import type { Session as NextAuthSession, User as NextAuthUser } from "next-auth";
import type { Company } from "@/types/company";
import {
  realmRolesFromAccessToken,
  fetchUserCompanies,
  refreshEndpoint,
} from "@/features/auth/lib/auth-helpers";
import {
  googleOneTapProvider,
  smsOtpProvider,
} from "@/features/auth/lib/custom-credentials-providers";

// Session type extension (refreshToken bilinçli olarak dışarı verilmez)
export interface Session extends NextAuthSession {
  error?: "RefreshTokenError" | string;
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
    /**
     * Kullanıcının işlem yapabildiği şirketler — giriş anında Next
     * server tarafındaki kataloğa (lib/company-catalog.ts) sorulur;
     * Sims.Server ucu gelince katalog Bearer + sub bazlı yetki listesini
     * backend'den çeken proxy'ye çevrilir. Katalog boşsa ([] / hata) client
     * seed listeye düşer.
     */
    companies?: Company[];
    /**
     * Aktif şirket — session property'si (tek doğruluk kaynağı session'dır).
     * `POST /api/companies/active` session JWT'sini bu değerle yeniden
     * imzalar; aktif şirket istemci localStorage'unda YAŞAMAZ.
     */
    activeCompanyId?: string | null;
    /**
     * SMS OTP girişlerinde telefon numarası (E.164). `id` de aynı değer
     * taşır (provider="sms" ile `sessionIdentity` → (sms, phone) çözümü;
     * identity satırı giriş sonrası ensure-user ile otomatik açılır).
     */
    phone?: string | null;
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    // Koşullu: yalnızca tüm Keycloak env'leri varken register edilir.
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
          googleOneTapProvider,
        ]
      : []),
    // SMS OTP: yalnızca `AUTH_SMS_OTP_ENABLED=true` iken register edilir
    ...(process.env.AUTH_SMS_OTP_ENABLED === "true" ? [smsOtpProvider] : []),
  ],
  trustHost: true,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, account, user }) {
      // 1) İlk giriş (account mevcut): access + refresh + ömür saklanır.
      if (account) {
        token.accessToken = account.access_token;
        if (account.refresh_token) token.refreshToken = account.refresh_token;
        token.expiresAt = (account.expires_in ?? 3600) * 1000 + Date.now();
        token.provider = account.provider;
        token.roles =
          account.provider === "keycloak" && typeof account.access_token === "string"
            ? realmRolesFromAccessToken(account.access_token)
            : [];
        const companies = await fetchUserCompanies({
          sub: token.sub ?? undefined,
          accessToken: typeof account.access_token === "string" ? account.access_token : undefined,
        });
        token.companies = companies;
        const previousActive =
          typeof token.activeCompanyId === "string" ? token.activeCompanyId : undefined;
        token.activeCompanyId =
          previousActive && companies.some((c) => c.id === previousActive)
            ? previousActive
            : (companies[0]?.id ?? null);
      }

      // 1b) Google One Tap (credentials): ID token, `user.accessToken` olarak session'a taşınır.
      const oneTapUser = user as (NextAuthUser & {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: number;
      }) | undefined;
      if (typeof oneTapUser?.expiresAt === "number") {
        if (oneTapUser.accessToken) token.accessToken = oneTapUser.accessToken;
        if (oneTapUser.refreshToken) token.refreshToken = oneTapUser.refreshToken;
        token.expiresAt = oneTapUser.expiresAt;
        token.provider = "google-onesig";
      }

      // 1c) SMS OTP (credentials): authorize user'ı `phone` alanıyla damgalanır.
      const smsUser = user as NextAuthUser & { phone?: string } | undefined;
      if (smsUser && typeof smsUser.phone === "string") {
        token.phone = smsUser.phone;
        token.provider = "sms";
        delete token.accessToken;
        delete token.refreshToken;
        delete token.expiresAt;
        return token;
      }

      // 2) Token hâlâ geçerli → iş yapma.
      if (token.expiresAt && Date.now() < (token.expiresAt as number)) return token;

      // 3) Token ömrü dolmuş → refresh token ile yenile.
      if (!token.refreshToken) {
        if (token.accessToken && token.expiresAt && Date.now() >= (token.expiresAt as number)) {
          delete token.accessToken;
        }
        if (token.provider !== "sms" && !token.accessToken) {
          token.error = "RefreshTokenError";
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
        let data: {
          access_token?: string;
          refresh_token?: string;
          expires_in?: number;
          error?: string;
          error_description?: string;
        };
        try {
          data = (await res.json()) as typeof data;
        } catch {
          data = {};
        }

        const errorType = data.error as string | undefined;
        if (!res.ok || !data.access_token) {
          const label =
            data.error_description ?? errorType ?? "Token refresh başarısız";
          const fatal =
            res.status === 400 &&
            (errorType === "invalid_grant" ||
              errorType === "invalid_client" ||
              errorType === "unauthorized_client");
          if (fatal) {
            console.warn(
              `[auth] kalıcı refresh hatası (${provider}): ${label} — token'lar temizlendi`,
            );
            delete token.accessToken;
            delete token.refreshToken;
            delete token.expiresAt;
            token.error = "RefreshTokenError";
            return token;
          }
          console.warn(
            `[auth] geçici refresh hatası (${provider}): HTTP ${res.status} — ${label}`,
          );
          return token;
        }

        token.accessToken = data.access_token;
        token.expiresAt = (data.expires_in ?? 3600) * 1000 + Date.now();
        if (data.refresh_token) token.refreshToken = data.refresh_token;
        if (provider === "keycloak") token.roles = realmRolesFromAccessToken(data.access_token);
        delete token.error;
      } catch (error) {
        console.error(`[auth] refresh isteği istisna (${provider}):`, error);
      }
      return token;
    },
    async session({ session, token }) {
      if (token.error) {
        (session as Session).error = token.error as string;
      }
      if (session.user) {
        session.user.id = token.sub ?? "unknown";
        const user = session.user as typeof session.user & {
          accessToken?: string;
          provider?: string;
          roles?: string[];
          companies?: Company[];
          activeCompanyId?: string | null;
          phone?: string | null;
        };
        user.accessToken = token.accessToken as string | undefined;
        user.provider = token.provider as string | undefined;
        user.roles = Array.isArray(token.roles)
          ? (token.roles as unknown[]).filter((r): r is string => typeof r === "string")
          : [];
        user.companies = Array.isArray(token.companies)
          ? (token.companies as Company[])
          : [];
        user.activeCompanyId =
          typeof token.activeCompanyId === "string" ? (token.activeCompanyId as string) : null;
        user.phone =
          typeof (token as Record<string, unknown>).phone === "string"
            ? ((token as Record<string, unknown>).phone as string)
            : null;
      }
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
    signOut: "/sign-in",
    error: "/sign-in",
  },
  debug: process.env.NODE_ENV === "development",
  logger: {
    error(error: Error) {
      console.error("[auth][error]:", error.message);
      if ("cause" in error && error.cause) {
        console.error("  ↳ [auth][root cause]:", error.cause);
      }
    },
    warn(code: string) {
      console.warn("[auth][warn]:", code);
    },
    debug(message: string, metadata?: unknown) {
      if (process.env.NODE_ENV === "development") {
        console.log("[auth][debug]:", message, metadata ?? "");
      }
    },
  },
});
