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

interface StorageBucket {
  estimate: () => Promise<{ usage?: number; quota?: number }>;
  persisted?: () => Promise<boolean>;
  setPersisted?: (persisted: boolean) => Promise<boolean>;
}

interface StorageBuckets {
  open: (
    name: string,
    options?: { persisted?: boolean; expires?: number },
  ) => Promise<StorageBucket>;
}

let initialization: Promise<YulaStorageStatus> | undefined;

function getStorageBuckets(): StorageBuckets | undefined {
  if (typeof navigator === "undefined") return undefined;

  const storageBuckets = (navigator as Navigator & {
    storageBuckets?: StorageBuckets;
  }).storageBuckets;

  return typeof storageBuckets?.open === "function" ? storageBuckets : undefined;
}

async function defaultStorageStatus(): Promise<YulaStorageStatus> {
  let usage = 0;
  let quota = 0;

  try {
    const estimate = typeof navigator === "undefined"
      ? undefined
      : await navigator.storage?.estimate?.();
    usage = estimate?.usage ?? 0;
    quota = estimate?.quota ?? 0;
  } catch {
    // Storage estimation is optional and must not prevent the fallback.
  }

  return {
    hasBucketSupport: false,
    buckets: [{ name: "default", usage, quota, persisted: false }],
    totalUsage: usage,
  };
}

async function bucketQuota(
  name: string,
  bucket: StorageBucket,
  persisted: boolean,
): Promise<StorageBucketQuota> {
  const estimate = await bucket.estimate().catch(() => ({ usage: 0, quota: 0 }));
  return {
    name,
    usage: estimate.usage ?? 0,
    quota: estimate.quota ?? 0,
    persisted,
  };
}

async function initializeYulaStorageBuckets(): Promise<YulaStorageStatus> {
  const storageBuckets = getStorageBuckets();
  if (!storageBuckets) return defaultStorageStatus();

  try {
    const reportsBucket = await storageBuckets.open("yula-reports-opfs", { persisted: true });
    const ragBucket = await storageBuckets.open("yula-rag-vectors", { persisted: true });
    const cacheBucket = await storageBuckets.open("yula-ai-cache", {
      expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });

    const persistedBuckets = [reportsBucket, ragBucket];
    await Promise.all(
      persistedBuckets.map((bucket) =>
        bucket.setPersisted ? bucket.setPersisted(true).catch(() => undefined) : undefined,
      ),
    );

    const [reports, rag, cache] = await Promise.all([
      bucketQuota("yula-reports-opfs", reportsBucket, (await reportsBucket.persisted?.()) ?? true),
      bucketQuota("yula-rag-vectors", ragBucket, (await ragBucket.persisted?.()) ?? true),
      bucketQuota("yula-ai-cache", cacheBucket, false),
    ]);
    const buckets = [reports, rag, cache];
    const totalUsage = buckets.reduce((total, bucket) => total + bucket.usage, 0);

    console.info(
      `🤖 [Storage Buckets] 3 Isolated Storage Buckets Ready (Total Usage: ${(totalUsage / 1024 / 1024).toFixed(2)} MB).`,
      buckets,
    );

    return { hasBucketSupport: true, buckets, totalUsage };
  } catch {
    // Some Chromium embeddings expose the API but reject bucket creation.
    // Default storage remains fully functional in that environment.
    return defaultStorageStatus();
  }
}

/** Yula veri depolarını Chrome Storage Buckets API ile izole eder. */
export function initYulaStorageBuckets(): Promise<YulaStorageStatus> {
  initialization ??= initializeYulaStorageBuckets();
  return initialization;
}
