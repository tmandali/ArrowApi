import { Env } from "@/lib/env";
import { createDbConnection } from "./connection";

/**
 * Boilerplate `libs/DB.ts` uyarlaması.
 * Next.js hot-reload'da çoklu pool açılmasını önlemek için
 * dev'de global scope'ta tek bağlantı tutulur.
 */
declare global {
  var cachedYulaDb: ReturnType<typeof createDbConnection> | undefined;
}

const db = globalThis.cachedYulaDb ?? createDbConnection();

if (Env.NODE_ENV !== "production") {
  globalThis.cachedYulaDb = db;
}

export { db };
