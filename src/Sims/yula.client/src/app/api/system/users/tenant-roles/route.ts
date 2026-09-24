import { and, eq } from "drizzle-orm";
import { db } from "@/server/db/client";
import { userTenantRolesSchema } from "@/server/db/schema";
import { assertSessionAdmin } from "@/features/auth/lib/admin-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tenant (şirket) bazlı kullanıcı rol yönetimi uçları.
 * Yalnızca System Administrator tarafından çağrılabilir.
 */
export async function GET(req: Request) {
  const gate = await assertSessionAdmin();
  if (!gate.ok) {
    return Response.json({ error: `Yetki gerektirir (${gate.reason})` }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId")?.trim();
  if (!userId) {
    return Response.json({ error: "userId parametresi zorunludur." }, { status: 400 });
  }

  try {
    const rows = await db
      .select({
        id: userTenantRolesSchema.id,
        tenantId: userTenantRolesSchema.tenantId,
        role: userTenantRolesSchema.role,
        updatedAt: userTenantRolesSchema.updatedAt,
      })
      .from(userTenantRolesSchema)
      .where(eq(userTenantRolesSchema.userId, userId));

    const tenantRoles: Record<string, string> = {};
    for (const r of rows) {
      if (r.tenantId && r.role) {
        tenantRoles[r.tenantId] = r.role;
      }
    }

    return Response.json({ userId, rows, tenantRoles });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const gate = await assertSessionAdmin();
  if (!gate.ok) {
    return Response.json({ error: `Yetki gerektirir (${gate.reason})` }, { status: 403 });
  }

  let body: { userId?: string; tenantId?: string; role?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "Geçersiz JSON verisi" }, { status: 400 });
  }

  const userId = body.userId?.trim();
  const tenantId = body.tenantId?.trim();
  const role = body.role?.trim();

  if (!userId || !tenantId || !role) {
    return Response.json(
      { error: "userId, tenantId ve role alanları zorunludur." },
      { status: 400 },
    );
  }

  const id = `utr_${userId.replace(/^usr_/, "")}_${tenantId}`;

  try {
    const [saved] = await db
      .insert(userTenantRolesSchema)
      .values({
        id,
        userId,
        tenantId,
        role,
      })
      .onConflictDoUpdate({
        target: [userTenantRolesSchema.userId, userTenantRolesSchema.tenantId],
        set: {
          role,
          updatedAt: new Date(),
        },
      })
      .returning();

    return Response.json({ ok: true, tenantRole: saved });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  const gate = await assertSessionAdmin();
  if (!gate.ok) {
    return Response.json({ error: `Yetki gerektirir (${gate.reason})` }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId")?.trim();
  const tenantId = searchParams.get("tenantId")?.trim();

  if (!userId || !tenantId) {
    return Response.json(
      { error: "userId ve tenantId parametreleri zorunludur." },
      { status: 400 },
    );
  }

  try {
    await db
      .delete(userTenantRolesSchema)
      .where(
        and(
          eq(userTenantRolesSchema.userId, userId),
          eq(userTenantRolesSchema.tenantId, tenantId),
        ),
      );

    return Response.json({ ok: true, userId, tenantId, deleted: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
