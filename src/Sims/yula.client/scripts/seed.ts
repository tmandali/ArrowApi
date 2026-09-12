/**
 * `npm run db:seed` — statik dev seed runner'ı.
 *
 * Bağlantı: TAIP PGlite dosya instance'ı AÇMAZ (pglite-server zaten aynı
 * `local.db`'ı tutuyor; ikinci in-process instance yazma çakışması yaratır).
 * Bunun yerine `DATABASE_URL` üzerinden TCP'ye gider — dev:full'da bu URL
 * pglite-socket'in 127.0.0.1:5432 ucudur (bkz. package.json `db-server:file`).
 *
 * Guard: `USE_PGLITE=true` değilse SİLLER — prod/gerçek Postgres'e statik
 * katalog satırı asla enjekte edilmez.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { ensureDefaultAdmin, YULA_ADMIN_USER_ID } from "../src/server/db/seed";

const isPglite = process.env.USE_PGLITE === "true";

if (!isPglite) {
  console.log("[db:seed] SKIPPED — seed yalnız dev PGlite (USE_PGLITE=true) çalışır.");
  process.exit(0);
}

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:5432/postgres";

const pool = new Pool({ connectionString });

(async () => {
  try {
    await ensureDefaultAdmin(drizzle(pool));
    console.log(`[db:seed] yula-admin (${YULA_ADMIN_USER_ID}) hazır (idempotent).`);
  } catch (error) {
    console.error("[db:seed] hata:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
