import { createDbConnection } from "./connection";

/**
 * DB client singleton — Next.js hot-reload'da çoklu bağlantı açılmasını önler.
 *
 * PGlite async init olduğu için `createDbConnection()` promise döner;
 * ilk çağrıda resolve olan değeri global scope'ta tutarız.
 *
 * SSR/API route'ları bu modül import edildiği anda bağlantıyı başlatır;
 * sonraki tüm istekler resolve olmuş drizzle instance'ını kullanır.
 */
declare global {
  var cachedYulaDb:
    | Awaited<ReturnType<typeof createDbConnection>>
    | undefined;
}

// Module-level holder — promise resolves before any API route runs in practice
let _db: Awaited<ReturnType<typeof createDbConnection>> | undefined =
  globalThis.cachedYulaDb;

if (!_db) {
  createDbConnection().then((resolved) => {
    globalThis.cachedYulaDb = resolved;
    _db = resolved;
  });
}

/**
 * Drizzle instance — available after first module evaluation.
 * In dev the promise resolves during Next.js startup; in production the
 * connection is synchronous (PostgreSQL Pool).
 */
export const db = _db!;
