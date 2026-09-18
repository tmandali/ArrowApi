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
import { normalizePhone } from "@/features/auth/lib/sms-otp";
import { verifySmsOtp } from "@/features/auth/lib/sms-otp-store";
import type { Session as NextAuthSession, User as NextAuthUser } from "next-auth";
import type { Company } from "@/types/company";
import { getAuthorizedCompanies } from "@/lib/company-catalog";

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
 * Kullanıcının yetkili şirketleri — şimdilik Next server tarafındaki
 * kataloğundan (bkz. lib/company-catalog.ts). Sims.Server ucu gelince
 * KATALOG kendisi proxy'ye çevrilir; bu çağrı ve oturum akışı değişmez.
 */
async function fetchUserCompanies(user?: {
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
 *  - One Tap'te ID token'ın kendisi "accessToken" olarak session'a
 *    taşınır. Dikkat: Google'ın ne token-exchange'i (400
 *    unsupported_grant_type) ne de userinfo endpoint'inin ID token'ı
 *    Bearer olarak kabul etmesi (401 invalid_request) mümkün — ikisi
 *    da canlıda doğrulandı. Bu yüzden /api/auth/userinfo proxy'si One
 *    Tap session'larında (provider=google + refresh_token yok) Google'a
 *    gitmez, session'daki name/email/picture claim'lerini "son
 *    senkronizasyon" olarak döndürür. Ömür ~1 saattir; refresh_token
 *    olmadığından arka plan refresh yok — süresi dolunca yeniden giriş
 *    (tek tık) tazeler.
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

    // Google One Tap: GIS yalnız ID token verir. Token exchange
    // (`oauth2/v4/token`, RFC 8693) Google'da desteklenmez (400) ve
    // userinfo endpoint'i de ID token'ı Bearer kabul etmez (401) —
    // ikisi de canlıda doğrulandı. Çözüm: ID token'ı OLABİLDİĞİ KADAR
    // "accessToken" olarak session'a taşırız; /api/auth/userinfo
    // proxy'si One Tap session'larında (refresh_token yok) Google'a
    // gitmez, session claim'lerini döner. Ömür = ID token'ın exp'i
    // (~1 saat); süresi dolunca jwt callback token'ı siler, route 409
    // "yeniden giriş" döner. (Klâsik redirect'li Google OAuth bu
    // kısıtın dışında — access + refresh token'la çalışmaya devam
    // eder, orada gerçek userinfo çağrısı yapılır.)
    // Not: Google'ın yeni One Tap consent yapısı ID token'a `picture`
    // claim'i GÖMMEZ (canlıda doğrulandı: iss,azp,aud,sub,email,
    // email_verified,nbf,name,given_name,family_name,iat,exp,jti —
    // picture yok). Resimli profil gerekiyorsa klasik OAuth
    // (GOOGLE_ONE_TAP kapatılmalı) kullanın — orada userinfo resim
    // çeker.
    const accessToken = idToken;
    const expiresAt = payload.exp * 1000;

    // accessToken/expiresAt jwt callback'te tüketilir; provider
    // "google-onesig" damgasıyla oturuma yazılır (userinfo route'u bu
    // damgaya bakıp session claim fallback'i yapar).
    return {
      id: payload.sub,
      name: payload.name,
      email: payload.email,
      image: payload.picture,
      accessToken,
      expiresAt,
      provider: "google-onesig",
    };
  },
};

/**
 * SMS OTP credentials provider'ı — telefon numarası + SMS koduyla giriş.
 *
 * Akış (2 adım):
 *  1. `POST /api/sms/request` — kod üret + SMS (veya console) dispatch.
 *  2. `signIn("sms-otp", { phone, code, ... })` — NextAuth credentials
 *     akışı; `authorize` kodu `verifySmsOtp` ile doğrulayıp (TTL +
 *     deneme limiti + hash eşleşmesi) user'ı döndürür.
 *
 * Kimlik modeli uyumu (bkz. server/db/schema.ts):
 *  - `user.id` = E.164 telefon → session JWT'sinin `sub`'u = telefon;
 *    `token.provider` jwt callback'te "sms" damgasıyla yazılır ve
 *    `sessionIdentity` → (sms, phone) çözer. Identity satırı (guest)
 *    giriş SONRASI ensure-user akışıyla otomatik açılır — authorize
 *    kullanıcı tablosuna YAZMAZ.
 *  - OAuth refresh token mantığı credentials'ta yoktur; jwt callback
 *    (1c) branch'i `token.provider = "sms"` ile erken döner ve refresh
 *    mantığını atlar.
 *
 * Koşullu kayıt: `AUTH_SMS_OTP_ENABLED=true` iken register edilir
 * (Keycloak/Google deseni — env yoksa UI'de görünmez). Kodu kimin
 * gönderdiği `SMS_PROVIDER` (console | twilio) belirler.
 */
const smsOtpProvider = {
  id: "sms-otp",
  name: "SMS OTP",
  type: "credentials" as const,
  credentials: {
    phone: { label: "Telefon", type: "text", placeholder: "5XXXXXXXXX" },
    code: { label: "Kod", type: "text" },
  },
  async authorize(credentials: Record<string, unknown>) {
    const phone = normalizePhone(credentials?.phone);
    const code = typeof credentials?.code === "string" ? credentials.code : "";
    if (!phone || !code) return null;

    const verdict = await verifySmsOtp(phone, code);
    if (!verdict.ok) {
      console.log(`[auth] sms-otp doğrulama başarısız (${verdict.reason})`);
      return null; // form hata mesajı gösterilir (invalid_credentials)
    }

    // Katmanlı model: identity satırı burada değil, giriş sonrası
    // ensure-user ile açılır. `id` = telefon (E.164) → `sub` = telefon,
    // `sessionIdentity` (sms, phone) döner.
    return { id: phone, phone };
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
    // SMS OTP: yalnızca `AUTH_SMS_OTP_ENABLED=true` iken register edilir
    // (Kod dispatch'i `SMS_PROVIDER` ile seçilir — console dev/test varsayılan).
    ...(process.env.AUTH_SMS_OTP_ENABLED === "true" ? [smsOtpProvider] : []),
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
        // Yetkili şirketler session'a taşınır (tenant property'si): giriş
        // ANINDA bir kez kataloğa sorulur (şimdilik Next server; Sims.Server
        // ucu gelince katalog kendisi proxy'ye döner) — her session
        // fetch'inde değil (token refresh path'leri bu branch'e düşmez,
        // token.companies korunur). Katalog boşsa/[] → client seed listeye
        // düşer.
        const companies = await fetchUserCompanies({
          sub: token.sub ?? undefined,
          accessToken: typeof account.access_token === "string" ? account.access_token : undefined,
        });
        token.companies = companies;
        // Varsayılan aktif şirket: mevcut session'daki seçim saklıysa onu
        // koru (yeniden girişte şirket atlaması olmasın); yoksa ilki.
        const previousActive =
          typeof token.activeCompanyId === "string" ? token.activeCompanyId : undefined;
        token.activeCompanyId =
          previousActive && companies.some((c) => c.id === previousActive)
            ? previousActive
            : (companies[0]?.id ?? null);
      }

      // 1b) Google One Tap (credentials): ID token, `user.accessToken`
      //     olarak session'a taşınır (route, One Tap session'larında
      //     session claim'lerini döner — dosya başı notu).
      //     Not: v5 credentials sign-in'de `account` DA tanımlı gelebilir;
      //     One Tap user'ı custom `expiresAt` alanıyla AYIRT edilir
      //     (redirect akışında user bu alanı taşımaz); bu branch 1)
      //     branch'inin üstüne yazabilir — One Tap'te user'ın değeri
      //     otoriterdir.
      const oneTapUser = user as (NextAuthUser & {
        accessToken?: string;
        refreshToken?: string;
        expiresAt?: number;
      }) | undefined;
      if (typeof oneTapUser?.expiresAt === "number") {
        if (oneTapUser.accessToken) token.accessToken = oneTapUser.accessToken;
        if (oneTapUser.refreshToken) token.refreshToken = oneTapUser.refreshToken;
        token.expiresAt = oneTapUser.expiresAt;
        // "google-onesig" damgası: /api/auth/userinfo bu provider'a bakıp
        // One Tap session'larında session claim'lerini döner (ID token'ı
        // Bearer kabul etmediğinden). Klasik Google OAuth provider
        // "google" damgasıyla farklı kalır.
        token.provider = "google-onesig";
      }

      // 1c) SMS OTP (credentials): authorize user'ı `phone` alanıyla
      //     damgalanır → provider "sms" (identity modeli: (sms, phone)),
      //     credentials'ta access/refresh token YOK → token temizlenir
      //     ve refresh mantığı ATLANIR (erken return).
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
      //    (refresh_token yoksa — One Tap sessionları vb. — süresi dolan
      //     accessToken'i sil: userinfo proxy'si temiz 409 "yeniden giriş"
      //     dönebilsin, 502 "hata" değil.)
      if (!token.refreshToken) {
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
          // JSON olmayan gövde (5xx sayfası vb.) → geçici hata olarak say.
          data = {};
        }

        const errorType = data.error as string | undefined;
        if (!res.ok || !data.access_token) {
          const label =
            data.error_description ?? errorType ?? "Token refresh başarısız";
          // Kalıcı hata: refresh token geçersiz/rotasyon kırılmış, client
          // config yanlışı veya erişim reddi → token'ları temizle, kullanıcı
          // doğal olarak yeniden giriş yapar.
          const fatal =
            res.status === 400 &&
            (errorType === "invalid_grant" ||
              errorType === "invalid_client" ||
              errorType === "unauthorized_client");
          if (fatal) {
            console.error(
              `[auth] kalıcı refresh hatası (${provider}): ${label} — token'lar temizlendi`,
            );
            delete token.accessToken;
            delete token.refreshToken;
            delete token.expiresAt;
            return token;
          }
          // Geçici hata (429/5xx, ağ hatası, JSON olmayan yanıt): token'a
          // dokunma; bir sonraki istekte tekrar denenebilir. Spam koruması:
          // yalnız logla, throw ETME.
          console.error(
            `[auth] geçici refresh hatası (${provider}): HTTP ${res.status} — ${label}`,
          );
          return token;
        }

        token.accessToken = data.access_token;
        token.expiresAt = (data.expires_in ?? 3600) * 1000 + Date.now();
        // Keycloak gibi refresh token'ı döndüren (rotasyon) provider'larda güncelle.
        if (data.refresh_token) token.refreshToken = data.refresh_token;
        // Yenilenen access token ile roller tazelenir (rol değişimi
        // tekrar giriş gerektirmez — en geç 5 dakikada yansır).
        if (provider === "keycloak") token.roles = realmRolesFromAccessToken(data.access_token);
      } catch (error) {
        // Ağ hatası / beklenmeyen istisna → token'a dokunma, sonraki
        // istekte tekrar dene; tek satır log, spam üretme.
        console.error(`[auth] refresh isteği istisna (${provider}):`, error);
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
          companies?: Company[];
          activeCompanyId?: string | null;
          phone?: string | null;
        };
        user.accessToken = token.accessToken as string | undefined;
        user.provider = token.provider as string | undefined;
        user.roles = Array.isArray(token.roles)
          ? (token.roles as unknown[]).filter((r): r is string => typeof r === "string")
          : [];
        // Tenant property'leri: yetkili şirketler + aktif şirket session'a
        // taşınır — istemci bunları KAYNAK olarak kullanır, kendi
        // localStorage'undaki değerleri değil.
        user.companies = Array.isArray(token.companies)
          ? (token.companies as Company[])
          : [];
        user.activeCompanyId =
          typeof token.activeCompanyId === "string" ? (token.activeCompanyId as string) : null;
        // SMS OTP: telefon numarası (E.164) session'a taşınır (bkz. 1c).
        // Token tipinin index signature'ı session callback'te tüm
        // custom alanları kapsamadığından cast ile okunur.
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
});
