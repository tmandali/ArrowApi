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
  [key: string]: unknown
}

export type JsonSchemaProperty = {
  type?: string | string[]
  title?: string
  description?: string
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
  [key: string]: unknown
}

export type CriteriaFieldKind =
  | "string"
  | "number"
  | "enum"
  | "objectLookup"

export type CriteriaFieldDef = {
  key: string
  title: string
  required: boolean
  kind: CriteriaFieldKind
  selectionMode: CriteriaSelectionMode
  enumValues?: string[]
  description?: string
  defaultValue?: string | number
  lookupItems?: Record<string, unknown>[]
  lookupLabelKeys?: string[]
  lookupValueKey?: string
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
}

export type ParsedCriteriaSchema = {
  title: string
  description?: string
  fields: CriteriaFieldDef[]
  rawSchema: JsonSchemaObject
}

export type CriteriaComboboxOption = {
  value: string
  label: string
}
