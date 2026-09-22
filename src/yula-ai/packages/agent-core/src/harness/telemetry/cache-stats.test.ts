import { describe, it, expect, beforeEach } from 'vitest';
import { PromptCacheTracker, PROMPT_CACHE_TTL_MS } from './cache-stats';

describe('Prompt Cache Stats & Savings Engine', () => {
  let tracker: PromptCacheTracker;

  beforeEach(() => {
    tracker = new PromptCacheTracker();
  });

  it('calculates cache hit ratio and estimated savings accurately', () => {
    const baseTime = 1000000;

    tracker.recordTurn({
      turnIndex: 1,
      promptTokens: 4000,
      cacheReadTokens: 0,
      cacheWriteTokens: 4000,
      timestamp: baseTime,
    });

    tracker.recordTurn({
      turnIndex: 2,
      promptTokens: 6000,
      cacheReadTokens: 4000, // 4000 read from cache!
      timestamp: baseTime + 30000, // 30s later (well within 5min TTL)
    });

    const metrics = tracker.getMetrics();
    expect(metrics.totalPromptTokens).toBe(10000);
    expect(metrics.totalCacheReadTokens).toBe(4000);
    expect(metrics.cacheHitRatio).toBe(40); // 4000 / 10000 = 40%
    expect(metrics.estimatedSavingsUsd).toBeGreaterThan(0);
    expect(metrics.ttlExpirationsCount).toBe(0);
  });

  it('detects cache TTL expiration when idle gap exceeds 5 minutes', () => {
    const baseTime = 1000000;

    tracker.recordTurn({
      turnIndex: 1,
      promptTokens: 5000,
      cacheReadTokens: 0,
      timestamp: baseTime,
    });

    // 6 minutes later -> TTL expired!
    tracker.recordTurn({
      turnIndex: 2,
      promptTokens: 5000,
      cacheReadTokens: 0,
      timestamp: baseTime + PROMPT_CACHE_TTL_MS + 60000,
    });

    const metrics = tracker.getMetrics();
    expect(metrics.ttlExpirationsCount).toBe(1);
  });

  it('resets metrics cleanly', () => {
    tracker.recordTurn({
      turnIndex: 1,
      promptTokens: 1000,
      cacheReadTokens: 500,
    });

    tracker.reset();
    const metrics = tracker.getMetrics();
    expect(metrics.totalPromptTokens).toBe(0);
    expect(metrics.totalCacheReadTokens).toBe(0);
    expect(metrics.cacheHitRatio).toBe(0);
  });
});
