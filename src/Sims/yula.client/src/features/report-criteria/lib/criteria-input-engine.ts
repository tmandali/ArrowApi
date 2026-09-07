import type { JsonSchemaObject, CriteriaFieldDef, CriteriaFilterRow } from "../types";
import { parseCriteriaSchema } from "./parse-criteria-schema";
import { isValidCompactDate, splitRangeCellValue } from "./compact-date";
import { resolveRelativeDateString } from "./apply-criteria-to-draft";
import { useDraftCriteriaStore } from "@/store/slices/draft-criteria-store";
import { rowsToCriteriaInstance } from "./rows-to-criteria-instance";
import { findReport } from "@/features/reports/report-registry";

export interface CriteriaFieldErrorDetail {
  field: string;
  fieldTitle: string;
  message: string;
  received?: unknown;
}

export interface CriteriaFieldWarningDetail {
  field: string;
  fieldTitle: string;
  message: string;
  suggestion?: string;
}

export interface CriteriaValidationReport {
  valid: boolean;
  scope: string;
  reportTitle: string;
  sanitizedCriteria: Record<string, unknown>;
  errors: CriteriaFieldErrorDetail[];
  warnings: CriteriaFieldWarningDetail[];
  summary: string;
}

/**
 * D365 / Business Central tarih sözdizimi kontrolü:
 * - Tekil tarih: '2026-08-18' veya '20260818'
 * - Çift taraflı aralık: '2026-08-01..2026-08-31'
 * - Açık uçlu aralık: '..2026-08-31' veya '2026-08-01..'
 */
function validateD365DateExpression(val: string): { valid: boolean; from?: string; to?: string; message?: string } {
  const trimmed = val.trim();
  if (!trimmed) return { valid: true };

  if (trimmed.includes("..")) {
    const { from, to } = splitRangeCellValue(trimmed, "..");
    const hasFrom = from.length > 0;
    const hasTo = to.length > 0 && to !== from;

    if (!hasFrom && !hasTo) {
      return { valid: false, message: "Aralık ('..') için en az bir başlangıç veya bitiş tarihi gereklidir." };
    }
    if (hasFrom && !isValidCompactDate(from)) {
      return { valid: false, message: `Başlangıç tarihi geçersiz: '${from}'. YYYY-MM-DD formatında olmalıdır.` };
    }
    if (hasTo && !isValidCompactDate(to)) {
      return { valid: false, message: `Bitiş tarihi geçersiz: '${to}'. YYYY-MM-DD formatında olmalıdır.` };
    }
    if (hasFrom && hasTo) {
      const dFrom = new Date(from.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
      const dTo = new Date(to.replace(/(\d{4})(\d{2})(\d{2})/, "$1-$2-$3"));
      if (dFrom > dTo) {
        return { valid: false, message: `Başlangıç tarihi (${from}), bitiş tarihinden (${to}) sonra olamaz.` };
      }
    }
    return { valid: true, from: hasFrom ? from : undefined, to: hasTo ? to : undefined };
  }

  if (!isValidCompactDate(trimmed)) {
    return { valid: false, message: `Tarih formatı geçersiz: '${trimmed}'. YYYY-MM-DD veya YYYYMMDD olmalıdır.` };
  }
  return { valid: true, from: trimmed, to: trimmed };
}

/**
 * D365 / Business Central sayısal ifade kontrolü:
 * - Tekil sayı: '100'
 * - Karşılaştırma: '>100', '>=50', '<200', '<=500', '<>0'
 * - Aralık: '100..200', '..500', '100..'
 * - Veya: '10|20|30'
 */
function validateD365NumericExpression(val: string | number): { valid: boolean; message?: string } {
  if (typeof val === "number") {
    return Number.isFinite(val) ? { valid: true } : { valid: false, message: "Geçerli bir sayı değil." };
  }
  const trimmed = String(val).trim();
  if (!trimmed) return { valid: true };

  // D365 'OR' listesi (10|20|30)
  if (trimmed.includes("|")) {
    const parts = trimmed.split("|");
    for (const part of parts) {
      const sub = validateD365NumericExpression(part);
      if (!sub.valid) return sub;
    }
    return { valid: true };
  }

  // D365 aralık ('100..200')
  if (trimmed.includes("..")) {
    const [fromStr, toStr] = trimmed.split("..");
    if (fromStr && isNaN(Number(fromStr))) {
      return { valid: false, message: `Aralık başlangıcı sayı olmalıdır: '${fromStr}'` };
    }
    if (toStr && isNaN(Number(toStr))) {
      return { valid: false, message: `Aralık bitişi sayı olmalıdır: '${toStr}'` };
    }
    if (fromStr && toStr && Number(fromStr) > Number(toStr)) {
      return { valid: false, message: `Aralık başlangıcı (${fromStr}), bitişinden (${toStr}) büyük olamaz.` };
    }
    return { valid: true };
  }

  // Karşılaştırma operatörleri: '>=100', '<=50', '>0', '<10', '<>0'
  const matchOp = trimmed.match(/^(>=|<=|>|<|<>|=)?\s*(-?\d+(\.\d+)?)$/);
  if (matchOp) {
    return { valid: true };
  }

  return { valid: false, message: `Sayısal değer veya D365 sayısal filtre ifadesi bekleniyor, alınan: '${trimmed}'` };
}

/**
 * Kriter girdilerini şemaya ve D365/BC kurallarına göre detaylı doğrular.
 */
export function validateCriteriaInput(
  schema: JsonSchemaObject,
  criteria: Record<string, unknown>,
  options: { partial?: boolean; scope?: string } = {}
): CriteriaValidationReport {
  const { fields } = parseCriteriaSchema(schema);
  const scope = options.scope || (schema["x-scope"] as string) || "unknown";
  const reportTitle = (schema.title as string) || scope;

  const errors: CriteriaFieldErrorDetail[] = [];
  const warnings: CriteriaFieldWarningDetail[] = [];
  const sanitized: Record<string, unknown> = {};

  const fieldMap = new Map<string, CriteriaFieldDef>();
  for (const field of fields) {
    fieldMap.set(field.key.toLowerCase(), field);
    fieldMap.set(field.key.toLowerCase().replace(/[^a-z0-9]/g, ""), field);
    fieldMap.set(field.title.toLowerCase(), field);
    fieldMap.set(field.title.toLowerCase().replace(/[^a-z0-9]/g, ""), field);
  }

  // 1. Verilen her kriter alanını denetle ve temizle
  for (const [rawKey, rawValue] of Object.entries(criteria)) {
    if (rawValue === undefined || rawValue === null) continue;
    const cleanKey = rawKey.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    const field = fieldMap.get(cleanKey) || fieldMap.get(rawKey.trim().toLowerCase());

    if (!field) {
      warnings.push({
        field: rawKey,
        fieldTitle: rawKey,
        message: `Şemada '${rawKey}' adında bir kriter alanı tanımlı değil.`,
        suggestion: `Kullanılabilir alanlar: ${fields.map((f) => f.key).join(", ")}`,
      });
      sanitized[rawKey] = rawValue;
      continue;
    }

    const fieldKey = field.key;
    const fieldTitle = field.title;

    // Tarih Alanları
    if (field.format === "date" || field.rangeSplit) {
      let dateStr = String(rawValue).trim();
      // Göreli tarih çözümleme (dün, bugün, geçen hafta vb.)
      const resolved = resolveRelativeDateString(dateStr);
      if (resolved !== dateStr) {
        warnings.push({
          field: fieldKey,
          fieldTitle,
          message: `'${dateStr}' ifadesi '${resolved}' olarak çözümlendi.`,
        });
        dateStr = resolved;
      }

      const dateValidation = validateD365DateExpression(dateStr);
      if (!dateValidation.valid) {
        errors.push({
          field: fieldKey,
          fieldTitle,
          message: dateValidation.message || "Geçersiz tarih formatı.",
          received: rawValue,
        });
      } else {
        sanitized[fieldKey] = dateStr;
      }
      continue;
    }

    // Sayısal Alanlar
    if (field.kind === "number") {
      const numValidation = validateD365NumericExpression(rawValue as string | number);
      if (!numValidation.valid) {
        errors.push({
          field: fieldKey,
          fieldTitle,
          message: numValidation.message || "Geçersiz sayısal değer.",
          received: rawValue,
        });
      } else {
        sanitized[fieldKey] = typeof rawValue === "number" ? rawValue : String(rawValue).trim();
      }
      continue;
    }

    // Enum Alanları
    if (field.kind === "enum" || field.enumValues?.length) {
      const allowed: string[] = field.enumValues || [];
      const valArr = Array.isArray(rawValue)
        ? rawValue.map(String)
        : String(rawValue).split(",").map((s) => s.trim()).filter(Boolean);

      const invalidValues = valArr.filter((v) => !allowed.some((a: string) => a.toLowerCase() === v.toLowerCase()));
      if (invalidValues.length > 0) {
        errors.push({
          field: fieldKey,
          fieldTitle,
          message: `Geçersiz seçenek(ler): ${invalidValues.join(", ")}. İzin verilenler: ${allowed.join(", ")}`,
          received: rawValue,
        });
      } else {
        sanitized[fieldKey] = field.selectionMode === "multiple" ? valArr : (valArr[0] ?? rawValue);
      }
      continue;
    }

    // Boolean Alanlar
    if (field.kind === "boolean") {
      const s = String(rawValue).trim().toLowerCase();
      if (s === "true" || s === "1" || s === "evet" || s === "yes") {
        sanitized[fieldKey] = true;
      } else if (s === "false" || s === "0" || s === "hayır" || s === "hayir" || s === "no") {
        sanitized[fieldKey] = false;
      } else if (typeof rawValue === "boolean") {
        sanitized[fieldKey] = rawValue;
      } else {
        errors.push({
          field: fieldKey,
          fieldTitle,
          message: `Evet/Hayır (boolean) değeri bekleniyor: 'true' veya 'false'.`,
          received: rawValue,
        });
      }
      continue;
    }

    // String / Diğer Alanlar
    sanitized[fieldKey] = rawValue;
  }

  // 2. Zorunlu Alan (Required) Kontrolü (partial değilse)
  if (!options.partial) {
    const requiredProps = (schema.required as string[]) || [];
    for (const reqKey of requiredProps) {
      const field = fields.find((f) => f.key === reqKey);
      const val = sanitized[reqKey];
      const isMissing =
        val === undefined ||
        val === null ||
        (typeof val === "string" && val.trim() === "") ||
        (Array.isArray(val) && val.length === 0);

      if (isMissing) {
        errors.push({
          field: reqKey,
          fieldTitle: field?.title || reqKey,
          message: `'${field?.title || reqKey}' alanı zorunludur, doldurulmalıdır.`,
        });
      }
    }
  }

  // 3. Özet Oluştur
  const valid = errors.length === 0;
  let summary = "";
  if (valid) {
    const count = Object.keys(sanitized).length;
    summary = `✅ Kriterler başarıyla doğrulandı (${count} alan).`;
    if (warnings.length > 0) {
      summary += ` (${warnings.length} uyarı mevcut)`;
    }
  } else {
    summary = `❌ Kriterlerde ${errors.length} hata tespit edildi: ${errors.map((e) => `${e.fieldTitle}: ${e.message}`).join("; ")}`;
  }

  return {
    valid,
    scope,
    reportTitle,
    sanitizedCriteria: sanitized,
    errors,
    warnings,
    summary,
  };
}

/**
 * Raporun şema yapısını, tiplerini ve alan kurallarını Yula Agent için
 * okunabilir ve yapılandırılmış özet olarak döndürür.
 */
export function inspectCriteriaSchema(schema: JsonSchemaObject): {
  scope: string;
  title: string;
  endpoint?: string;
  required: string[];
  fields: Array<{
    key: string;
    title: string;
    type: string;
    required: boolean;
    format?: string;
    rangeSplit?: string;
    options?: string[];
    description?: string;
    directive?: string;
  }>;
} {
  const { fields } = parseCriteriaSchema(schema);
  const required = (schema.required as string[]) || [];

  return {
    scope: (schema["x-scope"] as string) || "",
    title: (schema.title as string) || "",
    endpoint: (schema["x-job-endpoint"] as string) || undefined,
    required,
    fields: fields.map((f) => {
      const prop = schema.properties?.[f.key];
      const ai = prop && typeof prop === "object" ? (prop as { "x-ai"?: { directive?: string } })["x-ai"] : undefined;
      return {
        key: f.key,
        title: f.title,
        type: f.kind,
        required: required.includes(f.key),
        format: f.format,
        rangeSplit: f.rangeSplit,
        options: f.enumValues,
        description: f.description,
        directive: ai?.directive,
      };
    }),
  };
}

/**
 * Kullanıcının ekranda o an düzenlemekte olduğu canlı taslak formu okur
 * ve doğrulama raporunu üretir.
 */
export function evaluateCurrentDraftCriteria(scope: string): {
  scope: string;
  reportTitle: string;
  draftRows: CriteriaFilterRow[];
  instance: Record<string, unknown>;
  report: CriteriaValidationReport;
} {
  const reportMeta = findReport(scope);
  const schema = (reportMeta?.fullSchema || {}) as JsonSchemaObject;
  const { fields } = parseCriteriaSchema(schema);

  const draftRows = useDraftCriteriaStore.getState().rowsByScope[scope] || [];
  const instance = rowsToCriteriaInstance(draftRows, fields);

  const report = validateCriteriaInput(schema, instance, { scope, partial: false });

  return {
    scope,
    reportTitle: reportMeta?.title || scope,
    draftRows,
    instance,
    report,
  };
}
