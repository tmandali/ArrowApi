import { cpSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const dist = path.join(root, "node_modules/pyodide");
const out = path.join(root, "public/pyodide");

mkdirSync(out, { recursive: true });

const files = [
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "pyodide.mjs",
  "pyodide.js",
  "python_stdlib.zip",
  "pyodide-lock.json",
];

for (const file of files) {
  const src = path.join(dist, file);
  if (existsSync(src)) {
    cpSync(src, path.join(out, file));
  }
}

console.log(`pyodide dosyaları ${out} altına kopyalandı`);
