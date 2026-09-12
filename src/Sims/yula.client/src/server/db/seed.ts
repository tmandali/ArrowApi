/**
 * `local.db` (dev PGlite) başlangıç seed'i — statik katalog kayıtları.
 *
 * KURALLAR:
 * - Yalnız DEV (USE_PGLITE) ortamı içindir; gerçek Postgres'e (prod)
 *   `npm run db:seed` çalıştırılmaz (runner guard'ı, bkz. `scripts/seed.ts`).
 * - Her kayıt İDEMPOTENT'tir (onConflictDoNothing) — seed her `dev:full`
 *   ayağa kalkışında migrate sonrası çalışır, mevcut DB'ye tekrar koşulunca
 *   hiçbir şeyi ezmeyip sessiz geçer.
 * - `user_identities` / `user_settings` HİÇ seed ETME — onlar login anında
 *   açılır (ensure-user upsert'i, `features/auth/lib/app-user-sync.ts`).
 *   Bu modülde yalnız statik katalog verileri (app_users vb.) yaşar.
 */
import { appUsersSchema } from "./schema";
import type { createDbConnection } from "./connection";

type DbHandle = Awaited<ReturnType<typeof createDbConnection>>;

/**
 * `yula-admin` varsayılan yönetici katalog kaydının STABİL GUID'i.
 * Provider'sız (manuel) `app_users` satırıdır — unique index'te NULL'lar
 * farklı kabul edildiği için provider'sız ikinci satırlarla çakışmaz.
 * GUID'i ASLA değiştirme: `user_identities.user_id` linkleri buna bakar.
 */
export const YULA_ADMIN_USER_ID = "c76b3374-c42c-413b-a8b5-e4236269f316";

/**
 * Rol değeri tek kaynağı `features/auth/lib/realm-roles.ts`'teki
 * `APP_ROLE_ADMIN` ("System Administrator") ile aynıdır — bu modül
 * import bağımlısız kalması için sabit olarak tekrarlanır (değiştirirken
 * ikisini birlikte güncelle).
 */
export const YULA_ADMIN_ROLE = "System Administrator";

/**
 * `yula-admin` katalog kaydını garantile (idempotent upsert).
 *
 * Satır yok → `app_users`'e açılır: stabil GUID, provider'sız manuel
 * kayıt, rol = System Administrator, status = Active.
 * Satır var → dokunulmaz (onConflictDoNothing) — yönetici System Users
 * ekranından istediği gibi güncelleyebilir.
 */
export async function ensureDefaultAdmin(db: DbHandle): Promise<void> {
  await db
    .insert(appUsersSchema)
    .values({
      id: YULA_ADMIN_USER_ID,
      provider: null,
      providerId: null,
      name: "yula-admin",
      email: null,
      role: YULA_ADMIN_ROLE,
      status: "Active",
      lastActive: null,
    })
    .onConflictDoNothing({ target: [appUsersSchema.id] });
}
