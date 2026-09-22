import { describe, it, expect, beforeEach } from 'vitest';
import { SessionBranchManager } from './session-branch';
import { generateBranchSummary, formatBranchSummaryAsContext } from './branch-summarization';

describe('Branch Summarization Engine', () => {
  let manager: SessionBranchManager;

  beforeEach(() => {
    manager = new SessionBranchManager();
  });

  it('handles branch with no divergent checkpoints gracefully', () => {
    manager.checkpoint('Başlangıç', { store: 'Merkez' }, '/home');
    manager.fork('senaryo-b');

    const summary = generateBranchSummary(manager, 'senaryo-b', 'main');
    expect(summary.checkpointCount).toBe(0);
    expect(summary.changedKeys).toEqual([]);
    expect(summary.summaryText).toContain('yeni bir işlem bulunmuyor');
  });

  it('summarizes divergent exploratory checkpoints and identifies changed keys', () => {
    manager.checkpoint('Kriter Seçildi', { storeId: 'Kadıköy', discount: 0 }, '/criteria');

    // Fork a what-if simulation branch
    manager.fork('what-if-discount');
    manager.checkpoint('İskonto Simülasyonu', { storeId: 'Kadıköy', discount: 15 }, '/criteria');
    manager.checkpoint('Rapor Alındı', { storeId: 'Kadıköy', discount: 15, generated: true }, '/report');

    const summary = generateBranchSummary(manager, 'what-if-discount', 'main');

    expect(summary.sourceBranchName).toBe('what-if-discount');
    expect(summary.targetBranchName).toBe('main');
    expect(summary.checkpointCount).toBe(2);
    expect(summary.changedKeys).toContain('discount');
    expect(summary.changedKeys).toContain('generated');
    expect(summary.summaryText).toContain('what-if-discount');
    expect(summary.summaryText).toContain('İskonto Simülasyonu');
    expect(summary.summaryText).toContain('Rapor Alındı');
    expect(summary.latestRoute).toBe('/report');

    const contextMsg = formatBranchSummaryAsContext(summary);
    expect(contextMsg).toContain('🌿 Yan Dal Keşif Özeti: what-if-discount ➔ main');
    expect(contextMsg).toContain('İşlem Sayısı: 2');
    expect(contextMsg).toContain('discount, generated');
    expect(contextMsg).toContain('/report');
  });
});
