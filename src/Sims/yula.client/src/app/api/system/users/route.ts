import { and, eq, isNull, ne, or } from "drizzle-orm";
import * as z from "zod";
import { db } from "@/server/db/client";
import { appUsersSchema } from "@/server/db/schema";
import { SystemUserUpsertValidation } from "@/validations/settings.validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEED_USERS = [
  {
    id: "usr_101",
    name: "Timur MANDALI",
    email: "timur.mandali@lcwaikiki.com",
    role: "System Administrator",
    status: "Active",
    lastActive: "Now",
    provider: "local",
    providerId: null,
  },
  {
    id: "usr_102",
    name: "John Doe",
    email: "john.doe@demo.com",
    role: "Stock Manager",
    status: "Active",
    lastActive: "2 hours ago",
    provider: null,
    providerId: null,
  },
  {
    id: "usr_103",
    name: "Jane Smith",
    email: "jane.smith@demo.com",
    role: "Financial Analyst",
    status: "Active",
    lastActive: "1 day ago",
    provider: null,
    providerId: null,
  },
  {
    id: "usr_104",
    name: "Guest User",
    email: "guest@demo.com",
    role: "Viewer",
    status: "Inactive",
    lastActive: "1 month ago",
    provider: null,
    providerId: null,
  },
] as const;

/**
 * Kullanıcı listesi. `Deleted` (soft-delete tombstone) satirlari katalogdan
 * gizlenir — onlar account-status guard tarafindan sign-out acisir.
 * Tablo bossa demo cekirdek veriyi eker (mevcut ekranla birebir).
 */
export async function GET() {
  try {
    let rows = await db
      .select()
      .from(appUsersSchema)
      // `Deleted` tombstone'ları gizle; NULL status (kolon nullable) KALSIN.
      .where(
        or(
          isNull(appUsersSchema.status),
          ne(appUsersSchema.status, "Deleted"),
        ),
      );
    if (rows.length === 0) {
      await db.insert(appUsersSchema).values([...SEED_USERS]);
      rows = await db.select().from(appUsersSchema);
    }
    return Response.json({ users: rows });
  } catch (error) {
    return Response.json(
      { users: [], error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/** Ekleme / güncelleme (id bazında upsert). */
export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parse = SystemUserUpsertValidation.safeParse(json);
  if (!parse.success) {
    return Response.json(z.treeifyError(parse.error), { status: 422 });
  }

  const v = parse.data;
  // Legacy kalkan: eski ayarlar formu harfiyen id:"local" yazıp duplikasyon
  // satir olusturuyordu (usr_101 + local ayni kisi). Ayarlar artik session
  // kullanicisina cozuluyor — "local" artik gecerli bir DB id'i degil.
  if (v.id === "local") {
    return Response.json(
      { error: "'local' alias artik gecerli degil — session kullanicisi otomatik cozulunur." },
      { status: 400 },
    );
  }
  try {
    const rows = await db
      .insert(appUsersSchema)
      .values({
        id: v.id,
        provider: v.provider ?? null,
        providerId: v.providerId ?? null,
        name: v.name ?? null,
        email: v.email ?? null,
        role: v.role ?? "Viewer",
        status: v.status ?? "Active",
        lastActive: v.lastActive ?? "Now",
      })
      .onConflictDoUpdate({
        target: appUsersSchema.id,
        set: {
          provider: v.provider ?? null,
          providerId: v.providerId ?? null,
          name: v.name ?? null,
          email: v.email ?? null,
          role: v.role ?? "Viewer",
          status: v.status ?? "Active",
          lastActive: v.lastActive ?? "Now",
        },
      })
      .returning();
    return Response.json({ user: rows[0] ?? null });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

/**
 * "Silme" — YUMUSAK SİLME: fiziksel DELETE satırı kaldırıp fail-open
 * deligi acardi (account-status satiri bulamaz → active → deaktive
 * kullanicina da giris icin). Status `Deleted` etiketli tombstone
 * olarak kalir: account-status guard otomatik sign-out eder, katalog
 * gizler; DB'den tam geri alma mumkun.
 */
export async function DELETE(req: Request) {
  const id = new URL(req.url).searchParams.get("id")?.trim();
  if (!id) {
    return Response.json({ error: "id is required" }, { status: 400 });
  }
  try {
    const rows = await db
      .update(appUsersSchema)
      .set({ status: "Deleted", lastActive: "Now" })
      .where(eq(appUsersSchema.id, id))
      .returning();
    return Response.json({ ok: true, id, softDelete: true, found: rows.length > 0 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
