import { desc, eq } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/server/db/client";
import { appUsersSchema, userIdentitiesSchema } from "@/server/db/schema";
import { SystemUserAuthorizeValidation } from "@/validations/settings.validation";
import { assertSessionAdmin } from "@/features/auth/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Login kimlikleri (`user_identities`) — admin "guest picker" ucu.
 *
 * Katmanlı kimlik modeli: kimlik satırları her provider login'inde
 * otomatik açılır; yetkilendirme YALNIZCA bu uç üzerinden yapılır.
 *
 * - `GET /api/system/identities` → tüm kimlikler (+ katalog linki varsa
 *   ona ait role/status). `?unlinked=1` → yalnız guest (`user_id NULL`).
 * - `POST /api/system/identities` → YETKİLENDİRME: seçilen guest
 *   kimliğe katalog (app_users) satırı açılır ve kimliğin `user_id`
 *   linki YAZILIR — tek transaction (yarım link imkânsız).
 *
 * İki uç da YALNIZCA YÖNETİCİ (assertSessionAdmin: DB katalog rolü
 * veya realm `app-admin` bootstrap).
 */

type IdentityRow = {
  id: string;
  provider: string | null;
  providerId: string | null;
  name: string | null;
  email: string | null;
  language: string | null;
  lastActive: string | null;
  createdAt: Date | null;
  userId: string | null;
  catalogRole: string | null;
  catalogStatus: string | null;
};

export async function GET(req: Request) {
  const gate = await assertSessionAdmin();
  if (!gate.ok) {
    return Response.json(
      { error: `Yetki gerektirir (neden: ${gate.reason}).` },
      { status: 403 },
    );
  }

  const unlinkedOnly =
    new URL(req.url).searchParams.get("unlinked") === "1";

  try {
    const rows = await db
      .select({
        id: userIdentitiesSchema.id,
        provider: userIdentitiesSchema.provider,
        providerId: userIdentitiesSchema.providerId,
        name: userIdentitiesSchema.name,
        email: userIdentitiesSchema.email,
        language: userIdentitiesSchema.language,
        lastActive: userIdentitiesSchema.lastActive,
        createdAt: userIdentitiesSchema.createdAt,
        userId: userIdentitiesSchema.userId,
        catalogRole: appUsersSchema.role,
        catalogStatus: appUsersSchema.status,
      })
      .from(userIdentitiesSchema)
      .leftJoin(appUsersSchema, eq(userIdentitiesSchema.userId, appUsersSchema.id))
      .orderBy(desc(userIdentitiesSchema.createdAt));

    const identities: IdentityRow[] = unlinkedOnly
      ? rows.filter((r) => r.userId === null)
      : rows;
    return Response.json({ identities });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/**
 * Yetkilendirme: guest kimlik → katalog satırı + link (transaction).
 * `name`/`email` boşsa kimlikten gelir; rol boşsa `Viewer`, durum boşsa
 * `Active`. Zaten linkli kimlik → 409 (katalog sekmesinden düzenle).
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

  const parse = SystemUserAuthorizeValidation.safeParse(json);
  if (!parse.success) {
    return Response.json(z.treeifyError(parse.error), { status: 422 });
  }
  const v = parse.data;

  try {
    const result = await db.transaction(async (tx) => {
      // 1) Kimlik satırı olsun.
      const [identity] = await tx
        .select()
        .from(userIdentitiesSchema)
        .where(eq(userIdentitiesSchema.id, v.identityId))
        .limit(1);
      if (!identity) {
        return { code: "not-found" as const };
      }
      // 2) Zaten linkli → bu uçtan tekrar yetkilendirilmez.
      if (identity.userId) {
        return { code: "already-linked" as const, userId: identity.userId };
      }

      // 3) Katalog satırı aç + kimliği linkle (tek transaction).
      const newUserId = `usr_${crypto.randomUUID()}`;
      const catalogRow = await tx
        .insert(appUsersSchema)
        .values({
          id: newUserId,
          provider: identity.provider,
          providerId: identity.providerId,
          name: v.name ?? identity.name ?? null,
          email: v.email ?? identity.email ?? null,
          role: v.role ?? "Viewer",
          status: v.status ?? "Active",
          lastActive: "Now",
        })
        .returning();
      const [updatedIdentity] = await tx
        .update(userIdentitiesSchema)
        .set({ userId: newUserId, lastActive: "Now" })
        .where(eq(userIdentitiesSchema.id, v.identityId))
        .returning();

      return {
        code: "ok" as const,
        user: catalogRow[0] ?? null,
        identity: updatedIdentity ?? identity,
      };
    });

    if (result.code === "not-found") {
      return Response.json({ error: "Kimlik bulunamadı." }, { status: 404 });
    }
    if (result.code === "already-linked") {
      return Response.json(
        {
          error: "Bu kimlik zaten yetkilendirildi — katalog sekmesinden düzenleyin.",
          userId: result.userId,
        },
        { status: 409 },
      );
    }
    return Response.json({ ok: true, user: result.user, identity: result.identity });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
