import { cpSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const dist = path.join(root, "node_modules/parquet-wasm/esm");
const out = path.join(root, "public/parquet");

mkdirSync(out, { recursive: true });

const files = [
  "parquet_wasm_bg.wasm",
];

for (const file of files) {
  cpSync(path.join(dist, file), path.join(out, file));
}

console.log(`parquet-wasm dosyaları ${out} altına kopyalandı`);
