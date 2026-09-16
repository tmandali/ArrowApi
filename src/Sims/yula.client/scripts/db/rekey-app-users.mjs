/**
 * BIR KEREYE ÖZEL data migration — design C kimlik modeline re-key.
 *
 * Eski model: `app_users.id` = provider'ın ham sub'ı (Keycloak UUID /
 * Google sayısal) + legacy 'local' satırı.
 * Yeni model: `app_users.id` = uygulama GUID'i (stabil), ham sub
 * `provider` + `provider_id` sütunlarında.
 *
 * Yapılanlar (idempotent — ikinci çalıştırmada iş yapmaz):
 *  1. Legacy 'local' duplikasyon satırı silinir (user_settings FK'leri de).
 *  2. `usr_101` seed → `provider = 'local'` (id korunur).
 *  3. provider'sız diğer satırlar:
 *       - sayısal id → provider 'google', yeni uygulama GUID'i
 *       - UUID id    → provider 'keycloak', yeni uygulama GUID'i
 *       - diğer (manuel/admin) → provider null, id korunur
 *     `user_settings.user_id` FK'leri aynı işlemde yeni GUID'lere taşınır.
 *
 * ÖNKOŞUL: `npm run db:migrate` (veya dev'de `npm run db-server:file`)
 * çalıştırılmış olmalı (0001 migration: provider/provider_id kolonları).
 * Dev (PGlite): next dev server KAPALI olmalı (local.db kilitli olur).
 *
 * Çalıştırma (yula.client klasöründen):
 *   node scripts/db/rekey-app-users.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(import.meta.dirname, "..");

/** .env + .env.local basit parser (yalnızca bu script için). */
function loadEnv() {
  const vars = {};
  for (const name of [".env", ".env.local"]) {
    try {
      const content = readFileSync(path.join(ROOT, name), "utf8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eq = trimmed.indexOf("=");
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        let value = trimmed.slice(eq + 1).trim();
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (!(key in vars)) vars[key] = value;
      }
    } catch {
      // dosya yok — geç
    }
  }
  return vars;
}

const env = loadEnv();
// CLI override'ı dosya env'ine galip gelir (ör. pglite-server açıkken
// `USE_PGLITE=false node scripts/db/rekey-app-users.mjs`):
const usePglite = (process.env.USE_PGLITE ?? env.USE_PGLITE) === "true";
const databaseUrl =
  process.env.DATABASE_URL ?? env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMERIC_RE = /^\d+$/;

/**
 * Legacy satırın provider türevidini tahmin eder.
 * - `usr_101` → 'local' (uygulama seed'i — id korunur, etiketlenir)
 * - UUID biçimi → Keycloak sub'ı (re-key)
 * - Sayısal → Google sub'ı (re-key)
 * - Diğer (`usr_102` seed'i, manuel/admin oluşturma) → null
 *   (UYGULAMA id'si — id'de KALIR, re-key YAPILMAZ)
 */
function providerForLegacyId(id) {
  if (id === "usr_101") return "local";
  if (NUMERIC_RE.test(id)) return "google";
  if (UUID_RE.test(id)) return "keycloak";
  return null; // uygulama/manuel id — re-key gerekmez
}

/** Re-key gereken (ham provider sub) id'leri: UUID veya sayısal. */
function isProviderSubId(id) {
  return UUID_RE.test(id) || NUMERIC_RE.test(id);
}

async function main() {
  let q; // (sql, params[]) => Promise<rows[]>
  let cleanup;

  if (usePglite) {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite(path.join(ROOT, "local.db"));
    q = async (sql, params) => {
      const res = await db.query(sql, params);
      return res.rows;
    };
    cleanup = () => db.close();
    console.log("Hedef: PGlite → local.db");
  } else {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: databaseUrl });
    q = async (sql, params) => {
      const res = await pool.query(sql, params);
      return res.rows;
    };
    cleanup = () => pool.end();
    console.log("Hedef: Postgres →", databaseUrl.replace(/:[^:@/]+@/, ":***@"));
  }

  await q("BEGIN");
  try {
    // FK geçici olarak düşürülür; re-key bitince aynı işlemde geri eklenir.
    await q(
      `ALTER TABLE "user_settings" DROP CONSTRAINT IF EXISTS "user_settings_user_id_app_users_id_fk"`,
    );

    // 1) Legacy 'local' duplikasyonu — ayarlar + kullanıcı satırı
    await q(`DELETE FROM "user_settings" WHERE "user_id" = 'local'`);
    await q(`DELETE FROM "app_users" WHERE "id" = 'local'`);
    console.log("Legacy 'local' satırı temizlendi.");

    // 2) provider'sız kalan satırları re-key
    const rows = await q(
      `SELECT "id" FROM "app_users" WHERE "provider" IS NULL ORDER BY "id"`,
    );
    let rekeyed = 0;
    let marked = 0;
    for (const { id } of rows) {
      const provider = providerForLegacyId(id);
      if (provider === "local") {
        // usr_101: id korunur, yalnız provider etiketlenir
        await q(
          `UPDATE "app_users" SET "provider" = $1 WHERE "id" = $2 AND "provider" IS NULL`,
          [provider, id],
        );
        marked += 1;
        continue;
      }
      if (!isProviderSubId(id)) {
        // Uygulama/manuel id (usr_102 seed'i vb.) → provider null kalır,
        // id re-key'den KAÇINIR (stabil uygulama id'si).
        continue;
      }
      const newId = crypto.randomUUID();
      const us = await q(`UPDATE "user_settings" SET "user_id" = $1 WHERE "user_id" = $2`, [
        newId,
        id,
      ]);
      const au = await q(
        `UPDATE "app_users" SET "id" = $1, "provider" = $2, "provider_id" = $3 WHERE "id" = $4`,
        [newId, provider, id, id],
      );
      if (au.rowCount > 0) {
        rekeyed += 1;
        console.log(
          `  re-key: ${id} → ${newId} (provider=${provider ?? "null"}, settings taşındı: ${us.rowCount})`,
        );
      }
    }

    // FK geri eklenir (drizzle 0001 migration ile aynı isim/altyapı)
    await q(
      `ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_app_users_id_fk"
       FOREIGN KEY ("user_id") REFERENCES "app_users"("id")
       ON DELETE no action ON UPDATE no action`,
    );

    await q("COMMIT");
    console.log(
      `Bitti: ${rekeyed} satır re-key, ${marked} seed etiketlendi. ` +
        `(idempotent — tekrar çalıştırman iş yapmaz)`,
    );
  } catch (error) {
    await q("ROLLBACK");
    console.error("HATA — işlem geri alındı:", error);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

await main();
