export interface RetryPolicy {
  maxAttempts?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  signal?: AbortSignal;
}

/**
 * Pi-Style Exponential Backoff & Retry
 * Reference: earendil-works/pi/packages/agent/src/harness/runtime/drive/retry.ts
 */
export async function retryWithBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  policy: RetryPolicy = {}
): Promise<T> {
  const maxAttempts = policy.maxAttempts ?? policy.maxRetries ?? 3;
  const baseDelayMs = policy.baseDelayMs ?? policy.initialDelayMs ?? 300;
  const multiplier = policy.backoffMultiplier ?? 2;
  const maxDelayMs = policy.maxDelayMs ?? 4000;
  const signal = policy.signal;

  let attempt = 0;
  while (true) {
    attempt++;
    if (signal?.aborted) {
      throw new Error(signal.reason || 'Operasyon iptal edildi');
    }

    try {
      return await operation(attempt);
    } catch (err: any) {
      if (attempt >= maxAttempts) {
        throw err;
      }

      // Exponential backoff + jitter
      const delay = Math.min(
        maxDelayMs,
        baseDelayMs * Math.pow(2, attempt - 1) + Math.random() * 100
      );

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, delay);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            reject(new Error(signal.reason || 'İptal edildi'));
          },
          { once: true }
        );
      });
    }
  }
}
