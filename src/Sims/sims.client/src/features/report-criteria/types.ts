export type CriteriaSelectionMode = "single" | "multiple"

export type JsonSchemaObject = {
  $schema?: string
  $id?: string
  title?: string
  description?: string
  type?: string | string[]
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  default?: unknown
  /**
   * Relative Arrow/API job path for validated criteria submit
   * (e.g. `/api/arrow/jobs/stock-balance`).
   */
  "x-job-endpoint"?: string
  [key: string]: unknown
}

export type JsonSchemaProperty = {
  type?: string | string[]
  title?: string
  description?: string
  format?: string
  enum?: unknown[]
  default?: unknown
  minimum?: number
  maximum?: number
  pattern?: string
  anyOf?: JsonSchemaProperty[]
  items?: JsonSchemaProperty | JsonSchemaProperty[]
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  "x-datasource"?: Record<string, unknown>[]
  /** UI selection mode. Prefer this or `type: "array"` for multiple. */
  "x-selection"?: CriteriaSelectionMode
  "x-multiple"?: boolean
  /**
   * When set (e.g. ".."), cell value may be `left{sep}right` and submit emits
   * `from_<key>` / `to_<key>` instead of the property key.
   */
  "x-range-split"?: string
  [key: string]: unknown
}

export type CriteriaFieldKind =
  | "string"
  | "number"
  | "enum"
  | "objectLookup"

export type CriteriaLookupField = {
  key: string
  title: string
}

export type CriteriaFieldDef = {
  key: string
  title: string
  required: boolean
  kind: CriteriaFieldKind
  selectionMode: CriteriaSelectionMode
  enumValues?: string[]
  description?: string
  defaultValue?: string | number
  /** JSON Schema string format (e.g. date). */
  format?: string
  /**
   * Separator for range cell values (from `x-range-split`).
   * When set, submit uses `from_<key>` / `to_<key>`.
   */
  rangeSplit?: string
  lookupItems?: Record<string, unknown>[]
  lookupLabelKeys?: string[]
  lookupValueKey?: string
  /** Available object properties that can be shown in lookup labels. */
  lookupFields?: CriteriaLookupField[]
  minimum?: number
  maximum?: number
  /** JSON Schema `pattern` and/or `anyOf[].pattern` values. */
  patterns?: string[]
}

export type CriteriaFilterRow = {
  id: string
  selected: boolean
  name: string
  value: string
}

export type CriteriaFieldError = {
  fieldKey: string
  message: string
  keyword?: string
}

export type CriteriaValidationResult = {
  valid: boolean
  instance: Record<string, unknown>
  errors: CriteriaFieldError[]
  ajvErrors: unknown[] | null | undefined
  /** From schema root `x-job-endpoint`, when present. */
  jobEndpoint?: string
}

export type ParsedCriteriaSchema = {
  title: string
  description?: string
  fields: CriteriaFieldDef[]
  rawSchema: JsonSchemaObject
  /** From schema root `x-job-endpoint`, when present. */
  jobEndpoint?: string
}

export type CriteriaComboboxOption = {
  value: string
  label: string
  /** Text used for typeahead filter (selected display field). */
  searchText?: string
}
