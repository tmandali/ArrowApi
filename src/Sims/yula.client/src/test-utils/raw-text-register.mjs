/**
 * Preload girişi (--import ile): ham-metin kancalarını Node'a kaydeder.
 * Kullanım:
 *   npx tsx --import ./src/test-utils/raw-text-register.mjs --test <dosya>
 *
 * Not: tsx TS importlarını CJS require'a çevirdiği için ESM loader
 * kancaları (.yaml/.md) işlemez; aynı process içinde require.extensions
 * yaması da gerekir. ESM hooks saf ESM yükleme yolunu kapsar.
 */
import { register } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";

// Ham metin: yaml/yml/md → dosya içeriği string olarak döner
// (webpack raw-loader / next.config *.md kuralı karşılığı).
for (const ext of [".yaml", ".yml", ".md"]) {
  // @ts-ignore - test-only yaması
  Module._extensions[ext] = (m, filename) => {
    m.exports = readFileSync(filename, "utf8");
  };
}

// Stil dosyaları testlerde boş modüldür.
for (const ext of [".css", ".scss", ".less"]) {
  // @ts-ignore - test-only yaması
  Module._extensions[ext] = (m) => {
    m.exports = {};
  };
}

register("./raw-text-hooks.mjs", import.meta.url);
