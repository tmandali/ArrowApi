/**
 * Node --import kancası: bundler-only ham-metin importlarını (webpack
 * raw-loader / next.config *.md kuralı karşılığı) tsx/node testlerinde
 * çalışır kılar. Kullanım:
 *   npx tsx --import ./src/test-utils/raw-text-loader.mjs --test <dosya>
 */
import { readFile } from "node:fs/promises";

const TEXT_PATTERN = /\.(yaml|yml|md)$/;
const EMPTY_PATTERN = /\.(css|scss|less)$/;

export async function resolve(specifier, context, next) {
  if (TEXT_PATTERN.test(specifier) || EMPTY_PATTERN.test(specifier)) {
    return {
      url: new URL(specifier, context.parentURL).href,
      shortCircuit: true,
    };
  }
  return next(specifier, context);
}

export async function load(url, context, next) {
  const path = url.split("?")[0];
  if (TEXT_PATTERN.test(path)) {
    const source = await readFile(new URL(url), "utf8");
    return {
      format: "module",
      source: `export default ${JSON.stringify(source)};`,
      shortCircuit: true,
    };
  }
  if (EMPTY_PATTERN.test(path)) {
    return {
      format: "module",
      source: "export default {};",
      shortCircuit: true,
    };
  }
  return next(url, context);
}
