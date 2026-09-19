export interface TruncationOptions {
  maxLines?: number;
  maxBytes?: number;
}

export interface TruncationResult {
  content: string;
  truncated: boolean;
  truncatedBy: 'lines' | 'bytes' | null;
  originalLines: number;
  originalBytes: number;
}

export const DEFAULT_MAX_LINES = 100;
export const DEFAULT_MAX_BYTES = 15 * 1024; // 15 KB

/**
 * Pi Dual-Bound Output Truncation (Satır ve Bayt Çift Sınırı)
 * Reference: earendil-works/pi/packages/agent/src/harness/utils/truncate.ts
 */
export function truncateContent(
  rawContent: string | object,
  options?: TruncationOptions
): TruncationResult {
  const maxLines = options?.maxLines ?? DEFAULT_MAX_LINES;
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;

  const contentStr =
    typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent, null, 2);

  const lines = contentStr.split('\n');
  const originalLines = lines.length;
  const originalBytes = new TextEncoder().encode(contentStr).length;

  let truncated = false;
  let truncatedBy: 'lines' | 'bytes' | null = null;
  let resultLines = lines;

  // 1. Satır Sınırı Kontrolü
  if (resultLines.length > maxLines) {
    resultLines = resultLines.slice(0, maxLines);
    truncated = true;
    truncatedBy = 'lines';
  }

  // 2. Bayt Sınırı Kontrolü
  let joined = resultLines.join('\n');
  let currentBytes = new TextEncoder().encode(joined).length;

  if (currentBytes > maxBytes) {
    while (resultLines.length > 1 && currentBytes > maxBytes) {
      resultLines.pop();
      joined = resultLines.join('\n');
      currentBytes = new TextEncoder().encode(joined).length;
    }
    truncated = true;
    truncatedBy = 'bytes';
  }

  if (truncated) {
    const omittedLines = originalLines - resultLines.length;
    const summaryNotice = `\n... [Pi Token Guard: ${omittedLines} satır / ${originalBytes - currentBytes} bayt içerik bağlam sınırını korumak için kesildi] ...`;
    return {
      content: resultLines.join('\n') + summaryNotice,
      truncated: true,
      truncatedBy,
      originalLines,
      originalBytes,
    };
  }

  return {
    content: contentStr,
    truncated: false,
    truncatedBy: null,
    originalLines,
    originalBytes,
  };
}
