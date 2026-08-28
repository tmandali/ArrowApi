import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const dist = path.join(root, "node_modules/@duckdb/duckdb-wasm/dist");
const out = path.join(root, "public/duckdb");

mkdirSync(out, { recursive: true });

const files = [
  "duckdb-mvp.wasm",
  "duckdb-eh.wasm",
  "duckdb-browser-mvp.worker.js",
  "duckdb-browser-eh.worker.js",
];

for (const file of files) {
  cpSync(path.join(dist, file), path.join(out, file));
}

console.log(`duckdb-wasm dosyaları ${out} altına kopyalandı`);
