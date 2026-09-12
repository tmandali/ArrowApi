import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Route koruma iskeleti (middleware.ts ile birleştirildi — artık pasif).
 *
 * middleware.ts aktif korumayı yapıyor; bu dosya geriye dönük referans
 * olarak tutuluyor. Yeni projelerde middleware.ts kullanın.
 *
 * @deprecated Use middleware.ts instead.
 */
export function proxy(request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: "/((?!_next|api|.*\\..*).*)",
};
