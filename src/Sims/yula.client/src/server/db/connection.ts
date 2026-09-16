import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { Env } from "@/lib/env";
import * as schema from "./schema";

/**
 * DB connection factory — `DATABASE_URL` ile Postgres (pg protokolü) Pool.
 *
 * Dev'de altyapı Docker Compose'tan gelir (`app-db` servisi, host port 15432).
 * Migrasyonlar `npm run db:migrate` (drizzle-kit) ile uygulanır.
 */
export const createDbConnection = async () => {
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
