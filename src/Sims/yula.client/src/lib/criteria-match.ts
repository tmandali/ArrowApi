/**
 * find_matching_report kriter normalizasyon + eşleşme mantığı (saf, import zincirsiz).
 * sirketKod aynen korunur (lowercase yok); göreli tarih genişletmesi dışarıdan verilen
 * resolver ile yapılır.
 */

/** Normalize a single criteria value: trim strings, expand relative dates. */
export function normalizeCriteriaValue(
  value: unknown,
  resolveDate?: (val: string) => string,
): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  try {
    return resolveDate ? resolveDate(trimmed) : trimmed;
  } catch {
    return trimmed;
  }
}

/** Normalize a criteria object for comparison (sirketKod as-is, no lowercase). */
export function normalizeCriteria(
  criteria: Record<string, unknown>,
  resolveDate?: (val: string) => string,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(criteria ?? {})) {
    out[k] = normalizeCriteriaValue(v, resolveDate);
  }
  return out;
}

function stableCriteriaString(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableCriteriaString).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableCriteriaString(obj[k])}`)
    .join(",")}}`;
}

/** Requested criteria match stored request when every requested key equals stored value. */
export function isCriteriaMatch(
  requested: Record<string, unknown>,
  stored: Record<string, unknown>,
): boolean {
  const keys = Object.keys(requested).filter(
    (k) => requested[k] !== undefined && requested[k] !== "",
  );
  if (keys.length === 0) return false;
  for (const k of keys) {
    if (!(k in stored)) return false;
    if (stableCriteriaString(stored[k]) !== stableCriteriaString(requested[k]))
      return false;
  }
  return true;
}
