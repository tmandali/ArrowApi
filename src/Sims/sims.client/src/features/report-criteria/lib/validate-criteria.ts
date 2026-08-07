import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020"
import addFormats from "ajv-formats"
import type {
  CriteriaFieldDef,
  CriteriaFieldError,
  CriteriaFilterRow,
  CriteriaValidationResult,
  JsonSchemaObject,
} from "../types"
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

function mapAjvErrors(errors: ErrorObject[] | null | undefined): CriteriaFieldError[] {
  if (!errors?.length) return []

  return errors.map((error) => {
    const fieldKey = topLevelFieldKey(error)
    const message =
      error.message && fieldKey
        ? `${fieldKey}: ${error.message}`
        : error.message || error.keyword || "Validation error"

    return {
      fieldKey,
      message,
      keyword: error.keyword,
    }
  })
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
  const valid = validate(instance) as boolean

  return {
    valid,
    instance,
    errors: mapAjvErrors(validate.errors),
    ajvErrors: validate.errors,
  }
}
