#!/usr/bin/env node
/**
 * PGlite TCP Socket Host (dev)
 * ----------------------------
 * Yerel PGlite veritabanını (local.db) @electric-sql/pglite-socket ile
 * Postgres wire protocol sunucusu olarak 127.0.0.1:<port> üzerine açar.
 *
 * .NET servisleri (Arrow.Jobs.AspNetCore vb.) dev senaryosunda bu porta
 * standart Npgsql ile bağlanır:
 *
 *   "Host=127.0.0.1;Port=15432;Database=postgres;Username=postgres"
 *
 * Kullanım:
 *   npm run pglite-socket
 *   PGLITE_PORT=25432 PGLITE_DATA_DIR=local.db node scripts/db/pglite-socket.mjs
 *
 * Ayağa kalkınca sırasıyla:
 *   1. `local.db` PGlite instance'ını açar
 *   2. .NET ArrowJobs DDL'sini uygular (Arrow.Jobs.Postgres/Schema.sql)
 *   3. `npm run db:migrate` (drizzle) TCP üzerinden çalışır
 *   4. 127.0.0.1:<port> Postgres sunucusu başlar
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PGLITE_PORT ?? 15432);
const HOST = process.env.PGLITE_HOST ?? "127.0.0.1";
const DATA_DIR = process.env.PGLITE_DATA_DIR ?? "local.db";

const db = new PGlite({ dataDir: DATA_DIR });

// .NET ArrowJobs (PostgresArrowJobStore) DDL'sini idempotent uygula.
// scripts/db -> ../../../../Arrow.Jobs.Postgres/Schema.sql
const schemaPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../Arrow.Jobs.Postgres/Schema.sql",
);
const schemaSql = readFileSync(schemaPath, "utf8");
await db.exec(schemaSql);
console.log("[pglite-socket] arrow_jobs şeması hazır");

// maxConnections: Npgsql connection pooling için yeterince yüksek olmalı;
 // aşırı yükseltmek WASM tek-runtime üzerinde sorguları yığıp yavaşlatır.
const MAX_CONNECTIONS = Number(process.env.PGLITE_MAX_CONNECTIONS ?? 20);

const server = new PGLiteSocketServer({
  db,
  host: HOST,
  port: PORT,
  maxConnections: MAX_CONNECTIONS,
});
await server.start();
console.log(`[pglite-socket] Postgres sunucusu hazır: ${HOST}:${PORT}`);

// Kendi smoke testi — bağlanamıyorsak baştan uyar.
const pool = new Pool({
  host: HOST,
  port: PORT,
  user: "postgres",
  database: "postgres",
});
const check = await pool.query("select 1 as ok");
console.log(`[pglite-socket] smoke test: ${check.rows[0].ok}`);

// Drizzle migrasyonları — TCP socket üzerinden (DATABASE_URL @ .env).
// pglite-server'ın `--run "npm run db:migrate"` davranışının varisi; socket ayağa kalktıktan sonra çalıştırılır. PGLITE_SKIP_MIGRATIONS=1 atlar.
if (process.env.PGLITE_SKIP_MIGRATIONS !== "1") {
  const { spawn } = await import("node:child_process");
  console.log("[pglite-socket] drizzle migrate çalıştırılıyor...");
  const mig = spawn("npm", ["run", "db:migrate"], { stdio: "inherit", cwd: process.cwd() });
  const code = await new Promise((res) => {
    mig.on("close", (c) => res(c));
  });
  console.log(code === 0
    ? "[pglite-socket] migrasyon tamam"
    : `[pglite-socket] migrasyon hatalı bitti (kod ${code}) — sunucu yine de devam ediyor`);
}

let closing = false;
const shutdown = async (signal) => {
  if (closing) return;
  closing = true;
  console.log(`[pglite-socket] ${signal} alındı, kapatılıyor...`);
  await pool.end();
  await server.stop();
  await db.close();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  console.error("[pglite-socket] unhandledRejection:", err);
});
