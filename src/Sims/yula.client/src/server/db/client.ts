import { createDbConnection } from "./connection";

/**
 * DB client singleton — Next.js hot-reload'da çoklu bağlantı açılmasını önler.
 *
 * İlk modül değerlendirmesinde bağlantı SENKRON olarak başlatılır:
 * top-level `await` resolve olan drizzle instance'ı üretilmeden module'u
 * yüklemeyi BEKLETİR. `db` export'u dolayısıyla asla `undefined` olmaz
 * (eski async `.then()` pattern'i cold start'ta ilk isteği 500 veriyordu:
 * `const db = _db!` undefined'ı yakalıyordu).
 *
 * Sonraki HMR/isteklerde `globalThis.cachedYulaDb` dolu olduğu için
 * yeniden init HİSSEDİLİR (çift bağlantı yok).
 */
declare global {
  var cachedYulaDb:
    | Awaited<ReturnType<typeof createDbConnection>>
    | undefined;
}

let _db = globalThis.cachedYulaDb;
if (!_db) {
  _db = await createDbConnection();
  globalThis.cachedYulaDb = _db;
}

/**
 * Drizzle instance — module yüklenirken (TLA) resolve edilir; sonraki tüm
 * import'lar hazır instance'ı alır.
 */
export const db = _db;
