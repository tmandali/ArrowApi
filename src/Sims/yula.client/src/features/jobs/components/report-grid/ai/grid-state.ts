/**
 * Virtual Grid & Result Grid State Types and Type Guards.
 * Server-safe pure TypeScript for inspecting mounted active component states.
 */
import type { ComponentSchema } from "@my-agent/core";
import { isResultGridComponent } from "@/lib/yula-tool-info";

export interface YulaGridContext {
  tableName: string;
  columns: string[];
  rowCount?: number | null;
  baseTable?: string;
  isBaseTable?: boolean;
  activeView?: string;
  activeAiViewId?: string | null;
  filters?: Record<string, string>;
  customQuerySql?: string | null;
  customQueryTitle?: string | null;
  columnTypes?: Record<string, string>;
  sampleRows?: Array<Record<string, unknown>>;
  columnValues?: Record<string, string[]>;
  columnDescriptions?: Record<string, string>;
  activeViewName?: string;
  savedViews?: Array<{ id?: string; name?: string; title: string; sql: string }>;
}

export interface ResultGridMetaPayload {
  tableName: string;
  columns: string[];
  rowCount?: number | null;
  filters?: unknown;
  customQuerySql?: string | null;
  customQueryTitle?: string | null;
  activeViewName?: string;
  isTableReady?: boolean;
  baseTable?: string;
  isBaseTable?: boolean;
  activeView?: string;
  activeAiViewId?: string | null;
  savedViews?: Array<{ id?: string; name?: string; title: string; sql: string }>;
}

export function isResultGridMeta(meta: unknown): meta is ResultGridMetaPayload {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  return (
    typeof m.tableName === "string" &&
    m.tableName.trim().length > 0 &&
    Array.isArray(m.columns) &&
    m.columns.length > 0 &&
    m.columns.every((col): col is string => typeof col === "string")
  );
}

export function normalizeFiltersRecord(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    ([k, v]) => typeof k === "string" && v != null
  );
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries.map(([k, v]) => [k, typeof v === "string" ? v : String(v)]));
}

export function resolveEffectiveGrid(
  context?: { grid?: YulaGridContext | null },
  activeComps: ComponentSchema[] = []
): YulaGridContext | undefined {
  if (context?.grid) return context.grid;

  const gridComp = activeComps.find(isResultGridComponent);
  if (!gridComp || !isResultGridMeta(gridComp.meta)) {
    return undefined;
  }

  const meta = gridComp.meta;
  const isBase = typeof meta.isBaseTable === "boolean" ? meta.isBaseTable : !meta.customQuerySql;
  return {
    tableName: meta.tableName,
    baseTable: typeof meta.baseTable === "string" ? meta.baseTable : meta.tableName,
    isBaseTable: isBase,
    activeView: typeof meta.activeView === "string" ? meta.activeView : (isBase ? meta.tableName : "active_view"),
    activeAiViewId: typeof meta.activeAiViewId === "string" ? meta.activeAiViewId : null,
    columns: meta.columns,
    rowCount: typeof meta.rowCount === "number" ? meta.rowCount : null,
    filters: normalizeFiltersRecord(meta.filters),
    customQuerySql: typeof meta.customQuerySql === "string" ? meta.customQuerySql : null,
    customQueryTitle: typeof meta.customQueryTitle === "string" ? meta.customQueryTitle : null,
    activeViewName: typeof meta.activeViewName === "string" ? meta.activeViewName : "active_view",
    savedViews: Array.isArray(meta.savedViews) ? meta.savedViews : undefined,
  };
}
