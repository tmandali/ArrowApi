import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Route koruma iskeleti (örnek projeden uyarlandı, Clerk'sız).
 *
 * Şu an PASİF: tüm isteklere `next()` döner, mevcut ekranlara dokunmaz.
 * Oturum geldiğinde (.NET auth / local session):
 *  1. `PROTECTED_ROUTES`'u doldurun,
 *  2. aşağıdaki `checkSession` gövdesini session okuyacak şekilde yazın,
 *  3. yetkisizleri `/login`'e yönlendirin.
 *
 * Dosya konvansiyonu Next 16: `src/proxy.ts` (eski adıyla middleware).
 * Tek proxy dosyası desteklenir; parça mantıklar modüllere bölünüp
 * buradan çağrılır.
 */

const PROTECTED_ROUTES: string[] = [
  // Örn: "/system(.*)",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_ROUTES.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function checkSession(_request: NextRequest): boolean {
  // TODO: session buradan okunacak (cookie/header).
  // Şimdilik herkes açık — koruma kapalı.
  return true;
}

export function proxy(request: NextRequest) {
  if (isProtected(request.nextUrl.pathname) && !checkSession(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Örnek projeyle aynı dışlama mantığı: _next, api, statik dosyalar proxy'e girmez.
  matcher: "/((?!_next|api|.*\\..*).*)",
};
