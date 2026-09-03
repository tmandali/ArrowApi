/**
 * Yula Storage Buckets Manager — Chrome 122+ / Storage Buckets API.
 *
 * Yula yerel verilerini 3 bağımsız izole deponun altına ayırır:
 *   1) `yula-reports-opfs`: WASM Parquet dosyaları (persisted: true)
 *   2) `yula-rag-vectors`: WASM RAG Vektör veritabanı (persisted: true)
 *   3) `yula-ai-cache`: AI yanıt ve akış önbellekleri (7 günlük otomatik TTL)
 *
 * Feature detection (Progressive Enhancement) ile yazılmıştır; desteği olmayan
 * tarayıcılarda varsayılan navigator.storage deponuza kesintisiz düşer (fallback).
 */

export interface StorageBucketQuota {
  name: string;
  usage: number;
  quota: number;
  persisted: boolean;
}

export interface YulaStorageStatus {
  hasBucketSupport: boolean;
  buckets: StorageBucketQuota[];
  totalUsage: number;
}

let isBucketsInitialized = false;

/** Yula veri depolarını Chrome Storage Buckets API ile izole eder. */
export async function initYulaStorageBuckets(): Promise<YulaStorageStatus> {
  const hasSupport = typeof navigator !== "undefined" && "storageBuckets" in navigator;

  if (!hasSupport) {
    let usage = 0;
    let quota = 0;
    if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
      try {
        const est = await navigator.storage.estimate();
        usage = est.usage ?? 0;
        quota = est.quota ?? 0;
      } catch {
        // ignore
      }
    }
    return {
      hasBucketSupport: false,
      buckets: [
        {
          name: "default",
          usage,
          quota,
          persisted: false,
        },
      ],
      totalUsage: usage,
    };
  }

  const resultBuckets: StorageBucketQuota[] = [];
  let totalUsage = 0;

  try {
    // 1. Raporlar & Parquet OPFS Deposu (Silinmezlik korumalı)
    const reportsBucket = await (navigator as unknown as {
      storageBuckets: {
        open: (
          name: string,
          options?: { persisted?: boolean },
        ) => Promise<{
          estimate: () => Promise<{ usage?: number; quota?: number }>;
          setPersisted?: (p: boolean) => Promise<boolean>;
        }>;
      };
    }).storageBuckets.open("yula-reports-opfs", { persisted: true });

    if (reportsBucket.setPersisted) {
      await reportsBucket.setPersisted(true).catch(() => {});
    }

    const repEst = await reportsBucket.estimate().catch(() => ({ usage: 0, quota: 0 }));
    resultBuckets.push({
      name: "yula-reports-opfs",
      usage: repEst.usage ?? 0,
      quota: repEst.quota ?? 0,
      persisted: true,
    });
    totalUsage += repEst.usage ?? 0;

    // 2. RAG Vektör Veritabanı Deposu (Silinmezlik korumalı)
    const ragBucket = await (navigator as unknown as {
      storageBuckets: {
        open: (
          name: string,
          options?: { persisted?: boolean },
        ) => Promise<{
          estimate: () => Promise<{ usage?: number; quota?: number }>;
          setPersisted?: (p: boolean) => Promise<boolean>;
        }>;
      };
    }).storageBuckets.open("yula-rag-vectors", { persisted: true });

    if (ragBucket.setPersisted) {
      await ragBucket.setPersisted(true).catch(() => {});
    }

    const ragEst = await ragBucket.estimate().catch(() => ({ usage: 0, quota: 0 }));
    resultBuckets.push({
      name: "yula-rag-vectors",
      usage: ragEst.usage ?? 0,
      quota: ragEst.quota ?? 0,
      persisted: true,
    });
    totalUsage += ragEst.usage ?? 0;

    // 3. AI Önbellek Deposu (Geçici)
    const cacheBucket = await (navigator as unknown as {
      storageBuckets: {
        open: (
          name: string,
          options?: { expires?: number },
        ) => Promise<{
          estimate: () => Promise<{ usage?: number; quota?: number }>;
        }>;
      };
    }).storageBuckets.open("yula-ai-cache", {
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 gün
    });

    const cacheEst = await cacheBucket.estimate().catch(() => ({ usage: 0, quota: 0 }));
    resultBuckets.push({
      name: "yula-ai-cache",
      usage: cacheEst.usage ?? 0,
      quota: cacheEst.quota ?? 0,
      persisted: false,
    });
    totalUsage += cacheEst.usage ?? 0;

    if (!isBucketsInitialized) {
      isBucketsInitialized = true;
      console.info(
        `🤖 [Storage Buckets] 3 Isolated Storage Buckets Ready (Total Usage: ${(totalUsage / 1024 / 1024).toFixed(2)} MB).`,
        resultBuckets,
      );
    }

    return {
      hasBucketSupport: true,
      buckets: resultBuckets,
      totalUsage,
    };
  } catch (err) {
    console.warn("[Storage Buckets] Bucket creation error, using default storage:", err);
    return {
      hasBucketSupport: false,
      buckets: [],
      totalUsage: 0,
    };
  }
}
