import { eq } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/server/db/client";
import { userSettingsSchema, userIdentitiesSchema } from "@/server/db/schema";
import { SettingsPutValidation } from "@/validations/settings.validation";
import { resolveSessionDbUserId, resolveSessionUserId } from "@/features/auth/lib/app-user-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** UI her zaman `local` gönderir; oturum varsa login kullanıcının identity GUID'i,
    oturum yoksa null (tek kullanıcı fallback'i kaldırıldı). */
const USER_ID_LOCAL = "local";

/** Kullanıcı ayarları (varsayılan `local`). UI fallback için her zaman 200 döner.
    Oturum yok → boş yanıt (settings/user null) — başka kullanıcının satırına
    düşülmez. Dil cookie senkronu artık `i18n.ts`/`locale-sync.ts` katmanında
    (her sayfa yüklemesinde) — bu route yalnız ayarları okur. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const clientUserId = url.searchParams.get("userId") || USER_ID_LOCAL;
    // UI'nin `local` gönderdiği yerde: oturum varsa login kullanıcı,
    // yoksa null (başka birinin satırına okuma yapılmaz).
    // Açıkça başka userId verilirse o id geçer (admin ekranı).
    // GET salt okuma → saf resolver (upsert tetiklemez); satır henüz yoksa
    // (ensure-user ilk tam yüklemeye kadar) boş yanıt döner.
    const userId =
      clientUserId === USER_ID_LOCAL
        ? await resolveSessionUserId()
        : clientUserId;

    if (userId === null) {
      return Response.json({ settings: null, user: null });
    }

    const [settingsRow] = await db
      .select()
      .from(userSettingsSchema)
      .where(eq(userSettingsSchema.userId, userId))
      .limit(1);

    const [identityRow] = await db
      .select()
      .from(userIdentitiesSchema)
      .where(eq(userIdentitiesSchema.id, userId))
      .limit(1);

    // Identity'den ad/e-posta/dil, settings'den config — kesişim yok, birleştirilmiş snapshot.
    const settings = settingsRow ?? null;
    const user = identityRow ?? null;

    return Response.json({
      settings: settings
        ? {
            ...settings,
            // UI'nin beklediği alanlar user_identities'ten gelir.
            fullName: user?.name ?? null,
            email: user?.email ?? null,
          }
        : null,
      // Kişisel kayıt — settings satırı henüz olmasa bile UI kendi kaydını
      // (user_identities: ad/e-posta/ilk kayıt dili) gösterebilsin.
      user: user
        ? {
            id: user.id,
            name: user.name ?? null,
            email: user.email ?? null,
            language: user.language ?? null,
            createdAt: user.createdAt,
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
  // UI `local` gönderir → session kullanıcı; `user_settings` FK'i
  // (`user_id → user_identities.id`) için satırın varlığı şart → upsert resolver.
  // (ensure-user bunu her tam sayfa yüklemesinde zaten garanti eder; bu
  // yalnız ilk giriş + anında ayar kaydetme yarışına karşı sigorta.)
  const resolvedUserId =
    (v.userId ?? USER_ID_LOCAL) === USER_ID_LOCAL
      ? await resolveSessionDbUserId()
      : v.userId!;
  if (resolvedUserId === null) {
    // Session çözümlenemedi (oturum/provider yok) → sahibine yazılamaz.
    return Response.json(
      { error: "Oturum kullanilamadi — ayarlar kisinin DB kayidina yazilamadi." },
      { status: 401 },
    );
  }

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
