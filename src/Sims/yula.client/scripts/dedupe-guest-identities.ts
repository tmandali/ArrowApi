/**
 * `npm run db:dedupe` — bekleyen (guest) kimlik dedup'u (ONE-SHOT, IDEMPOTENT).
 *
 * Aynı `(provider, email)` grubundaki BEKLEYEN (`user_id IS NULL`)
 * `user_identities` satırlarını "son gelen kalsın" kuralıyla en güncel
 * satıra (created_at → id) toplar:
 *   - Eski satırların login çifti → `identity_aliases` (owner'a)
 *   - Settings: owner'da yoksa hedefin satırı taşınır, varsa atılır
 *   - Eski satırlar silinir
 *
 * Linkli (`user_id` dolu) satırlara ASLA dokunulmaz. Login akışındaki
 * otomatik dedup (`app-user-sync.ts` → `consolidateGuestDupes`) bundan
 * sonraki kaydı korur; bu script mevcut dökümü temizler ve yeniden
 * çalıştırılabilecek kadar idempotenttir.
 *
 * Bağlantı: `DATABASE_URL` üzerinden TCP Postgres (dev'de Docker Compose
 * `app-db` servisi, 127.0.0.1:15432).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { and, eq, isNull, not } from "drizzle-orm";
import {
  identityAliasesSchema,
  userIdentitiesSchema,
  userSettingsSchema,
} from "../src/server/db/schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

const pool = new Pool({ connectionString });
const db = drizzle(pool);

async function main(): Promise<void> {
  // (provider, email) bazlı BEKLEYEN dup grupları.
  const dupGroups = await db
    .select({
      provider: userIdentitiesSchema.provider,
      email: userIdentitiesSchema.email,
    })
    .from(userIdentitiesSchema)
    .where(
      and(
        isNull(userIdentitiesSchema.userId),
        not(isNull(userIdentitiesSchema.provider)),
        not(isNull(userIdentitiesSchema.email)),
      ),
    );

  const groupKeys = new Set(
    dupGroups.map((g) => `${g.provider}|${g.email}`),
  );
  // Tek satırlı gruplar zaten dedup gerektirmez — ama gruplamayı SQL'de
  // yapmak için COUNT gerekir; burayı JS tarafında toplulaştıralım.
  const countBy = new Map<string, number>();
  for (const g of dupGroups) {
    const key = `${g.provider}|${g.email}`;
    countBy.set(key, (countBy.get(key) ?? 0) + 1);
  }

  let consolidated = 0;
  for (const key of groupKeys) {
    if ((countBy.get(key) ?? 0) <= 1) continue;
    const [provider, email] = key.split("|");

    const rows = await db
      .select()
      .from(userIdentitiesSchema)
      .where(
        and(
          eq(userIdentitiesSchema.provider, provider),
          eq(userIdentitiesSchema.email, email),
          isNull(userIdentitiesSchema.userId),
        ),
      );
    if (rows.length <= 1) continue;

    // "Son gelen kalsın": en güncel (created_at, id) = owner.
    const owner = rows
      .slice()
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      )
      .at(-1)!;
    const targets = rows.filter((r) => r.id !== owner.id);

    await db.transaction(async (tx) => {
      for (const dupe of targets) {
        // Hedef login çifti başka bir owner'a alias ise atla.
        const [alias] = await tx
          .select({ ownerId: identityAliasesSchema.ownerId })
          .from(identityAliasesSchema)
          .where(
            and(
              eq(identityAliasesSchema.provider, dupe.provider!),
              eq(identityAliasesSchema.providerId, dupe.providerId!),
            ),
          )
          .limit(1);
        if (alias && alias.ownerId !== owner.id) continue;

        const [ownerSettings] = await tx
          .select({ userId: userSettingsSchema.userId })
          .from(userSettingsSchema)
          .where(eq(userSettingsSchema.userId, owner.id))
          .limit(1);
        if (ownerSettings) {
          await tx
            .delete(userSettingsSchema)
            .where(eq(userSettingsSchema.userId, dupe.id));
        } else {
          await tx
            .update(userSettingsSchema)
            .set({ userId: owner.id })
            .where(eq(userSettingsSchema.userId, dupe.id));
        }

        if (!alias) {
          await tx.insert(identityAliasesSchema).values({
            id: crypto.randomUUID(),
            ownerId: owner.id,
            provider: dupe.provider!,
            providerId: dupe.providerId!,
          });
        }
        await tx
          .delete(userIdentitiesSchema)
          .where(eq(userIdentitiesSchema.id, dupe.id));
      }
    });

    consolidated += targets.length;
    console.log(
      `[db:dedupe] ${provider}/${email}: ${targets.length} eski satır → ${owner.id} (owner) toplandı.`,
    );
  }

  if (consolidated === 0) {
    console.log("[db:dedupe] Dedup gereken bekleyen grup yok.");
  }
}

main()
  .catch((error) => {
    console.error("[db:dedupe] hata:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
