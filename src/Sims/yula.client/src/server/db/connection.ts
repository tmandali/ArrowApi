import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { Env } from "@/lib/env";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as schema from "./schema";

type PgliteDb = PgliteDatabase<typeof schema>;

/**
 * In-process PGlite boot'unda eksik migrasyonları otomatik uygula.
 *
 * `local.db` sıfırdan oluştuğunda veya migrasyon tablosu (`_drizzle_migrations`)
 * yokken, dev'de `migrations/*.sql` dosyalarını sırayla çalıştır.
 * Artık pglite-socket/TCP olmadığı için migrasyonu app kendi boot'unda yapar.
 * İdempotent: `IF NOT EXISTS` taşımayan CREATE TABLE'ler ilk çalıştırmada oluşur;
 * sonraki açılışlarda PGlite, tabloların zaten var olduğunu görür.
 */
async function applyMigrationsIfAbsent(pglite: InstanceType<typeof PGlite>): Promise<void> {
  // _drizzle_migrations tablosu yoksa PGlite sıfırdır (ilk boot).
  const hasMigrationsTable = await pglite.query(
    "SELECT 1 FROM pg_class WHERE relname = '_drizzle_migrations' LIMIT 1",
  );
  if (hasMigrationsTable.rows.length > 0) return;

  const migrationsDir = join(process.cwd(), "migrations");
  if (!existsSync(migrationsDir)) {
    console.log("[db] migrations/ dizini yok, atlanıyor");
    return;
  }

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    // İdempotent değilse (CREATE TABLE IF NOT EXISTS değil) hata vermezsek
    // sonraki boot'lerde duplicate hata alırız; o yüzden ilk boot'te
    // _drizzle_migrations tablosu elle oluşturulur.
    await pglite.exec(sql);
  }

  // Basit migration tracking (drizzle-kit formatında tam uyumlu değil ama
  // tekrar çalışmayı engellemek için yeterli).
  await pglite.exec(
    `CREATE TABLE IF NOT EXISTS _drizzle_migrations (
       id SERIAL PRIMARY KEY,
       hash text NOT NULL,
       created_at timestamptz NOT NULL DEFAULT now()
     )`,
  );

  console.log(`[db] ${files.length} migrasyon uygulandı (in-process PGlite boot)`);
}

/**
 * PGlite (yerel Postgres) lazy bağlantı — `next build` (Turbopack) için.
 *
 * Build, page-data toplarken ~13 PARALEL worker süreci çalıştırır. Eğer her
 * worker modül yüklenirken (TLA) `new PGlite({ dataDir: "local.db" })`
 * başlatırsa, 13 ayrı süreç aynı `local.db` Postgres veritabanına paralel
 * kilitlenir ve build loguna şu gürültü taşar:
 *   TypeError: The "path" argument must be of type string ...
 *             Received an instance of URL
 *   RuntimeError: Aborted(). Build with -sASSERTIONS for more info.
 *
 * Build sırasında DB destekli HİÇBİR veri statik prerender edilmez
 * (tüm rotalar `ƒ dynamic`), dolayısıyla build adımında PGlite'a ihtiyaç
 * yoktur. Bu proxy, PGlite'ı yalnızca GERÇEKTEN bir drizzle DB operasyonu
 * (`select`/`insert`/`update`/`delete`/`transaction`/`execute`/`query`…)
 * yapıldığında boot eder; modül introspection'u (örn. `db.then`, symbol
 * erişimleri) boot etmez → build logu temiz çıkar.
 */

/** Gerçek DB erişimi tetikleyen drizzle operasyon token'ları. */
const PGLITE_OP_TOKENS = new Set<PropertyKey>([
  "select",
  "insert",
  "update",
  "delete",
  "transaction",
  "execute",
  "query",
  "batch",
  "withSchema",
]);

function createLazyPgliteConnection(): PgliteDb {
  let inner: PgliteDb | null = null;
  const boot = (): PgliteDb => {
    if (!inner) {
      const pglite = new PGlite({ dataDir: "local.db" });
      console.log("[db] PGlite initialized (local.db)");
      inner = drizzlePglite(pglite, { schema });
    }
    return inner;
  };
  return new Proxy({} as PgliteDb, {
    get(_target, prop) {
      // Yalnızca gerçek DB operasyonlarında boot et; introspection
      // (`.then`, symbol'ler, başka property'ler) PGlite'ı başlatmasın.
      if (!PGLITE_OP_TOKENS.has(prop)) return undefined;
      const value = boot()[prop as keyof PgliteDb];
      return typeof value === "function" ? value.bind(boot()) : value;
    },
  });
}

/**
 * DB connection factory — ortam değişkenine göre PostgreSQL veya PGlite seçer.
 *
 * - `USE_PGLITE=true` → dosya-tabanlı yerel PGlite (`local.db`)
 * - yoksa → `DATABASE_URL` ile gerçek Postgres Pool (pg protokolü).
 *   Dev'de `db-server:file` (pglite-server) aynı `DATABASE_URL`'i 127.0.0.1:5432'de
 *   sunar; `dev:full` bu yüzden `USE_PGLITE=false` çalıştırır — tek PGlite
 *   instance'ı sunucu tarafında, app TCP pool ile bağlanır (çift instance +
 *   Turbopack worker'da in-process PGlite'ın bozulması önlenir).
 */
export const createDbConnection = async () => {
  if (Env.USE_PGLITE) {
    // Build adımı (Turbopack worker'ları): PGlite'ı lazy yap — yalnızca
    // gerçekten sorgulandığında boot et, 13× paralel boot kilitlenmesini önle.
    // `next dev` (ana süreç) ve `next start` (prod runtime) normal boot eder.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return createLazyPgliteConnection();
    }
    const pglite = new PGlite({ dataDir: "local.db" });
    console.log("[db] PGlite initialized (local.db)");
    await applyMigrationsIfAbsent(pglite);
    return drizzlePglite(pglite, { schema });
  }

  const pool = new Pool({
    connectionString: Env.DATABASE_URL,
  });

  pool.on("error", (error) => {
    console.error(`[db] pool error: ${error.message}`);
  });

  return drizzle({
    client: pool,
    schema,
  });
};
