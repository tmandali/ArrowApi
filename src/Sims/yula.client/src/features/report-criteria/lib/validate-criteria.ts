import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020"
import addFormats from "ajv-formats"
import type {
  CriteriaFieldDef,
  CriteriaFieldError,
  CriteriaFilterRow,
  CriteriaValidationResult,
  JsonSchemaObject,
  JsonSchemaProperty,
} from "../types"
import { isValidCompactDate, rangeBoundKeys } from "./compact-date"
import { readJobEndpoint } from "./job-endpoint"
import { parseCriteriaSchema } from "./parse-criteria-schema"
import { rowsToCriteriaInstance } from "./rows-to-criteria-instance"
import { stripExtensionKeywords } from "./strip-extension-keywords"

const ajv = new Ajv2020({
  allErrors: true,
  useDefaults: true,
  strict: false,
})
addFormats(ajv)

const compileCache = new WeakMap<object, ValidateFunction>()

/** Expand `x-range-split` fields into `from_*` / `to_*` for AJV wire shape. */
function expandRangeSplitSchema(schema: JsonSchemaObject): JsonSchemaObject {
  const properties = { ...(schema.properties ?? {}) }
  const required = [...(schema.required ?? [])]
  const nextRequired: string[] = []

  for (const key of required) {
    const prop = properties[key]
    const split = prop?.["x-range-split"]
    if (typeof split === "string" && split.length > 0) {
      const { fromKey, toKey } = rangeBoundKeys(key)
      nextRequired.push(fromKey, toKey)
    } else {
      nextRequired.push(key)
    }
  }

  for (const [key, prop] of Object.entries(schema.properties ?? {})) {
    const split = prop["x-range-split"]
    if (typeof split !== "string" || split.length === 0) continue

    const { fromKey, toKey } = rangeBoundKeys(key)
    const bound: JsonSchemaProperty = {
      type: "string",
      ...(prop.format === "date"
        ? { format: "date" }
        : prop.pattern
          ? { pattern: prop.pattern }
          : {}),
    }
    delete properties[key]
    properties[fromKey] = {
      ...bound,
      title: `${prop.title?.trim() || key} (from)`,
    }
    properties[toKey] = {
      ...bound,
      title: `${prop.title?.trim() || key} (to)`,
    }
  }

  return {
    ...schema,
    properties,
    required: nextRequired.length > 0 ? nextRequired : undefined,
  }
}

function getValidator(schema: JsonSchemaObject): ValidateFunction {
  const cached = compileCache.get(schema)
  if (cached) return cached

  const expanded = expandRangeSplitSchema(schema)
  const cleaned = stripExtensionKeywords(expanded)
  const validate = ajv.compile(cleaned)
  compileCache.set(schema, validate)
  return validate
}

function topLevelFieldKey(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missing = (error.params as { missingProperty?: string })
      .missingProperty
    if (missing) return missing
  }

  const path = error.instancePath.replace(/^\//, "")
  if (!path) return ""
  return path.split("/")[0] ?? ""
}

function fieldLabel(fields: CriteriaFieldDef[], fieldKey: string): string {
  if (!fieldKey) return ""
  const direct = fields.find((field) => field.key === fieldKey)
  if (direct) return direct.title

  if (fieldKey.startsWith("from_") || fieldKey.startsWith("to_")) {
    const baseKey = fieldKey.replace(/^from_|^to_/, "")
    return fields.find((field) => field.key === baseKey)?.title || fieldKey
  }
  return fieldKey
}

function formatAjvError(
  error: ErrorObject,
  fields: CriteriaFieldDef[]
): CriteriaFieldError {
  const fieldKey = topLevelFieldKey(error)
  const label = fieldLabel(fields, fieldKey)

  switch (error.keyword) {
    case "required":
      return {
        fieldKey,
        message: label ? `${label} is required` : "A required field is missing",
        keyword: error.keyword,
      }
    case "type":
      return {
        fieldKey,
        message: label
          ? `${label} has an invalid type`
          : "A field has an invalid type",
        keyword: error.keyword,
      }
    case "pattern":
    case "format":
      return {
        fieldKey,
        message: label
          ? `${label} has an invalid format`
          : "A field has an invalid format",
        keyword: error.keyword,
      }
    case "enum":
      return {
        fieldKey,
        message: label
          ? `${label} must be one of the allowed values`
          : "Value is not allowed",
        keyword: error.keyword,
      }
    case "minimum":
    case "maximum":
    case "minLength":
    case "maxLength":
    case "minItems":
    case "maxItems":
      return {
        fieldKey,
        message:
          label && error.message
            ? `${label}: ${error.message}`
            : error.message || "Value is out of range",
        keyword: error.keyword,
      }
    default: {
      const _exhaustiveCheck: string = error.keyword
      void _exhaustiveCheck
      return {
        fieldKey,
        message:
          label && error.message
            ? `${label}: ${error.message}`
            : error.message || error.keyword || "Validation error",
        keyword: error.keyword,
      }
    }
  }
}

function mapAjvErrors(
  errors: ErrorObject[] | null | undefined,
  fields: CriteriaFieldDef[]
): CriteriaFieldError[] {
  if (!errors?.length) return []
  return errors.map((error) => formatAjvError(error, fields))
}

function validateInstanceDates(
  instance: Record<string, unknown>,
  fields: CriteriaFieldDef[]
): CriteriaFieldError[] {
  const errors: CriteriaFieldError[] = []

  for (const field of fields) {
    if (field.format !== "date") continue

    if (field.rangeSplit) {
      const { fromKey, toKey } = rangeBoundKeys(field.key)
      const from = instance[fromKey]
      const to = instance[toKey]
      if (from === undefined && to === undefined) continue
      if (
        !isValidCompactDate(String(from ?? "")) ||
        !isValidCompactDate(String(to ?? ""))
      ) {
        errors.push({
          fieldKey: field.key,
          message: `${field.title}: invalid date`,
          keyword: "format",
        })
      }
      continue
    }

    const value = instance[field.key]
    if (value === undefined || value === null || value === "") continue
    if (typeof value === "string" && !isValidCompactDate(value)) {
      errors.push({
        fieldKey: field.key,
        message: `${field.title}: invalid date`,
        keyword: "format",
      })
    }
  }

  return errors
}

export function validateCriteria(
  schema: JsonSchemaObject,
  rowsOrInstance: CriteriaFilterRow[] | Record<string, unknown>,
  fields?: CriteriaFieldDef[]
): CriteriaValidationResult {
  const resolvedFields = fields ?? parseCriteriaSchema(schema).fields

  let instance: Record<string, unknown>
  if (Array.isArray(rowsOrInstance)) {
    instance = rowsToCriteriaInstance(rowsOrInstance, resolvedFields)
  } else {
    // Nesne olarak gönderilen kriterleri (run_job / run_report criteria objesi)
    // rowsToCriteriaInstance ile rangeSplit (from_/to_) ve array tiplerine dönüştür
    const syntheticRows: CriteriaFilterRow[] = Object.entries(rowsOrInstance).map(
      ([name, value], idx) => ({
        id: `synthetic-${idx}`,
        selected: false,
        name,
        value: Array.isArray(value) ? value.map(String).join(",") : String(value ?? ""),
      })
    )
    instance = {
      ...rowsOrInstance,
      ...rowsToCriteriaInstance(syntheticRows, resolvedFields),
    }
  }

  const validate = getValidator(schema)
  const ajvValid = validate(instance) as boolean
  const dateErrors = validateInstanceDates(instance, resolvedFields)
  const errors = [
    ...mapAjvErrors(validate.errors, resolvedFields),
    ...dateErrors,
  ]

  return {
    valid: ajvValid && dateErrors.length === 0,
    instance,
    errors,
    ajvErrors: validate.errors,
    jobEndpoint: readJobEndpoint(schema),
  }
}
