/**
 * Virtual Grid & Result Grid AI Grounding & State Formatter.
 * Pure TypeScript (Server-safe, zero React/DOM imports) for Node.js API prompt generation.
 */
import type { ComponentSchema } from "@my-agent/core";
import { isResultGridComponent } from "@/lib/yula-tool-info";

export interface YulaGridContext {
  tableName: string;
  columns: string[];
  rowCount?: number | null;
  /** Fiziksel temel veri tablosu adı (DuckDB) — tüm ham detay satırlarını barındırır */
  baseTable?: string;
  /** Kullanıcı şu an temel tabloda mı yoksa türetilmiş/özel sorguda mı? */
  isBaseTable?: boolean;
  /** DuckDB aktif görünüm adı ("active_view" veya baseTable) */
  activeView?: string;
  /** Seçili kayıtlı sorgu ID'si (varsa) */
  activeAiViewId?: string | null;
  /** Aktif UYGULANMIŞ filtreler — model gerçek tablo durumunu görsün */
  filters?: Record<string, string>;
  /** Modelin aktif özel SQL sorgusu; setliyken gruplanmış/türetilmiş görünüm aktiftir */
  customQuerySql?: string | null;
  /** Özel SQL görünümünün kullanıcı dostu ad etiketi */
  customQueryTitle?: string | null;
  /** Kolon → tip ("date"|"number"|"bool"|"text") — Arrow/şemasından (şema grounding) */
  columnTypes?: Record<string, string>;
  /** İlk örnek satırlar — model değerleri gerçek veri dokusuyla eşlesin (few-shot grounding) */
  sampleRows?: Array<Record<string, unknown>>;
  /** Düşük kardinaliteli kolonların gerçek değerleri (DISTINCT) — değer uydurma savunması */
  columnValues?: Record<string, string[]>;
  /** Kolon → yetkili semantik tanım (rapor şeması x-ai.columnDescriptions) */
  columnDescriptions?: Record<string, string>;
  /** DuckDB'de aktif süzülmüş/canlı görünümün SQL VIEW adı (varsayılan: "active_view") */
  activeViewName?: string;
  /** DuckDB'de kayıtlı özel görünümlerin listesi (view_xxx adıyla erişilebilir) */
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

/**
 * result_grid:active bileşen meta verisinin geçerli bir tablo bağlamı
 * taşıyıp taşımadığını doğrulayan saf tip muhafızı (type guard).
 */
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

/**
 * context.grid doğrudan sağlanmadığında active_components içindeki
 * result_grid:active bileşeninden tip güvenli şekilde YulaGridContext üretir.
 */
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

/**
 * Sanal tablo / DuckDB sonuç ızgarasının sistem promptu için canlı şema ve görünüm metnini üretir.
 */
export function formatGridPromptGrounding(effectiveGrid: YulaGridContext): string {
  const isCustomActive = Boolean(effectiveGrid.customQuerySql);
  const baseTableName = effectiveGrid.baseTable ?? effectiveGrid.tableName;
  const viewTitle =
    effectiveGrid.customQueryTitle ??
    (effectiveGrid.activeAiViewId ? `View ${effectiveGrid.activeAiViewId}` : "Custom Query");

  const viewModeNotice = isCustomActive
    ? `VIEW MODE: ${effectiveGrid.activeAiViewId ? `SAVED QUERY [ID: "${effectiveGrid.activeAiViewId}"]` : "CUSTOM QUERY"} ("${viewTitle}").`
    : `VIEW MODE: BASE TABLE VIEW (All raw detail rows active, no custom grouping).`;

  const activeFiltersText =
    effectiveGrid.filters && Object.keys(effectiveGrid.filters).length > 0
      ? `CURRENT ACTIVE FILTERS: ${JSON.stringify(effectiveGrid.filters)}`
      : "CURRENT ACTIVE FILTERS: None.";

  const savedViewsNotice =
    Array.isArray(effectiveGrid.savedViews) && effectiveGrid.savedViews.length > 0
      ? `AVAILABLE SAVED VIEWS: [${effectiveGrid.savedViews
          .map((v) => `"${v.title}" (ID: ${v.id ?? v.name ?? "?"})`)
          .join(", ")}].`
      : null;

  const gridLines = [
    viewModeNotice,
    `• Base Physical Table: "${baseTableName}" (Stores all raw detail records).`,
    `• Active table: ${baseTableName} · ${effectiveGrid.rowCount ?? "?"} rows.`,
    `• Active DuckDB View: "${effectiveGrid.activeViewName ?? "active_view"}" (Represents currently visible & filtered rows on screen).`,
    isCustomActive ? `• Active Query SQL: ${effectiveGrid.customQuerySql}` : null,
    isCustomActive
      ? `• NOTE: The active view is derived/grouped. If the user asks for records, stores, or entities excluded by this query, or detailed base table rows, query the base table "${baseTableName}" directly or use action='RESET_LAYOUT'.`
      : null,
    savedViewsNotice,
    `Columns: ${effectiveGrid.columns.join(", ")}.`,
    activeFiltersText,
  ].filter(Boolean);

  return gridLines.join(" ");
}
