import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decode, encode } from "next-auth/jwt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 gün (Auth.js varsayılanı)

/**
 * Aktif şirketi session'a yazan uç — "company bilgisi session property'si"
 * modelinin sunucu tarafı.
 *
 * İstemci optimistik olarak store'u günceller, sonra buraya POST'lar.
 * Bu route:
 *  1. Mevcut Auth.js session cookie'sini bulur (ad = *.session-token,
 *     v5 varsayılanı `authjs.session-token`; https'te `__Secure-` ön ekli).
 *  2. Yetki kontrolü: şirket, session JWT'sindeki `companies` listesinde
 *     olmalı (listesi BOŞSA — eski, company property'si eklenmeden
 *     imzalanmış JWT'lerde — geçiş serbest bırakılır; yeni girişler
 *     katalog listesini taşır).
 *  3. JWT'yi `activeCompanyId` ile yeniden imzalar (aynı cookie adı/salt,
 *     aynı secret) → sonraki `/api/auth/session` okuması yeni değeri döner.
 *
 * İstemcinin localStorage'undaki "aktif şirket" bundan böyle yalnızca
 * bir cache'tir; doğruluk kaynağı bu cookie'dir.
 */

async function findSessionCookie() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const store = await cookies();
  const candidates = store
    .getAll()
    .filter((c) => c.name.endsWith(".session-token") && c.value.length > 0);
  for (const cookie of candidates) {
    const token = await decode({ secret, token: cookie.value, salt: cookie.name });
    if (token?.sub) {
      return { name: cookie.name, token, secret };
    }
  }
  return null;
}

export async function POST(req: Request) {
  let body: { companyId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const companyId = typeof body.companyId === "string" ? body.companyId.trim() : "";
  if (!companyId) {
    return NextResponse.json({ error: "missing_company_id" }, { status: 400 });
  }

  const found = await findSessionCookie();
  if (!found) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const companies: { id: string }[] = Array.isArray(found.token.companies)
    ? (found.token.companies as { id: string }[])
    : [];
  // Liste doluysa yetkilendirme sıkı; boşsa (eski/imzasız şirket
  // property'si olmayan JWT) serbest — yeni girişlerde liste kataloğdan
  // dolu gelir.
  const allowed =
    companies.length === 0 || companies.some((c) => c.id === companyId);
  if (!allowed) {
    return NextResponse.json({ error: "company_not_allowed" }, { status: 403 });
  }

  found.token.activeCompanyId = companyId;
  const reissued = await encode({
    secret: found.secret,
    token: found.token,
    salt: found.name,
  });

  const store = await cookies();
  store.set(found.name, reissued, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return NextResponse.json({ ok: true, activeCompanyId: companyId });
}
