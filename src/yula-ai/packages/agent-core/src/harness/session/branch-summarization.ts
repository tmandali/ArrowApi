import type { SessionBranchManager } from './session-branch';

export interface BranchSummary {
  sourceBranchName: string;
  targetBranchName: string;
  checkpointCount: number;
  changedKeys: string[];
  summaryText: string;
  latestRoute?: string;
  createdAt: number;
  checkpoints: {
    id: string;
    label: string;
    timestamp: number;
    route?: string;
  }[];
}

/**
 * Generates a structured summary of a branch relative to a target/base branch.
 * Enables cross-branch context bridge without loss of exploratory work.
 * Reference: Reference-Pi branch-summarization.ts
 */
export function generateBranchSummary(
  manager: SessionBranchManager,
  sourceBranchName: string,
  targetBranchName = 'main'
): BranchSummary {
  const diff = manager.diffBranches(targetBranchName, sourceBranchName);
  const checkpoints = diff.targetOnlyCheckpoints;
  const changedKeys = diff.stateDiffSummary.changedKeys;
  const latestCp = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1] : undefined;

  let summaryText = '';
  if (checkpoints.length === 0) {
    summaryText = `'${sourceBranchName}' dalında '${targetBranchName}' dalına kıyasla yeni bir işlem bulunmuyor.`;
  } else {
    const stepLabels = checkpoints.map((c) => c.label).join(' ➔ ');
    const keysText =
      changedKeys.length > 0
        ? `Etkilenen durum anahtarları: [${changedKeys.join(', ')}].`
        : 'Durum parametrelerinde kalıcı fark kaydedilmedi.';
    summaryText = `'${sourceBranchName}' dalında ${checkpoints.length} işlem gerçekleştirildi: (${stepLabels}). ${keysText}`;
  }

  return {
    sourceBranchName,
    targetBranchName,
    checkpointCount: checkpoints.length,
    changedKeys,
    summaryText,
    latestRoute: latestCp?.snapshot.route,
    createdAt: Date.now(),
    checkpoints: checkpoints.map((c) => ({
      id: c.id,
      label: c.label,
      timestamp: c.timestamp,
      route: c.snapshot.route,
    })),
  };
}

/**
 * Formats a BranchSummary into a structured markdown context string
 * suitable for injection into system prompt or agent chat history.
 */
export function formatBranchSummaryAsContext(summary: BranchSummary): string {
  return [
    `[🌿 Yan Dal Keşif Özeti: ${summary.sourceBranchName} ➔ ${summary.targetBranchName}]`,
    `- İşlem Sayısı: ${summary.checkpointCount}`,
    `- Etkilenen Alanlar: ${summary.changedKeys.length > 0 ? summary.changedKeys.join(', ') : 'Değişiklik yok'}`,
    `- Son Ekran Rotası: ${summary.latestRoute || '/'}`,
    `- Açıklama: ${summary.summaryText}`,
  ].join('\n');
}
