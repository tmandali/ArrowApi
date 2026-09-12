/**
 * Route koruma middleware'i (proxy.ts'nin yerini alır).
 *
 * PROTECTED_ROUTES listesindeki yollar için oturum kontrolü yapar;
 * yetkisiz istekleri /sign-in?next=<pathname> adresine yönlendirir.
 *
 * Next.js 15+ Standart: dosya adı middleware.ts (src kökünde).
 */
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Korumalı rotalar — regex desenleri.
 * Boş bırakılırsa tüm rotalar açık kalır.
 */
const PROTECTED_ROUTES: string[] = [
  "^/(stock|selling|accounting|manufacturing|subcontracting|system)/.*$",
  "^/user-settings.*$",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_ROUTES.some((pattern) =>
    new RegExp(pattern).test(pathname),
  );
}

export async function middleware(request: NextRequest) {
  const session = await auth();
  const isAuth = !!session?.user;

  if (isProtected(request.nextUrl.pathname) && !isAuth) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|static|.*\\..*|api/auth).*^)"],
};
