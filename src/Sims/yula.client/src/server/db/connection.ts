import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { Env } from "@/lib/env";
import * as schema from "./schema";

type PgliteDb = PgliteDatabase<typeof schema>;

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
 * - yoksa → `DATABASE_URL` ile gerçek Postgres Pool
 *
 * Her iki yol da `pg` protokolü konuştuğu için Drizzle ORM aynı API'yi kullanır.
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
