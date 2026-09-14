/**
 * Route koruma proxy'si (Next.js 16: proxy.ts).
 *
 * Kamuoyuna açık sayfalar (sign-in, auth API, statik varlıklar) HARİÇ
 * tüm uygulama rotalarını (ana sayfa + mevcut & gelecekteki tüm workspace'ler)
 * otomatik olarak korur; oturumu olmayan istekleri /sign-in?next=<pathname>
 * adresine yönlendirir.
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  const session = await auth();
  const isAuth = !!session?.user;

  if (!isAuth) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Aşağıdaki açık/statik yollar HARİÇ tüm rotaları otomatik korur:
     * - _next/static (derlenmiş statik dosyalar)
     * - _next/image (görsel optimizasyonları)
     * - favicon.ico, icon.png, apple-icon.png, icon.svg (medya & ikonlar)
     * - sign-in, sign-up, forgot-password, login (giriş & şifre sayfaları)
     * - api/auth (NextAuth OIDC / OAuth API uç noktaları)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|icon\\.png|apple-icon\\.png|icon\\.svg|sign-in|sign-up|forgot-password|login|api/auth).*)",
  ],
};
