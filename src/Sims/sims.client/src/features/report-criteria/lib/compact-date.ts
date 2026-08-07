/** YYYYMMDD calendar validation shared by grid + submit. */

export function isValidCompactDate(value: string): boolean {
  if (!/^\d{8}$/.test(value)) return false
  const year = Number(value.slice(0, 4))
  const month = Number(value.slice(4, 6)) - 1
  const day = Number(value.slice(6, 8))
  const date = new Date(year, month, day)
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
  )
}

/** Validate a cell date value: YYYYMMDD or YYYYMMDD..YYYYMMDD. */
export function isValidCompactDateCellValue(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true
  if (trimmed.includes("..")) {
    const [from = "", to = ""] = trimmed.split("..").map((part) => part.trim())
    if (!from || !to) return false
    return isValidCompactDate(from) && isValidCompactDate(to)
  }
  return isValidCompactDate(trimmed)
}
