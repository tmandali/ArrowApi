import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Env } from "@/lib/env";
import * as schema from "./schema";

/**
 * Boilerplate `utils/DBConnection.ts` uyarlaması.
 * PGlite (local.db) ya da gerçek Postgres fark etmez — ikisi de
 * `pg` protokolü konuştuğu için aynı `Pool` ile bağlanılır.
 */
export const createDbConnection = () => {
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
