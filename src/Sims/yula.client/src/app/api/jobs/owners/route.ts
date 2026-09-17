import { and, inArray } from "drizzle-orm";
import { db } from "@/server/db/client";
import { userIdentitiesSchema } from "@/server/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/jobs/owners?ids=a,b,c`
 *
 * OIDC `sub` claim (providerId) setini `user_identities`'ten
 * name/email çözer. Detay panelinde "kim başlattı?" bilgisini
 * doldurmak için kullanılır.
 *
 * - Bilinmeyen / guest sub'lar yanıtta yer almaz (null value).
 * - `user_identities` satırı henüz açılmamış (ilk giriş) sub'larda
 *   isim yoksa `sub`'nun ilk 8 hanesi fallback gösterilir (client tarafında).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const raw = url.searchParams.get("ids") ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (ids.length === 0) {
    return Response.json({ owners: {} });
  }

  try {
    // sub = providerId; provider hem keycloak hem google olabilir →
    // her iki provider'da da eşleşen satırı dene (alias-aware olmayan basit lookup).
    const rows = await db
      .select({
        providerId: userIdentitiesSchema.providerId,
        name: userIdentitiesSchema.name,
        email: userIdentitiesSchema.email,
      })
      .from(userIdentitiesSchema)
      .where(inArray(userIdentitiesSchema.providerId, ids))
      .limit(ids.length * 2); // aynı sub iki provider'da olabilir

    const owners: Record<string, { name: string | null; email: string | null }> = {};
    for (const row of rows) {
      if (row.providerId && !owners[row.providerId]) {
        owners[row.providerId] = {
          name: row.name ?? null,
          email: row.email ?? null,
        };
      }
    }

    return Response.json({ owners });
  } catch (error) {
    console.error("[jobs/owners] sorgu hatası:", error);
    return Response.json({ owners: {} });
  }
}
