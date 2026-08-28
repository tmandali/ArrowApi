import type {
  CriteriaFieldDef,
  CriteriaFieldKind,
  CriteriaSelectionMode,
  JsonSchemaObject,
  JsonSchemaProperty,
  ParsedCriteriaSchema,
} from "../types"
import { readJobEndpoint } from "./job-endpoint"

function asTypeList(type: string | string[] | undefined): string[] {
  if (!type) return []
  return Array.isArray(type) ? type : [type]
}

function stringifyEnum(values: unknown[] | undefined): string[] | undefined {
  if (!values?.length) return undefined
  return values.map((value) => String(value))
}

function defaultLookupKeys(prop: JsonSchemaProperty): {
  lookupValueKey: string
  lookupLabelKeys: string[]
  lookupFields: { key: string; title: string }[]
} {
  const properties = prop.properties ?? {}
  const keys = Object.keys(properties)
  const lookupFields = keys.map((key) => ({
    key,
    title: properties[key]?.title?.trim() || key,
  }))
  // First schema property is always the identity key; default display is the next field if any.
  const lookupValueKey = keys[0] ?? "id"
  const lookupLabelKeys =
    keys.length > 1 ? [keys[1]!] : keys.length > 0 ? [keys[0]!] : ["id"]
  return { lookupValueKey, lookupLabelKeys, lookupFields }
}

function resolveSelectionMode(
  prop: JsonSchemaProperty,
  types: string[]
): CriteriaSelectionMode {
  // Date fields use a single cell value (range encoded as from..to), never multi-select.
  if (prop.format === "date") return "single"
  const explicit = prop["x-selection"]
  if (explicit === "multiple" || explicit === "single") return explicit
  if (prop["x-multiple"] === true) return "multiple"
  if (types.includes("array")) return "multiple"
  return "single"
}

function resolveItemSchema(prop: JsonSchemaProperty): JsonSchemaProperty {
  const items = prop.items
  if (items && !Array.isArray(items) && typeof items === "object") {
    return items
  }
  return prop
}

function stringifyDefaultValue(
  value: unknown,
  selectionMode: CriteriaSelectionMode
): string | number | undefined {
  if (value === undefined) return undefined
  if (selectionMode === "multiple" && Array.isArray(value)) {
    return value.map(String).join(", ")
  }
  if (typeof value === "number") return value
  return String(value)
}

function collectPatterns(
  prop: JsonSchemaProperty,
  itemSchema: JsonSchemaProperty
): string[] | undefined {
  const patterns: string[] = []

  const push = (value: string | undefined) => {
    if (value && !patterns.includes(value)) patterns.push(value)
  }

  push(prop.pattern)
  push(itemSchema.pattern)

  for (const entry of prop.anyOf ?? []) {
    push(entry.pattern)
  }
  for (const entry of itemSchema.anyOf ?? []) {
    push(entry.pattern)
  }

  return patterns.length > 0 ? patterns : undefined
}

function parseProperty(
  key: string,
  prop: JsonSchemaProperty,
  requiredKeys: Set<string>
): CriteriaFieldDef {
  const title = prop.title?.trim() || key
  const description = prop.description
  const required = requiredKeys.has(key)
  const types = asTypeList(prop.type)
  const selectionMode = resolveSelectionMode(prop, types)
  const itemSchema = resolveItemSchema(prop)
  const itemTypes = asTypeList(itemSchema.type)
  const enumValues =
    stringifyEnum(itemSchema.enum) ?? stringifyEnum(prop.enum)
  const patterns = collectPatterns(prop, itemSchema)
  const format = prop.format ?? itemSchema.format
  const rangeSplitRaw = prop["x-range-split"] ?? itemSchema["x-range-split"]
  const rangeSplit =
    typeof rangeSplitRaw === "string" && rangeSplitRaw.length > 0
      ? rangeSplitRaw
      : undefined

  const base = {
    key,
    title,
    required,
    description,
    selectionMode,
    patterns,
    format,
    rangeSplit,
  }

  if (enumValues?.length) {
    return {
      ...base,
      kind: "enum" satisfies CriteriaFieldKind,
      enumValues,
      defaultValue: stringifyDefaultValue(prop.default, selectionMode),
    }
  }

  if (
    format !== "date" &&
    (itemTypes.includes("object") ||
      types.includes("object") ||
      itemSchema["x-datasource"] ||
      prop["x-datasource"])
  ) {
    const source = itemSchema["x-datasource"] ? itemSchema : prop
    const { lookupValueKey, lookupLabelKeys, lookupFields } =
      defaultLookupKeys(source)
    return {
      ...base,
      kind: "objectLookup",
      lookupItems: source["x-datasource"] ?? prop["x-datasource"] ?? [],
      lookupValueKey,
      lookupLabelKeys,
      lookupFields,
      defaultValue: stringifyDefaultValue(prop.default, selectionMode),
    }
  }

  if (
    itemTypes.includes("boolean") ||
    types.includes("boolean")
  ) {
    return {
      ...base,
      kind: "boolean",
      defaultValue: stringifyDefaultValue(prop.default, selectionMode),
    }
  }

  if (
    itemTypes.includes("number") ||
    itemTypes.includes("integer") ||
    types.includes("number") ||
    types.includes("integer")
  ) {
    const defaultValue =
      typeof prop.default === "number"
        ? prop.default
        : stringifyDefaultValue(prop.default, selectionMode)
    return {
      ...base,
      kind: "number",
      defaultValue,
      minimum: itemSchema.minimum ?? prop.minimum,
      maximum: itemSchema.maximum ?? prop.maximum,
    }
  }

  return {
    ...base,
    kind: "string",
    defaultValue: stringifyDefaultValue(prop.default, selectionMode),
  }
}

export function parseCriteriaSchema(
  schema: JsonSchemaObject
): ParsedCriteriaSchema {
  const properties = schema.properties ?? {}
  const requiredKeys = new Set(schema.required ?? [])
  const fields = Object.entries(properties).map(([key, prop]) =>
    parseProperty(key, prop, requiredKeys)
  )

  return {
    title: schema.title?.trim() || "Report Criteria",
    description: schema.description?.trim() || undefined,
    fields,
    rawSchema: schema,
    jobEndpoint: readJobEndpoint(schema),
  }
}
