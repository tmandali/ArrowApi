/** Binlik ayraçlı sayı biçimlendirme (örn. `1_000_000` → `1,000,000`). */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return Math.trunc(value).toLocaleString("en-US")
}

/** `formatCount` + "rows" etiketi (örn. `1,000,000 rows`). */
export function formatRows(value: number | null | undefined): string {
  return `${formatCount(value)} rows`
}
