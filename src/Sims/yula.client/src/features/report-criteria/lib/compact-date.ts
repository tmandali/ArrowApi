/** YYYYMMDD calendar validation and range-split helpers. */

export function rangeBoundKeys(fieldKey: string): {
  fromKey: string
  toKey: string
} {
  return {
    fromKey: `from_${fieldKey}`,
    toKey: `to_${fieldKey}`,
  }
}

export function isValidCompactDate(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false

  let year: number
  let month: number
  let day: number

  if (/^\d{8}$/.test(trimmed)) {
    year = Number(trimmed.slice(0, 4))
    month = Number(trimmed.slice(4, 6)) - 1
    day = Number(trimmed.slice(6, 8))
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split("-")
    year = Number(parts[0])
    month = Number(parts[1]) - 1
    day = Number(parts[2])
  } else if (/^\d{4}\/\d{2}\/\d{2}$/.test(trimmed)) {
    const parts = trimmed.split("/")
    year = Number(parts[0])
    month = Number(parts[1]) - 1
    day = Number(parts[2])
  } else if (/^\d{2}\.\d{2}\.\d{4}$/.test(trimmed)) {
    const parts = trimmed.split(".")
    day = Number(parts[0])
    month = Number(parts[1]) - 1
    year = Number(parts[2])
  } else {
    return false
  }

  const date = new Date(year, month, day)
  return (
    !Number.isNaN(date.getTime()) &&
    date.getFullYear() === year &&
    date.getMonth() === month &&
    date.getDate() === day
  )
}

function pad2(value: number): string {
  return String(value).padStart(2, "0")
}

/** Add days to a YYYYMMDD or YYYY-MM-DD token (for exclusive range end / full-day coverage). */
export function addDaysToCompactDate(
  value: string,
  days: number
): string | undefined {
  if (!isValidCompactDate(value)) return undefined
  const trimmed = value.trim()
  let year: number
  let month: number
  let day: number

  if (/^\d{8}$/.test(trimmed)) {
    year = Number(trimmed.slice(0, 4))
    month = Number(trimmed.slice(4, 6)) - 1
    day = Number(trimmed.slice(6, 8))
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split("-")
    year = Number(parts[0])
    month = Number(parts[1]) - 1
    day = Number(parts[2])
  } else {
    const d = new Date(trimmed)
    if (Number.isNaN(d.getTime())) return undefined
    year = d.getFullYear()
    month = d.getMonth()
    day = d.getDate()
  }

  const date = new Date(year, month, day)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
}

/** Split a cell value with the given separator into [from, to]. */
export function splitRangeCellValue(
  value: string,
  separator: string
): { from: string; to: string } {
  const trimmed = value.trim()
  const index = trimmed.indexOf(separator)
  if (index < 0) {
    return { from: trimmed, to: trimmed }
  }
  const from = trimmed.slice(0, index).trim()
  const to = trimmed.slice(index + separator.length).trim() || from
  return { from, to }
}

/** Validate a date cell: YYYYMMDD or left{sep}right with real calendar days. */
export function isValidCompactDateCellValue(
  value: string,
  separator?: string
): boolean {
  const trimmed = value.trim()
  if (!trimmed) return true

  if (separator && trimmed.includes(separator)) {
    const { from, to } = splitRangeCellValue(trimmed, separator)
    if (!from || !to) return false
    return isValidCompactDate(from) && isValidCompactDate(to)
  }

  return isValidCompactDate(trimmed)
}
