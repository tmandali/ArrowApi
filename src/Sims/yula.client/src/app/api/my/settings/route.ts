import { eq } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/server/db/client";
import { userSettingsSchema, appUsersSchema } from "@/server/db/schema";
import { SettingsPutValidation } from "@/validations/settings.validation";
import { resolveSessionUserId } from "@/features/auth/lib/app-user-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** UI her zaman `local` gönderir; oturum varsa login kullanıcının DB id'si,
    oturum yoksa tek kullanıcı fallback `usr_101`. */
const USER_ID_LOCAL = "local";

/** `local` → session kullanıcısı (saf resolver, upsert YOK) veya `usr_101`.
    app_users upsert'i artık yalnız ensure-user akışında tetiklenir. */

/** Tek kullanıcı ayarı (varsayılan `local`). UI fallback için her zaman 200 döner. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clientUserId = url.searchParams.get("userId") || USER_ID_LOCAL;
    // UI'nin `local` gönderdiği yerde: oturum varsa login kullanıcı,
    // yoksa usr_101. Açıkça başka userId verilirse o id geçer (admin ekranı).
    const userId =
      clientUserId === USER_ID_LOCAL ? await resolveSessionUserId() : clientUserId;

    const [settingsRow] = await db
      .select()
      .from(userSettingsSchema)
      .where(eq(userSettingsSchema.userId, userId))
      .limit(1);

    const [userRow] = await db
      .select()
      .from(appUsersSchema)
      .where(eq(appUsersSchema.id, userId))
      .limit(1);

    // App user'dan ad/e-posta, settings'den config — kesişim yok, birleştirilmiş snapshot.
    const settings = settingsRow ?? null;
    const user = userRow ?? null;

    return Response.json({
      settings: settings
        ? {
            ...settings,
            // UI'nin beklediği alanlar app_users'tan gelir.
            fullName: user?.name ?? null,
            email: user?.email ?? null,
          }
        : null,
    });
  } catch (error) {
    return Response.json(
      { settings: null, error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/**
 * Boilerplate `app/api/counter/route.ts` PUT deseni:
 * `safeParse` → 422 + `treeifyError`, upsert + `returning()`.
 */
export async function PUT(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parse = SettingsPutValidation.safeParse(json);
  if (!parse.success) {
    return Response.json(z.treeifyError(parse.error), { status: 422 });
  }

  const v = parse.data;
  // `google` provider'ı bizim AI çekirdekte yok — yazarken `openai`-uyumlu saklanır.
  const aiProvider = v.aiProvider === "google" ? null : v.aiProvider;
  // UI `local` gönderir → session kullanıcı (saf çözüm), yoksa `usr_101`.
  const resolvedUserId =
    (v.userId ?? USER_ID_LOCAL) === USER_ID_LOCAL
      ? await resolveSessionUserId()
      : v.userId!;

  try {
    const rows = await db
      .insert(userSettingsSchema)
      .values({
        userId: resolvedUserId,
        language: v.language ?? null,
        timeZone: v.timeZone ?? null,
        aiProvider,
        aiModel: v.aiModel ?? null,
        aiEndpoint: v.aiEndpoint || null,
        thinkingLevel: v.thinkingLevel ?? null,
        systemFacts: v.systemFacts ?? {},
      })
      .onConflictDoUpdate({
        target: userSettingsSchema.userId,
        set: {
          language: v.language ?? null,
          timeZone: v.timeZone ?? null,
          aiProvider,
          aiModel: v.aiModel ?? null,
          aiEndpoint: v.aiEndpoint || null,
          thinkingLevel: v.thinkingLevel ?? null,
          systemFacts: v.systemFacts ?? {},
        },
      })
      .returning();

    return Response.json({ settings: rows[0] ?? null });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
