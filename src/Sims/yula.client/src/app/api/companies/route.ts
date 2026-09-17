import { NextResponse } from "next/server";
import { auth, type Session } from "@/lib/auth";
import { getAuthorizedCompanies } from "@/lib/company-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kullanıcının yetkili şirketleri.
 *
 * ŞİMDİLİK Next server tarafında yaşar: `getAuthorizedCompanies` statik
 * kataloğu döner (bkz. lib/company-catalog.ts). Sims.Server ucu kurulunca
 * YALNIZCA katalog modülü değişir (Bearer + sub bazlı yetki filtresi
 * backend'den çekilir) — bu route, jwt callback'i ve istemci katmanı
 * sözleşmeye bağlıdır, değişmez.
 */
export async function GET() {
  const session = (await auth()) as Session | null;
  const user = session?.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let companies;
  try {
    companies = await getAuthorizedCompanies({
      sub: user.id,
      accessToken: user.accessToken,
    });
  } catch (error) {
    console.error("[api/companies] katalog erişilemedi:", error);
    return NextResponse.json({ error: "catalog_unavailable" }, { status: 502 });
  }

  return NextResponse.json({ companies });
}
