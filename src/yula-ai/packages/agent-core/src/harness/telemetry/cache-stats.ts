/**
 * Prompt Cache Tracking & Financial Savings Analyzer
 * Reference: Reference-Pi cache-stats.ts
 *
 * Tracks Anthropic, OpenAI, and Azure OpenAI prompt cache performance:
 * - 5-minute cache TTL expiration detection
 * - Cache hit ratio (cached prompt tokens / total prompt tokens)
 * - Estimated financial savings based on cache read discount rates
 */

export const PROMPT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface CacheTurnRecord {
  turnIndex: number;
  timestamp: number;
  promptTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens?: number;
  model?: string;
}

export interface PromptCacheMetrics {
  totalPromptTokens: number;
  totalCacheReadTokens: number;
  totalCacheWriteTokens: number;
  cacheHitRatio: number; // 0 - 100%
  estimatedSavingsUsd: number;
  ttlExpirationsCount: number;
  lastRequestTimestamp: number;
  isCacheWarm: boolean;
}

export class PromptCacheTracker {
  private records: CacheTurnRecord[] = [];
  private ttlExpirationsCount = 0;
  private lastTimestamp = 0;

  // Average estimated cost: $2.50 per 1M input tokens, 50% discount on cache read ($1.25 savings per 1M)
  private savingsPerCacheTokenUsd = 0.00000125;

  recordTurn(record: Omit<CacheTurnRecord, 'timestamp'> & { timestamp?: number }): void {
    const ts = record.timestamp ?? Date.now();

    if (this.lastTimestamp > 0 && ts - this.lastTimestamp > PROMPT_CACHE_TTL_MS) {
      this.ttlExpirationsCount++;
    }

    this.lastTimestamp = ts;
    this.records.push({
      ...record,
      timestamp: ts,
    });
  }

  getMetrics(): PromptCacheMetrics {
    let totalPrompt = 0;
    let totalCacheRead = 0;
    let totalCacheWrite = 0;

    for (const r of this.records) {
      totalPrompt += r.promptTokens;
      totalCacheRead += r.cacheReadTokens;
      totalCacheWrite += r.cacheWriteTokens ?? 0;
    }

    const cacheHitRatio =
      totalPrompt > 0 ? Math.min(100, Math.round((totalCacheRead / totalPrompt) * 100)) : 0;
    const estimatedSavingsUsd = parseFloat((totalCacheRead * this.savingsPerCacheTokenUsd).toFixed(4));
    const now = Date.now();
    const isCacheWarm = this.lastTimestamp > 0 && now - this.lastTimestamp <= PROMPT_CACHE_TTL_MS;

    return {
      totalPromptTokens: totalPrompt,
      totalCacheReadTokens: totalCacheRead,
      totalCacheWriteTokens: totalCacheWrite,
      cacheHitRatio,
      estimatedSavingsUsd,
      ttlExpirationsCount: this.ttlExpirationsCount,
      lastRequestTimestamp: this.lastTimestamp,
      isCacheWarm,
    };
  }

  reset(): void {
    this.records = [];
    this.ttlExpirationsCount = 0;
    this.lastTimestamp = 0;
  }
}

export const promptCacheTracker = new PromptCacheTracker();
