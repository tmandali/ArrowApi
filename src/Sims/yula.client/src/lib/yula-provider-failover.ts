/**
 * Yula Provider Failover & Resilience Composer
 * Reference: reference-pi/packages/coding-agent/src/core/provider-composer.ts
 *
 * Birincil AI sağlayıcısı (örn: Azure OpenAI) 429 kota aşımı veya 5xx ağ hatası
 * verdiğinde, akışı kesintiye uğratmadan ikincil yedek sağlayıcıya şeffaf devir (failover) yapar.
 */

import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";

export interface FailoverOptions {
  primary: LanguageModel;
  fallback?: LanguageModel;
  onFailover?: (error: unknown, step: "stream" | "generate") => void;
}

/**
 * Hataya göre sağlayıcı değişiminin tetiklenip tetiklenmeyeceğini belirler.
 */
export function isRetryableProviderError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  // 429 Rate limit, 500, 502, 503, 504 veya ağ zaman aşımı
  return (
    msg.includes("429") ||
    msg.includes("rate limit") ||
    msg.includes("quota") ||
    msg.includes("500") ||
    msg.includes("502") ||
    msg.includes("503") ||
    msg.includes("504") ||
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("service unavailable")
  );
}

/**
 * Birincil ve ikincil modelleri şeffaf bir failover katmanında birleştirir.
 */
export function createFailoverLanguageModel(options: FailoverOptions): LanguageModel {
  const { primary, fallback, onFailover } = options;

  if (!fallback) {
    return primary;
  }

  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v4",
    wrapStream: async ({ doStream }) => {
      try {
        return await doStream();
      } catch (err) {
        if (isRetryableProviderError(err)) {
          onFailover?.(err, "stream");
          const fb = fallback as any;
          if (typeof fb?.doStream === "function") {
            return await fb.doStream();
          }
        }
        throw err;
      }
    },
    wrapGenerate: async ({ doGenerate }) => {
      try {
        return await doGenerate();
      } catch (err) {
        if (isRetryableProviderError(err)) {
          onFailover?.(err, "generate");
          const fb = fallback as any;
          if (typeof fb?.doGenerate === "function") {
            return await fb.doGenerate();
          }
        }
        throw err;
      }
    },
  };

  return wrapLanguageModel({
    model: primary as any,
    middleware,
  });
}
