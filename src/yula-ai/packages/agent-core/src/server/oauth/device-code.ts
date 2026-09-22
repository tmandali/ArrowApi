/**
 * RFC 8628 OAuth 2.0 Device Authorization Grant Polling.
 * Ported from @earendil-works/pi-ai.
 */

const CANCEL_MESSAGE = 'Login cancelled';
const TIMEOUT_MESSAGE = 'Device flow timed out';
const SLOW_DOWN_TIMEOUT_MESSAGE =
  'Device flow timed out after one or more slow_down responses. Please check system clock and try again.';
const MINIMUM_INTERVAL_MS = 1000;
const DEFAULT_POLL_INTERVAL_SECONDS = 5;
const SLOW_DOWN_INTERVAL_INCREMENT_MS = 5000;

export function abortableSleep(ms: number, signal?: AbortSignal, cancelMessage: string = CANCEL_MESSAGE): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error(cancelMessage));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error(cancelMessage));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export type DeviceCodePollResult<T> =
  | { status: 'complete'; value: T }
  | { status: 'failed'; message: string }
  | { status: 'slow_down'; intervalSeconds?: number }
  | { status: 'pending' };

export interface PollOAuthDeviceCodeOptions<T> {
  expiresInSeconds?: number;
  intervalSeconds?: number;
  waitBeforeFirstPoll?: boolean;
  signal?: AbortSignal;
  poll: () => Promise<DeviceCodePollResult<T>>;
}

export async function pollOAuthDeviceCodeFlow<T>(options: PollOAuthDeviceCodeOptions<T>): Promise<T> {
  const deadline =
    typeof options.expiresInSeconds === 'number'
      ? Date.now() + options.expiresInSeconds * 1000
      : Number.POSITIVE_INFINITY;

  let intervalMs = Math.max(
    MINIMUM_INTERVAL_MS,
    Math.floor((options.intervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS) * 1000),
  );
  let slowDownResponses = 0;

  if (options.waitBeforeFirstPoll) {
    const remainingMs = deadline - Date.now();
    if (remainingMs > 0) {
      await abortableSleep(Math.min(intervalMs, remainingMs), options.signal, CANCEL_MESSAGE);
    }
  }

  while (Date.now() < deadline) {
    if (options.signal?.aborted) {
      throw new Error(CANCEL_MESSAGE);
    }

    const result = await options.poll();

    if (result.status === 'complete') {
      return result.value;
    }
    if (result.status === 'failed') {
      throw new Error(result.message);
    }
    if (result.status === 'slow_down') {
      slowDownResponses += 1;
      intervalMs =
        typeof result.intervalSeconds === 'number' &&
        Number.isFinite(result.intervalSeconds) &&
        result.intervalSeconds > 0
          ? Math.max(MINIMUM_INTERVAL_MS, Math.floor(result.intervalSeconds * 1000))
          : Math.max(MINIMUM_INTERVAL_MS, intervalMs + SLOW_DOWN_INTERVAL_INCREMENT_MS);
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await abortableSleep(Math.min(intervalMs, remainingMs), options.signal, CANCEL_MESSAGE);
  }

  throw new Error(slowDownResponses > 0 ? SLOW_DOWN_TIMEOUT_MESSAGE : TIMEOUT_MESSAGE);
}
