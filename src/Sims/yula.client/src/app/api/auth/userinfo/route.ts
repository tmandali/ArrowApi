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
 * - One Tap oturumunda refresh token olmadığı için token'ı düşmüşse
 *   `no_access_token` (409) döner — yeniden giriş gerekir.
 */
export async function GET() {
  const session = (await auth()) as Session | null;
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const accessToken = user.accessToken;
  if (!accessToken) {
    return NextResponse.json(
      { error: "no_access_token", provider: user.provider ?? null },
      { status: 409 },
    );
  }

  let url: string;
  switch (user.provider) {
    case "google":
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
