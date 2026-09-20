/**
 * Compact relative time formatter for IDE sidebar (e.g. 2m, 4h, 1d, 2w).
 */
export function formatTimeAgo(timestamp: number): string {
  const diffMs = Math.max(0, Date.now() - timestamp);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffWeek = Math.floor(diffDay / 7);

  if (diffMin < 1) return "now";
  if (diffHour < 1) return `${diffMin}m`;
  if (diffDay < 1) return `${diffHour}h`;
  if (diffWeek < 1) return `${diffDay}d`;
  return `${diffWeek}w`;
}
