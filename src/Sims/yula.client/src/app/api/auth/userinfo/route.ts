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
  // "google-onesig": One Tap (GIS) session'ının provider damgası (bkz.
  // auth.ts jwt callback 1b). Bu session'larda accessToken ASLINDA ID
  // token'ıdır; Google'ın userinfo endpoint'i onu Bearer olarak REDDER
  // (401 invalid_request — canlıda doğrulandı). ID token zaten
  // name/email/picture claim'lerini taşıdığından, session'daki değerler
  // (= giriş anındaki durum) "son senkronizasyon" olarak döner; sonraki
  // girişe kadar Google'daki profil değişikliği yansımaz. Klâsik Google
  // OAuth session'ları provider "google" damgasıyla aşağıdaki switch'e
  // düşer — gerçek access token'la userinfo çağrılır.
  if (user.provider === "google-onesig") {
    return NextResponse.json({
      provider: "google-onesig",
      name: user.name ?? null,
      email: user.email ?? null,
      picture: user.image ?? null,
      fetchedAt: new Date().toISOString(),
      source: "session-claims",
    });
  }
  switch (user.provider) {
    case "google":
      // Klâsik redirect'li Google OAuth — gerçek access token'la
      // çalışır (refresh token varsayılmaz; ömrü dolmuş token 409'a
      // döner, One Tap'teki gibi değil — gerçek token süresi ~1 saat).
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
