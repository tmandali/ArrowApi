import type { LanguageModelMiddleware } from "ai";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface CachingMiddlewareOptions {
  /** Önbellek yaşam süresi (varsayılan: 24 saat) */
  ttlMs?: number;
  /** Maksimum önbellek öğe sayısı (LRU temizliği, varsayılan: 100) */
  maxEntries?: number;
  /** Yerel diske kalıcı yazma/okuma aktif mi? (varsayılan: true) */
  persistToDisk?: boolean;
}

interface CacheValueStream {
  type: "stream";
  parts: any[];
  rest: any;
  timestamp: number;
}

interface CacheValueGenerate {
  type: "generate";
  result: any;
  timestamp: number;
}

type CacheValue = CacheValueStream | CacheValueGenerate;

/** Hızlı ve kararlı string hash fonksiyonu (FNV-1a 32-bit). */
function fastHash(str: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(36);
}

/** `params` nesnesinden kararlı cache key türetir. */
function generateCacheKey(params: unknown): string {
  if (!params || typeof params !== "object") return fastHash(String(params));
  const p = params as Record<string, unknown>;
  const promptKey = JSON.stringify(p.prompt ?? []);
  const modeKey = JSON.stringify(p.mode ?? {});
  const inputFormatKey = JSON.stringify(p.inputFormat ?? "");
  return fastHash(`${promptKey}:${modeKey}:${inputFormatKey}`);
}

function getCacheFilePath(): string {
  try {
    const dir = path.join(process.cwd(), ".cache");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, "yula-ai-cache.json");
  } catch {
    const fallbackDir = path.join(os.tmpdir(), "yula-ai-cache");
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
    return path.join(fallbackDir, "yula-ai-cache.json");
  }
}

function loadDiskCache(ttlMs: number): Map<string, CacheValue> {
  const map = new Map<string, CacheValue>();
  try {
    const filePath = getCacheFilePath();
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, CacheValue>;
      const now = Date.now();
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === "object" && v.timestamp && now - v.timestamp < ttlMs) {
          map.set(k, v);
        }
      }
      if (map.size > 0) {
        console.info(`🤖 [Yula Local Cache] Loaded ${map.size} cached AI responses from disk.`);
      }
    }
  } catch (err) {
    console.warn("[Yula Local Cache] Could not load disk cache:", err);
  }
  return map;
}

function saveDiskCache(cache: Map<string, CacheValue>) {
  try {
    const filePath = getCacheFilePath();
    const obj: Record<string, CacheValue> = {};
    for (const [k, v] of cache.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), "utf-8");
  } catch (err) {
    console.warn("[Yula Local Cache] Could not save disk cache:", err);
  }
}

export function yulaCachingMiddleware(
  options: CachingMiddlewareOptions = {},
): LanguageModelMiddleware {
  const ttlMs = options.ttlMs ?? 1000 * 60 * 60 * 24; // 24 saat
  const maxEntries = options.maxEntries ?? 100;
  const persistToDisk = options.persistToDisk ?? true;

  const cache = persistToDisk
    ? loadDiskCache(ttlMs)
    : new Map<string, CacheValue>();

  const isExpired = (val: CacheValue) => Date.now() - val.timestamp > ttlMs;

  const purgeExpired = () => {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.timestamp > ttlMs) cache.delete(k);
    }
  };

  const persistIfEnabled = () => {
    if (persistToDisk) {
      setTimeout(() => saveDiskCache(cache), 10);
    }
  };

  return {
    specificationVersion: "v4",
    wrapGenerate: async ({ doGenerate, params }) => {
      const key = generateCacheKey(params);
      const cached = cache.get(key);

      if (cached && cached.type === "generate" && !isExpired(cached)) {
        console.info(`🤖 [Yula Local Cache] DISK HIT (generate) key: ${key}`);
        return cached.result;
      }

      const result = await doGenerate();

      if (cache.size >= maxEntries) purgeExpired();
      cache.set(key, {
        type: "generate",
        result,
        timestamp: Date.now(),
      });
      persistIfEnabled();

      return result;
    },

    wrapStream: async ({ doStream, params }) => {
      const key = generateCacheKey(params);
      const cached = cache.get(key);

      if (cached && cached.type === "stream" && !isExpired(cached)) {
        console.info(
          `🤖 [Yula Local Cache] DISK HIT (stream) key: ${key} · ${cached.parts.length} chunks replayed instantly`,
        );

        const partsCopy = [...cached.parts];
        const stream = new ReadableStream({
          start(controller) {
            for (const part of partsCopy) {
              controller.enqueue(part);
            }
            controller.close();
          },
        });

        return { stream, ...cached.rest };
      }

      const startMs = Date.now();
      const { stream, ...rest } = await doStream();
      const recordedParts: any[] = [];

      const cachingStream = stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            recordedParts.push(chunk);
            controller.enqueue(chunk);
          },
          flush() {
            if (cache.size >= maxEntries) purgeExpired();
            cache.set(key, {
              type: "stream",
              parts: recordedParts,
              rest,
              timestamp: Date.now(),
            });
            persistIfEnabled();
            console.info(
              `🤖 [Yula Local Cache] MISS & SAVED TO DISK key: ${key} · ${recordedParts.length} chunks (${Date.now() - startMs} ms)`,
            );
          },
        }),
      );

      return { stream: cachingStream, ...rest };
    },
  };
}
