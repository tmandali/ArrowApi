import { NextResponse } from "next/server";
import { auth, type Session } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB — avatar için fazlasıyla

type ProviderUser = {
  provider?: string;
  accessToken?: string;
  image?: string | null;
};

/**
 * Provider'ın userinfo endpoint'inden TAZE resim URL'i (tutarlılık için
 * /api/auth/userinfo mantığının aynası — resim alanı tek başına döner).
 *
 * - google (klâsik OAuth): https://openidconnect.googleapis.com/v1/userinfo
 * - keycloak: {KEYCLOAK_ISSUER}/protocol/openid-connect/userinfo
 * - google-onesig / token'sız: null — resim session claim'inden gelir
 *   (One Tap ID token'ında picture claim'i YOKSA /api/avatar da 404 döner;
 *   UI baş harfler fallback'i gösterir, bu doğru davranıştır).
 */
async function fetchProviderPicture(user: ProviderUser): Promise<string | null> {
  if (!user.accessToken) return null;

  let url: string | null = null;
  if (user.provider === "google") {
    url = "https://openidconnect.googleapis.com/v1/userinfo";
  } else if (user.provider === "keycloak") {
    const issuer = process.env.KEYCLOAK_ISSUER;
    if (!issuer) return null;
    url = `${issuer.replace(/\/+$/, "")}/protocol/openid-connect/userinfo`;
  } else {
    return null;
  }

  const res = await fetch(url!, {
    headers: { Authorization: `Bearer ${user.accessToken}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { picture?: unknown };
  return typeof data.picture === "string" && data.picture.length > 0
    ? data.picture
    : null;
}

/**
 * Aktif kullanıcının avatarını sunucu tarafında çözüp stream eder.
 *
 * Neden: istemciye localStorage'daki HAM provider URL'i (ör.
 * lh3.googleusercontent.com) yükletmek kırılgan — URL'ler süre/dönüyor,
 * 3. parti engelleri (CSP, hotlink koruması, Tauri WebView sınırlamaları)
 * resimi baş harfler fallback'ine düşürüyordu. Proxy: session'ı doğrular,
 * resim URL'ini provider userinfo'dan TAZE çözer (eski kayda güvenmez)
 * ve byte'ları same-origin stream eder.
 *
 * 404: oturum yok / resim yok — UI'daki baş harfler kartı zaten bu hâli
 * temsil eder; hata değildir. 404 yanıtları kısa `max-age` ile
 * cache'lenebilir: istemci mount'ları (sayfa geçişi, StrictMode, F5)
 * tarayıcı önbelleğine çarpıp log'da 404 fırtınası yaratmaz.
 * (İstemcinin tek-fetch dedup'u `cache: "no-store"` ile bu cache'i
 * bypass eder; "Yeniden getir" sonrası invalidasyonla taze dener.)
 */
const NO_PICTURE_CACHE = "public, max-age=60";

export async function GET() {
  const session = (await auth()) as Session | null;
  const user = session?.user;
  if (!user) {
    // Oturum YOKKEN cache'lenmez: kullanıcı giriş yapınca resim
    // anında çözülmeli (no-store ile her deneme taze).
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  let picture: string | null = null;
  try {
    picture = await fetchProviderPicture(user as ProviderUser);
  } catch {
    picture = null; // geçici ağ hatası → session claim fallback'i dener.
  }
  if (!picture) picture = user.image ?? null;
  if (!picture) {
    // Oturum var ama resim YOK: 60 sn cache'le → mount fırtınasında
    // tek istek, log'da tek 404 satırı; taze denemeler (istemci
    // dedup'u / invalidasyon) bu cache'i bypass ederek üzerine yazar.
    return NextResponse.json(
      { error: "no_picture" },
      { status: 404, headers: { "Cache-Control": NO_PICTURE_CACHE } },
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(picture, {
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { "User-Agent": "yula-client/1.0" },
    });
  } catch (error) {
    console.error("[avatar] resim çekilemedi:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "picture_unreachable" }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "upstream_error" }, { status: 502 });
  }

  const bytes = Buffer.from(await upstream.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_AVATAR_BYTES) {
    return NextResponse.json({ error: "picture_too_large" }, { status: 502 });
  }

  // no-store: "Yeniden getir" sonrası profil resmi değişse bile rozet
  // ilk mount'ta taze resmi görür (tutarlılık > tek ek istek).
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
      "Content-Length": String(bytes.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
