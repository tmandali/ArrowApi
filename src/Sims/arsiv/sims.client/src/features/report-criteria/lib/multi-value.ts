/** Split/join helpers for multiple selection values stored in a grid cell. */

export function splitMultiValue(value: string): string[] {
  if (!value.trim()) return []
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
}

export function joinMultiValue(values: string[]): string {
  return values.join(", ")
}

export function toggleMultiValue(current: string, option: string): string {
  const values = splitMultiValue(current)
  const exists = values.includes(option)
  const next = exists
    ? values.filter((value) => value !== option)
    : [...values, option]
  return joinMultiValue(next)
}
