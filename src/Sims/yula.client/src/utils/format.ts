/** Binlik ayraçlı sayı biçimlendirme (örn. `1_000_000` → `1,000,000`). */
export function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—"
  return Math.trunc(value).toLocaleString("en-US")
}

/** `formatCount` + "rows" etiketi (örn. `1,000,000 rows`). */
export function formatRows(value: number | null | undefined): string {
  return `${formatCount(value)} rows`
}

/** Byte değerini okunabilir boyuta dönüştürür (örn. `1024` → `1.0 KB`, `1048576` → `1.0 MB`). */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / Math.pow(1024, i)
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

/**
 * Epoch-ms tarih biçimlendirme (örn. `2026-09-10`). UTC tabanlıdır; SSR ile
 * istemci aynı dizgiyi üretir (hydration güvenli).
 */
export function formatMetaDate(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "—"
  const d = new Date(value)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

