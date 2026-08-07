import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020"
import addFormats from "ajv-formats"
import type {
  CriteriaFieldDef,
  CriteriaFieldError,
  CriteriaFilterRow,
  CriteriaValidationResult,
  JsonSchemaObject,
} from "../types"
import { isValidCompactDate } from "./compact-date"
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

function getValidator(schema: JsonSchemaObject): ValidateFunction {
  const cleaned = stripExtensionKeywords(schema)
  const cached = compileCache.get(schema)
  if (cached) return cached

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
  return fields.find((field) => field.key === fieldKey)?.title || fieldKey
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
    const value = instance[field.key]
    if (value === undefined || value === null || value === "") continue

    if (
      typeof value === "object" &&
      !Array.isArray(value) &&
      value !== null &&
      "from" in value
    ) {
      const range = value as { from?: unknown; to?: unknown }
      const from = String(range.from ?? "")
      const to = String(range.to ?? "")
      if (!isValidCompactDate(from) || !isValidCompactDate(to)) {
        errors.push({
          fieldKey: field.key,
          message: `${field.title}: invalid date`,
          keyword: "format",
        })
      }
      continue
    }

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

  const instance = Array.isArray(rowsOrInstance)
    ? rowsToCriteriaInstance(rowsOrInstance, resolvedFields)
    : { ...rowsOrInstance }

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
  }
}
