import { NextResponse } from "next/server";
import { auth, type Session } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Provider'ın userinfo endpoint'inden TAZE profil bilgisini çeken proxy.
 *
 * Google:  https://openidconnect.googleapis.com/v1/userinfo
 * Keycloak: {KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo
 *
 * Neden proxy: session'daki accessToken sunucu tarafında kalır — istemci
 * (settings sayfasındaki "Yeniden getir" butonu) doğrudan provider'a değil,
 * bu route'a çağrı yapar.
 *
 * Davranış notları:
 * - `auth()` çağrısı jwt callback'i tetikler; refresh token varsa access
 *   token arka planda tazelenir, bu istek en güncel token'la gider.
 * - Resimsiz hesaplarda Google `picture` claim'ini VERMEZ (varsayılan
 *   avatar adresi de yok) → `picture: null` dürüst sonuçtur, hata değildir.
 * - Access token yok/ömrü düşmüşse ve refresh mümkün değilse
 *   (eski One Tap sessionları / ID token ömrü dolmuşsa) `no_access_token`
 *   (409) döner — yeniden giriş gerekir.
 */
export async function GET() {
  const session = (await auth()) as Session | null;
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accessToken = user.accessToken;
  if (!accessToken) {
    // Diagnostik: hangi senaryoda token boş kalır:
    //  - eski session (token taşımaya geçilmeden önce giriş yapılmış),
    //  - One Tap: ID token ömrü (~1 saat) doldu → jwt callback token'ı
    //    sildi → yeniden giriş gerekli.
    console.warn(
      `[auth/userinfo] access token yok (provider=${user.provider ?? "?"}, userId=${user.id.slice(0, 8)}…) — yeniden giriş gerekli`,
    );
    return NextResponse.json(
      { error: "no_access_token", provider: user.provider ?? null },
      { status: 409 },
    );
  }

  let url: string;
  // "google-onesig": eski session cookie'si — NextAuth'un credentials
  // provider damgası. provider alanı varsa Google'a sorulabilir.
  const provider = user.provider === "google-onesig" ? "google" : user.provider;

  // Google One Tap session'ı: refresh token YOKTUR (OAuth grant yapılmaz,
  // GIS yalnız ID token üretir). Bu session'larda accessToken ASLINDA ID
  // token'ın kendisidir — Google'ın userinfo endpoint'i onu Bearer olarak
  // REDDEDER (401 invalid_request — canlıda doğrulandı). ID token zaten
  // name/email/picture claim'lerini taşıdığından, session'daki değerler
  // (= giriş anındaki durum) "son senkronizasyon" olarak döner. Sonraki
  // girişe kadar Google'daki profil değişikliği yansımaz.
  // (Klasik redirect'li Google OAuth session'larında refresh token vardır;
  // onlar için gerçek userinfo çağrısına devam edilir.)
  if (provider === "google" && !user.refreshToken) {
    return NextResponse.json({
      provider: "google",
      name: user.name ?? null,
      email: user.email ?? null,
      picture: user.image ?? null,
      fetchedAt: new Date().toISOString(),
      source: "session-claims",
    });
  }
  switch (provider) {
    case "google":
      // Klasik redirect'li Google OAuth (refresh token'lu) — gerçek
      // access token'la çalışır. (One Tap session'ları yukarıda
      // session-claims olarak dönüştü.)
      url = "https://openidconnect.googleapis.com/v1/userinfo";
      break;
    case "keycloak": {
      const issuer = process.env.KEYCLOAK_ISSUER;
      if (!issuer) {
        return NextResponse.json({ error: "misconfigured" }, { status: 500 });
      }
      url = `${issuer.replace(/\/+$/, "")}/protocol/openid-connect/userinfo`;
      break;
    }
    default:
      return NextResponse.json({ error: "unsupported_provider" }, { status: 400 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
  } catch {
    // Ağ hatası (sağlayıcıya ulaşılamadı) — token'a dokunma, istemci dener.
    return NextResponse.json({ error: "network" }, { status: 502 });
  }

  if (!upstream.ok) {
    // 401/400: token geçersiz/düşmüş → istemci bunu "yeniden giriş"
    // mesajıyla yorumlar.
    console.error(
      "[userinfo] upstream reddetti: HTTP", upstream.status,
      (await upstream.text()).slice(0, 300),
    );
    return NextResponse.json(
      { error: "userinfo_failed", status: upstream.status },
      { status: 502 },
    );
  }

  const data = (await upstream.json()) as {
    name?: string | null;
    email?: string | null;
    picture?: string | null;
  };

  return NextResponse.json({
    provider: user.provider ?? null,
    name: data.name ?? null,
    email: data.email ?? null,
    picture: data.picture ?? null,
    fetchedAt: new Date().toISOString(),
  });
}
