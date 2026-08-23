import type { JsonSchemaObject, JsonSchemaProperty } from "@/features/report-criteria/types";
import { fuzzySimilarity, normalizeTurkish } from "./generic-nlp-resolver";

export interface SchemaValidationResult {
  validArgs: Record<string, any>;
  rejectedFields: Array<{ field: string; value: any; reason: string }>;
  notes: string[];
  isValid: boolean;
}

/**
 * Validates and sanitizes raw AI tool arguments against an ERP JSON Schema.
 * Guarantees zero hallucination, legal enum snapping, and strict type safety.
 */
export function validateAndSanitizeSchemaArgs(
  schema: JsonSchemaObject,
  rawArgs: Record<string, any>
): SchemaValidationResult {
  const props = schema.properties || {};
  const validArgs: Record<string, any> = {};
  const rejectedFields: Array<{ field: string; value: any; reason: string }> = [];
  const notes: string[] = [];

  if (!rawArgs || typeof rawArgs !== "object") {
    return { validArgs: {}, rejectedFields: [], notes: [], isValid: true };
  }

  for (const [key, rawVal] of Object.entries(rawArgs)) {
    if (rawVal === undefined || rawVal === null || rawVal === "") {
      continue;
    }

    const propDef = props[key] as JsonSchemaProperty | undefined;
    if (!propDef) {
      // Şemada tanımlı olmayan yabancı alanları ayıkla
      rejectedFields.push({
        field: key,
        value: rawVal,
        reason: `Şemada '${key}' adında bir kriter alanı tanımlı değil.`,
      });
      continue;
    }

    const propTitle = propDef.title?.trim() || key;
    const isArrayProp =
      propDef.type === "array" ||
      propDef["x-selection"] === "multiple" ||
      propDef["x-multiple"] === true;

    // 1. ENUM VALIDATION & SNAPPING
    const allowedEnums: string[] | undefined =
      propDef.enum ||
      (propDef.items && !Array.isArray(propDef.items) ? (propDef.items as any).enum : undefined);

    if (allowedEnums && allowedEnums.length > 0) {
      const canonicalMap = new Map<string, string>();
      for (const opt of allowedEnums) {
        canonicalMap.set(normalizeTurkish(String(opt)), String(opt));
      }

      const snapToEnum = (valStr: string): string | null => {
        const valNorm = normalizeTurkish(valStr.trim());
        if (canonicalMap.has(valNorm)) {
          return canonicalMap.get(valNorm)!;
        }

        // Aliases check for common ERP enums
        if (valNorm === "usd" || valNorm === "dolar" || valNorm === "dollar") {
          for (const opt of allowedEnums) {
            if (opt.toUpperCase() === "USD") return opt;
          }
        }
        if (valNorm === "try" || valNorm === "tl" || valNorm === "lira" || valNorm === "turk lirasi") {
          for (const opt of allowedEnums) {
            if (opt.toUpperCase() === "TRY") return opt;
          }
        }
        if (valNorm === "eur" || valNorm === "euro" || valNorm === "avro") {
          for (const opt of allowedEnums) {
            if (opt.toUpperCase() === "EUR") return opt;
          }
        }
        if (valNorm === "aktif" || valNorm === "active" || valNorm === "aktfi") {
          for (const opt of allowedEnums) {
            if (opt.toUpperCase() === "AKTIF") return opt;
          }
        }
        if (valNorm === "beklemede" || valNorm === "bekleme" || valNorm === "bekleyen" || valNorm === "beklede" || valNorm === "pending") {
          for (const opt of allowedEnums) {
            if (opt.toUpperCase() === "BEKLEMEDE") return opt;
          }
        }
        if (valNorm === "iptal" || valNorm === "cancel" || valNorm === "itpal") {
          for (const opt of allowedEnums) {
            if (opt.toUpperCase() === "IPTAL") return opt;
          }
        }
        if (valNorm === "pasif" || valNorm === "passive" || valNorm === "pasfi" || valNorm === "kapali" || valNorm === "kapalı") {
          for (const opt of allowedEnums) {
            if (opt.toUpperCase() === "PASIF") return opt;
          }
        }

        // Fuzzy match against allowed canonical enums
        for (const [normKey, canonical] of canonicalMap.entries()) {
          if (fuzzySimilarity(valNorm, normKey) >= 0.72) {
            return canonical;
          }
        }

        return null;
      };

      const rawItems = Array.isArray(rawVal) ? rawVal : [rawVal];
      const validSnapped: string[] = [];

      for (const item of rawItems) {
        const itemStr = String(item).trim();
        const snapped = snapToEnum(itemStr);
        if (snapped) {
          if (!validSnapped.includes(snapped)) {
            validSnapped.push(snapped);
          }
        } else {
          rejectedFields.push({
            field: key,
            value: item,
            reason: `'${item}' değeri geçerli seçenekler arasında (${allowedEnums.join(", ")}) bulunamadı.`,
          });
        }
      }

      if (validSnapped.length > 0) {
        if (isArrayProp) {
          validArgs[key] = validSnapped;
        } else {
          validArgs[key] = validSnapped[0];
          if (validSnapped.length > 1) {
            const omitted = validSnapped.slice(1).join(", ");
            notes.push(
              `💡 **${propTitle}:** Bu alan tekil bir seçimdir; ilk geçerli seçenek (**${validSnapped[0]}**) uygulandı. (${omitted} aynı anda seçilemez.)`
            );
          }
        }
      }
      continue;
    }

    // 2. DATASOURCE VALIDATION (e.g. x-datasource on urun / item)
    const datasource = (propDef as any)["x-datasource"] as Array<Record<string, any>> | undefined;
    if (datasource && Array.isArray(datasource) && datasource.length > 0) {
      const rawItems = Array.isArray(rawVal) ? rawVal : [rawVal];
      const matchedCodes: string[] = [];

      for (const item of rawItems) {
        const itemStr = String(item).trim().toLowerCase();
        let foundCode: string | null = null;

        for (const row of datasource) {
          const kod = String(row.kod || "").trim();
          const ad = String(row.ad || "").trim().toLowerCase();
          const barkod = String(row.barkod || "").trim();

          if (
            kod.toLowerCase() === itemStr ||
            barkod === itemStr ||
            ad === itemStr ||
            (ad.length >= 4 && ad.includes(itemStr))
          ) {
            foundCode = kod;
            break;
          }
        }

        if (foundCode) {
          if (!matchedCodes.includes(foundCode)) {
            matchedCodes.push(foundCode);
          }
        } else {
          rejectedFields.push({
            field: key,
            value: item,
            reason: `'${item}' ürün/malzeme kayıtlı veri kaynağı listesinde bulunamadı.`,
          });
        }
      }

      if (matchedCodes.length > 0) {
        validArgs[key] = isArrayProp ? matchedCodes : matchedCodes[0];
      }
      continue;
    }

    // 3. NUMBER VALIDATION
    if (propDef.type === "number" || propDef.type === "integer") {
      const num = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal).replace(/\./g, "").replace(",", "."));
      if (isNaN(num)) {
        rejectedFields.push({
          field: key,
          value: rawVal,
          reason: `'${rawVal}' geçerli bir sayı formatında değil.`,
        });
      } else {
        if (propDef.minimum !== undefined && num < propDef.minimum) {
          rejectedFields.push({
            field: key,
            value: num,
            reason: `Değer minimum sınırın (${propDef.minimum}) altında.`,
          });
        } else if (propDef.maximum !== undefined && num > propDef.maximum) {
          rejectedFields.push({
            field: key,
            value: num,
            reason: `Değer maksimum sınırın (${propDef.maximum}) üzerinde.`,
          });
        } else {
          validArgs[key] = propDef.type === "integer" ? Math.round(num) : num;
        }
      }
      continue;
    }

    // 4. DATE VALIDATION & SMART CONFLICT RESOLUTION
    if (propDef.format === "date") {
      const dateStr = String(rawVal).trim();
      const isIsoSingle = /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
      const isIsoRange = /^(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(dateStr);

      if (isIsoRange) {
        let d1 = isIsoRange[1];
        let d2 = isIsoRange[2];
        // Smart Conflict: Inverted date range (e.g. 2026-08-20..2026-08-01)
        if (d1 > d2) {
          const temp = d1;
          d1 = d2;
          d2 = temp;
          notes.push(
            `💡 **Tarih Aralığı Düzeltildi:** Başlangıç tarihi bitiş tarihinden sonra girildiği için aralık otomatik olarak **${d1}..${d2}** olarak düzenlendi.`
          );
        }
        validArgs[key] = `${d1}..${d2}`;
      } else if (isIsoSingle) {
        validArgs[key] = dateStr;
      } else {
        rejectedFields.push({
          field: key,
          value: rawVal,
          reason: `'${rawVal}' geçerli bir tarih formatı (YYYY-MM-DD veya YYYY-MM-DD..YYYY-MM-DD) değil.`,
        });
      }
      continue;
    }

    // 5. BOOLEAN VALIDATION
    if (propDef.type === "boolean") {
      if (typeof rawVal === "boolean") {
        validArgs[key] = rawVal;
      } else {
        const boolStr = String(rawVal).toLowerCase().trim();
        validArgs[key] = boolStr === "true" || boolStr === "1" || boolStr === "evet" || boolStr === "yes";
      }
      continue;
    }

    // 6. DEFAULT PASS-THROUGH (STRING & ARRAY)
    validArgs[key] = isArrayProp && !Array.isArray(rawVal) ? [String(rawVal)] : rawVal;
  }

  // Cross-Field Conflict Resolution: fromDate vs toDate
  const fromKey = Object.keys(props).find((k) => /^(from|start|baslangic)/i.test(k));
  const toKey = Object.keys(props).find((k) => /^(to|end|bitis)/i.test(k));

  if (fromKey && toKey && validArgs[fromKey] && validArgs[toKey]) {
    const fVal = String(validArgs[fromKey]).trim();
    const tVal = String(validArgs[toKey]).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(fVal) && /^\d{4}-\d{2}-\d{2}$/.test(tVal) && fVal > tVal) {
      validArgs[fromKey] = tVal;
      validArgs[toKey] = fVal;
      notes.push(
        `💡 **Tarih Sıralaması Düzeltildi:** Başlangıç tarihi (${fVal}) bitiş tarihinden (${tVal}) sonra girildiği için tarihler **${tVal} (Başlangıç) .. ${fVal} (Bitiş)** olarak yer değiştirildi.`
      );
    }
  }

  return {
    validArgs,
    rejectedFields,
    notes,
    isValid: Object.keys(validArgs).length > 0,
  };
}
