import { drizzle } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import { PGlite } from "@electric-sql/pglite";
import { Env } from "@/lib/env";
import * as schema from "./schema";

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
