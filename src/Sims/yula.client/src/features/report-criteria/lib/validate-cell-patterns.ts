import type { CriteriaFieldDef } from "../types"
import { isValidCompactDateCellValue } from "./compact-date"
import { splitMultiValue } from "./multi-value"

function toRegExp(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern)
  } catch {
    return null
  }
}

/** True when value satisfies at least one pattern (anyOf semantics). */
export function matchesPatterns(
  value: string,
  patterns: string[] | undefined
): boolean {
  if (!patterns?.length) return true
  if (value === "") return true

  return patterns.some((pattern) => {
    const regex = toRegExp(pattern)
    if (!regex) return false
    return regex.test(value)
  })
}

export function validateCellPatterns(
  field: CriteriaFieldDef | undefined,
  value: string
): { valid: boolean; message?: string } {
  if (!field) return { valid: true }
  if (value === "") return { valid: true }

  const parts =
    field.selectionMode === "multiple" ? splitMultiValue(value) : [value]

  for (const part of parts) {
    if (field.patterns?.length && !matchesPatterns(part, field.patterns)) {
      return {
        valid: false,
        message: `${field.title}: pattern mismatch`,
      }
    }

    if (
      field.format === "date" &&
      !isValidCompactDateCellValue(part, field.rangeSplit)
    ) {
      return {
        valid: false,
        message: `${field.title}: invalid date`,
      }
    }
  }

  return { valid: true }
}
