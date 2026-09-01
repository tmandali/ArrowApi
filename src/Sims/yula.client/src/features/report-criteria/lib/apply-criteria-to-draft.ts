import { useDraftCriteriaStore } from "@/store/slices/draft-criteria-store";
import { useAgentCriteriaStore } from "@/hooks/use-agent-criteria-bridge";
import { findReport } from "@/features/reports/report-registry";
import { parseCriteriaSchema } from "./parse-criteria-schema";
import { createInitialCriteriaRows } from "./create-initial-criteria-rows";
import type { CriteriaFilterRow, JsonSchemaObject } from "../types";

function newRowId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Göreceli tarih ifadelerini ISO tarihine veya aralığına çevirir
 */
export function resolveRelativeDateString(val: string): string {
  const v = val.toLowerCase().trim();
  const today = new Date();
  const todayIso = today.toISOString().slice(0, 10);

  if (v === "dün" || v === "dun" || v === "yesterday") {
    const d = new Date(today);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }
  if (v === "bugün" || v === "bugun" || v === "today") {
    return todayIso;
  }
  if (v.includes("hafta") || v.includes("week")) {
    const start = new Date(today);
    start.setDate(today.getDate() - 7);
    return `${start.toISOString().slice(0, 10)}..${todayIso}`;
  }
  if (v.includes("ay") || v.includes("month")) {
    const start = new Date(today);
    start.setDate(1);
    return `${start.toISOString().slice(0, 10)}..${todayIso}`;
  }
  return val;
}

/**
 * Verilen kriter nesnesini (ör. { kayitTarihi: "dün", durum: ["AKTIF"] })
 * paylaşılan kriter taslağına (useDraftCriteriaStore) yazar ve ekrandaki kriter
 * tablosunu günceller.
 */
export function applyCriteriaToDraft(
  scope: string,
  criteria: Record<string, unknown>,
  schema?: JsonSchemaObject,
): { ok: boolean; updatedKeys: string[]; rows: CriteriaFilterRow[] } {
  if (!scope || !criteria || typeof criteria !== "object") {
    return { ok: false, updatedKeys: [], rows: [] };
  }

  const effectiveSchema =
    schema || (findReport(scope)?.fullSchema as JsonSchemaObject | undefined);

  const currentDraft = useDraftCriteriaStore.getState().rowsByScope[scope];
  const initial =
    currentDraft && currentDraft.length > 0
      ? currentDraft
      : effectiveSchema
        ? createInitialCriteriaRows(parseCriteriaSchema(effectiveSchema).fields)
        : [];

  const nextRows: CriteriaFilterRow[] = initial.map((r) => ({ ...r }));
  const updatedKeys: string[] = [];

  for (const [rawKey, rawValue] of Object.entries(criteria)) {
    if (rawValue === undefined || rawValue === null) continue;
    const key = rawKey.trim();
    if (!key) continue;

    const rawStr = String(rawValue);
    let stringVal = "";
    if (key === "kayitTarihi" && typeof rawValue === "string") {
      stringVal = resolveRelativeDateString(rawValue);
    } else if (Array.isArray(rawValue)) {
      stringVal = rawValue.map(String).join(",");
    } else if (typeof rawValue === "object") {
      stringVal = JSON.stringify(rawValue);
    } else {
      stringVal = rawStr;
    }

    const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    const parsedFields = effectiveSchema ? parseCriteriaSchema(effectiveSchema).fields : [];
    const matchedField = parsedFields.find(
      (f) =>
        f.key.toLowerCase() === key.toLowerCase() ||
        f.key.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanKey ||
        f.title.toLowerCase() === key.toLowerCase() ||
        f.title.toLowerCase().replace(/[^a-z0-9]/g, "") === cleanKey
    );
    const rowName = matchedField ? matchedField.key : key;

    const existingIdx = nextRows.findIndex((r) => {
      const rClean = r.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return (
        r.name.toLowerCase() === rowName.toLowerCase() ||
        rClean === cleanKey ||
        (matchedField && r.name.toLowerCase() === matchedField.title.toLowerCase())
      );
    });

    if (existingIdx >= 0) {
      nextRows[existingIdx] = {
        ...nextRows[existingIdx],
        name: rowName,
        value: stringVal,
      };
    } else {
      nextRows.push({
        id: newRowId(),
        selected: false,
        name: rowName,
        value: stringVal,
      });
    }

    updatedKeys.push(rowName);
  }

  // 1. Taslak tablosuna yaz (ekrandaki SchemaCriteriaFilter reaktif güncellenir)
  useDraftCriteriaStore.getState().setRows(scope, [...nextRows]);

  // 2. Doldurulan kolonları AI vurgusuyla işaretle
  if (updatedKeys.length > 0) {
    useAgentCriteriaStore.getState().recordAiFilledCriteria(scope, updatedKeys);
  }

  // 3. Kriter formu kapalıysa ekranda aç (StockBalanceForm vs.)
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("yula:open-compose", { detail: { scope } }),
    );
  }

  return { ok: true, updatedKeys, rows: nextRows };
}
