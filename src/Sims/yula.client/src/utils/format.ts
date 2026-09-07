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

