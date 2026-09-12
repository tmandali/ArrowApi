import { and, eq, inArray, ne } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/server/db/client";
import {
  identityAliasesSchema,
  userIdentitiesSchema,
  userSettingsSchema,
} from "@/server/db/schema";
import { SystemUserMergeValidation } from "@/validations/settings.validation";
import { assertSessionAdmin } from "@/features/auth/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cross-provider BİRLEŞTİRME — admin eylemi (YALNIZCA YÖNETİCİ).
 *
 * Aynı kişi hem Keycloak'tan hem Google'dan giriyorsa iki ayrı
 * `user_identities` satırı açılır. Bu uç onları TEK ana kimliğe
 * toplar (`ownerId`):
 *
 * 1. `user_settings` satırı ana kimliğe taşınır (ayarlar kaybolmaz).
 * 2. Katalog linki: hedefte link var, sahibinde yoksa link ana
 *    kimliğe taşınır; her ikisinde FARKLI link varsa 409
 *    (admin, çakışan rol kayıtlarını elle çözmeli).
 * 3. `identity_aliases`'a hedefin login çifti yazılır → hedefin
 *    oturumları artık ana kimliğe yönlenir (alias-aware resolver).
 * 4. Hedef `(provider, provider_id)` ÇİFTİYLE SİLİNİR (login çözümlemesi
 *    artık alias üzerinden). Çift ile silme, merge sırasında eşzamanlı
 *    login'den re-insert olmuş satırı da temizler (yarış kalkanı).
 *
 * Tek transaction — kısmi birleşme mümkün değil.
 *
 * Gövde: `{ ownerId, targetIdentityId }` — `ownerId` = HAYATTA KALAN
 * ana kimlik, `targetIdentityId` = silinecek ve alias'a dönecek kimlik.
 * Hedef provider'sızsa (login çifti yok) birleştirilemez → 400.
 */
export async function POST(req: Request) {
  const gate = await assertSessionAdmin();
  if (!gate.ok) {
    return Response.json(
      { error: `Yetki gerektirir (neden: ${gate.reason}).` },
      { status: 403 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parse = SystemUserMergeValidation.safeParse(json);
  if (!parse.success) {
    return Response.json(z.treeifyError(parse.error), { status: 422 });
  }
  const { ownerId, targetIdentityId } = parse.data;

  if (ownerId === targetIdentityId) {
    return Response.json(
      { error: "Bir kimlik kendisiyle birleştirilemez." },
      { status: 400 },
    );
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [owner] = await tx
        .select()
        .from(userIdentitiesSchema)
        .where(eq(userIdentitiesSchema.id, ownerId))
        .limit(1);
      const [target] = await tx
        .select()
        .from(userIdentitiesSchema)
        .where(eq(userIdentitiesSchema.id, targetIdentityId))
        .limit(1);
      if (!owner || !target) {
        return { code: "not-found" as const };
      }
      // Hedefin login çifti yoksa (provider'sız legacy satır) alias
      // açılamaz — login çözümü hiçbir zaman ona varmaz zaten.
      if (!target.provider || !target.providerId) {
        return { code: "no-provider" as const };
      }
      // İki FARKLI katalog linki çakışamaz — admin el çözümlenmeli.
      if (target.userId && owner.userId && target.userId !== owner.userId) {
        return { code: "link-conflict" as const };
      }
      // Login çifti zaten başka bir ana kimliğin alias'ı ise çakışma
      // (unique constraint'ten önce okunabilir hata — transaction geri sarılır).
      const [existingAlias] = await tx
        .select({ ownerId: identityAliasesSchema.ownerId })
        .from(identityAliasesSchema)
        .where(
          and(
            eq(identityAliasesSchema.provider, target.provider),
            eq(identityAliasesSchema.providerId, target.providerId),
          ),
        )
        .limit(1);
      if (existingAlias && existingAlias.ownerId !== ownerId) {
        return { code: "alias-conflict" as const };
      }

      // 1) Ayarlar ana kimliğe taşınır.
      const movedSettings = await tx
        .update(userSettingsSchema)
        .set({ userId: ownerId })
        .where(eq(userSettingsSchema.userId, targetIdentityId))
        .returning();

      // 2) Katalog linki: hedefte var, sahibinde yoksa ana kimliğe taşın.
      if (target.userId && !owner.userId) {
        await tx
          .update(userIdentitiesSchema)
          .set({ userId: target.userId })
          .where(eq(userIdentitiesSchema.id, ownerId));
      }

      // 3) Alias aç (login çifti → ana kimlik).
      await tx.insert(identityAliasesSchema).values({
        id: crypto.randomUUID(),
        ownerId,
        provider: target.provider,
        providerId: target.providerId,
      });

      // 4) Hedefi (provider, provider_id) ÇİFTİYLE sil — id ile değil.
      //    Neden: merge commit'inden önce eşzamanlı bir login upsert'i
      //    "çift yeni" sanıp re-insert etmiş olabilir (alias henüz commit'te
      //    değildi). Çift ile silme, o re-insert satırı da temizler — login
      //    çözümlemesi alias'tan sahibe gider, çift satıra düşmez.
      //    FK no-action → ayar satırları ÖNCE düşürülür: hedefin ayarları 1)'de
      //    taşındı; re-insert'e seed edilmiş mükerrer ayar satırı da (owner'ın
      //   kini gölgelediği için) kaldırılır.
      const pairRows = await tx
        .select({ id: userIdentitiesSchema.id })
        .from(userIdentitiesSchema)
        .where(
          and(
            eq(userIdentitiesSchema.provider, target.provider),
            eq(userIdentitiesSchema.providerId, target.providerId),
            ne(userIdentitiesSchema.id, ownerId),
          ),
        );
      const pairIds = pairRows.map((r) => r.id);
      if (pairIds.length) {
        await tx
          .delete(userSettingsSchema)
          .where(inArray(userSettingsSchema.userId, pairIds));
        await tx
          .delete(userIdentitiesSchema)
          .where(inArray(userIdentitiesSchema.id, pairIds));
      }

      return { code: "ok" as const, movedSettings: movedSettings.length };
    });

    if (result.code === "not-found") {
      return Response.json({ error: "Kimlik bulunamadı." }, { status: 404 });
    }
    if (result.code === "no-provider") {
      return Response.json(
        { error: "Provider'sız kimlik birleştirilemez (login çifti yok)." },
        { status: 400 },
      );
    }
    if (result.code === "link-conflict") {
      return Response.json(
        {
          error:
            "İki kimliğin FARKLI yönetici kataloğu kayıtları var — önce rolleri tek kataloğa taşıyın.",
        },
        { status: 409 },
      );
    }
    if (result.code === "alias-conflict") {
      return Response.json(
        { error: "Bu login çifti zaten başka bir ana kimliğe alias." },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, movedSettings: result.movedSettings });
  } catch (error) {
    // Yarış durumu: unique(provider, provider_id) constraint'i DB seviyesinde
    // son kalkan — transaction geri sarılır, okunabilir hata verilir.
    const msg = error instanceof Error ? error.message : String(error);
    if (msg.includes("identity_aliases_provider_key")) {
      return Response.json(
        { error: "Bu login çifti zaten başka bir kimliğe alias." },
        { status: 409 },
      );
    }
    return Response.json({ error: msg }, { status: 500 });
  }
}
