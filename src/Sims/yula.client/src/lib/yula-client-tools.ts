import { useYulaGridStore } from "@/lib/stores/grid"
import { findReport, REGISTERED_REPORTS as DEMO_REPORTS } from "@/features/reports/report-registry"
import { readReportAiMetadata, readCriteriaAiMetadata } from "@/lib/report-ai-metadata";
import { guardReadOnlySelect } from "@/lib/sql-guard";
import { isReportResultPath, isReportResultView } from "@/lib/workspace-paths";

/**
 * İstemci tarafı araç yürütücüleri — kullanıcının etkileşimiyle ya da
 * modelin dynamic-tool çağrısıyla çalışır, çıktı akışa geri verilir.
 */

function sqlSafeId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Aktif grid veri kümesi — özel SQL görünümü varsa onu, yoksa temel tabloyu gösterir. */
type ActiveDataset = {
  /** Analiz sorgularında FROM'a yazılacak ifade (subquery veya tablo) */
  from: string;
  /** Aktif görünümün kolon adları */
  columns: string[];
  /** Sayısal kolonlar (özel görünümde örnek satır tipinden saptanır) */
  numeric: Set<string>;
  isCustom: boolean;
  tableName: string;
  /** Yalnız temel tablo: DuckDB şema metası (duckType/tarih tespiti için) */
  described?: Awaited<
    ReturnType<typeof import("@/services/duckdb")["duckDbClient"]["describeTable"]>
  >;
};

/**
 * set_grid_query sonrası "açık tablo" gruplanmış görünüm olduğundan analiz
 * araçları temel tabloyu değil BU kümesini ölçüt almalı; aksi halde
 * SUM("Warehouse") gibi tip uyumsuz sorgular üretilir.
 */
async function resolveActiveDataset(): Promise<ActiveDataset | null> {
  const spec = await ensureGridSpec();
  if (!spec || spec.columns.length === 0) return null;

  const { duckDbClient } = await import("@/services/duckdb");
  const customSql = useYulaGridStore.getState().customQuerySql;
  if (!customSql) {
    const described = await duckDbClient.describeTable(spec.tableName);
    return {
      from: sqlSafeId(spec.tableName),
      columns: spec.columns,
      numeric: new Set(described.filter((c) => c.isNumeric).map((c) => c.name)),
      isCustom: false,
      tableName: spec.tableName,
      described,
    };
  }

  const from = `(${customSql}) AS __yula_active_view`;
  let numeric = new Set<string>();
  try {
    const probe = await duckDbClient.executeCustomSql(
      `SELECT * FROM ${from} LIMIT 1`
    );
    const row = probe[0];
    if (row) {
      numeric = new Set(
        Object.entries(row)
          .filter(([, v]) => {
            if (typeof v === "number" || typeof v === "bigint") return true;
            return (
              typeof v === "string" &&
              v.trim() !== "" &&
              /^-?\d+(\.\d+)?$/.test(v.trim())
            );
          })
          .map(([k]) => k)
      );
    }
  } catch {
    // Tip saptanamadıysa kolon adından tahmin (total_qty, avg_price vb.)
    numeric = new Set(
      spec.columns.filter((c) =>
        /qty|total|sum|avg|count|amount|price|balance|miktar|tutar|bakiye/i.test(c),
      )
    );
  }
  return { from, columns: spec.columns, numeric, isCustom: true, tableName: spec.tableName };
}

/**
 * Öz-düzeltme: sonuç ekranındaysak ama mağazadaki spec boş/eksikse
 * (navigasyon/refresh race'i) DuckDB şemasından anında tamamla.
 */
const JOB_DETAIL_PREFIXES = [
  "/stock/stock-balance/",
  "/stock/stock-analytics/",
  "/stock/analytics/",
];

async function ensureGridSpec(): Promise<
  ReturnType<typeof useYulaGridStore.getState>["spec"]
> {
  const store = useYulaGridStore.getState();
  if (store.spec && store.spec.columns.length > 0) return store.spec;

  const pathname =
    typeof window !== "undefined" ? window.location.pathname : "";
  const isJobDetail = JOB_DETAIL_PREFIXES.some(
    (p) => pathname.startsWith(p) && pathname.length > p.length,
  );
  if (!isJobDetail) return store.spec;

  const jobIdSeg = pathname.split("/").pop() ?? "";
  const tableName = jobIdSeg
    ? `report_${jobIdSeg.replace(/[^a-zA-Z0-9_]/g, "_")}`
    : "";
  if (!tableName) return store.spec;

  // Ingest penceresi yarışı: tablo worker'a birkaç yüz ms sonra düşebilir;
  // kısa retry ile o pencereyi kapat.
  const sleep = (ms: number) =>
    new Promise((r) => setTimeout(r, ms));

  try {
    const { duckDbClient } = await import("@/services/duckdb");
    for (let attempt = 0; attempt < 5; attempt++) {
      const cols = await duckDbClient.describeTable(tableName);
      if (cols.length > 0) {
        store.register({
          tableName,
          title: "Stok Bakiye Raporu",
          columns: cols.map((c) => c.name),
          rowCount: null,
          reportScope: "stock-balance",
        });
        return useYulaGridStore.getState().spec;
      }
      await sleep(600);
    }
  } catch (err) {
    console.warn("[Yula exec] ensureGridSpec self-heal başarısız:", err);
  }
  return store.spec;
}

async function analyzeGrid(
  input: Record<string, unknown>,
): Promise<unknown> {
  const ds = await resolveActiveDataset();
  if (!ds) {
    return {
      status: "error",
      error: "Açık tablo yok.",
      hint: "Sonuç tablosu henüz yüklenmedi; birkaç saniye sonra tekrar deneyin.",
    };
  }

  const op = String(input.operation ?? "count");
  const column =
    typeof input.column === "string" ? input.column : undefined;
  const byColumn =
    typeof input.byColumn === "string" ? input.byColumn : undefined;
  const topN = Number(input.topN ?? 5);

  try {
    const { duckDbClient } = await import("@/services/duckdb");
    const tableLabel = ds.isCustom ? "(aktif özel görünüm)" : ds.tableName;

    if (op === "count") {
      const rows = await duckDbClient.executeCustomSql(
        `SELECT COUNT(*) AS cnt FROM ${ds.from}`,
      );
      return {
        status: "ok",
        operation: "count",
        table: tableLabel,
        count: Number(rows[0]?.cnt ?? 0),
      };
    }

    if (!column || !ds.columns.includes(column)) {
      return {
        status: "error",
        error: `Geçersiz kolon: ${String(column)}`,
        availableColumns: ds.columns,
        numericColumns: [...ds.numeric],
        hint: "availableColumns içinden bir kolon seç; toplama/ortalama için numericColumns gerekir.",
      };
    }
    // Sayısal olmayan kolona toplama uygulamak DuckDB Binder Error üretir
    // (örn. sum(VARCHAR)) — sessiz fallback YOK; model düzeltmeli kolonla tekrar çağırır.
    if (!ds.numeric.has(column)) {
      return {
        status: "error",
        error: `"${column}" sayısal bir kolon değil; SUM/AVG/top işlemi uygulanamaz.`,
        numericColumns: [...ds.numeric],
        hint: "Aynı aracı numericColumns listesinden bir column ile tekrar çağır.",
      };
    }
    const col = sqlSafeId(column);

    if (op === "sum" || op === "avg" || op === "min" || op === "max") {
      // byColumn verildiyse gruplu döndür (örn. depo bazlı toplam)
      if (byColumn && ds.columns.includes(byColumn)) {
        const gcol = sqlSafeId(byColumn);
        const rows = await duckDbClient.executeCustomSql(
          `SELECT ${gcol} AS label, ROUND(${op.toUpperCase()}(${col}), 2) AS value FROM ${ds.from} GROUP BY ${gcol} ORDER BY value DESC LIMIT ${Math.max(1, Math.min(20, topN))}`,
        );
        return {
          status: "ok",
          operation: `${op}-by`,
          table: tableLabel,
          column,
          byColumn,
          items: rows.map((r) => ({
            label: String(r.label ?? ""),
            value: Number(r.value ?? 0),
          })),
        };
      }

      const rows = await duckDbClient.executeCustomSql(
        `SELECT ${op.toUpperCase()}(${col}) AS value FROM ${ds.from}`,
      );
      return {
        status: "ok",
        operation: op,
        table: tableLabel,
        column,
        value: Number(rows[0]?.value ?? 0),
      };
    }

    // top: grup kolonu metin tercihli; ölçü kolonu zaten sayısal doğrulandı.
    // byColumn verilmediyse kör "ilk metin kolon" yerine kategori kolonu seç:
    // Id gibi benzersiz kimlik kolonları (ilk değerleri düz sayı) asla gruplanmaz.
    const { looksLikeIdentifierValues } = await import("@/lib/grid-column-values")
    const columnValues = useYulaGridStore.getState().spec?.columnValues
    const groupCol =
      byColumn && ds.columns.includes(byColumn)
        ? byColumn
        : ds.columns.find(
            (c) =>
              c !== column &&
              !ds.numeric.has(c) &&
              !looksLikeIdentifierValues(columnValues?.[c]),
          ) ||
          ds.columns.find((c) => c !== column && !ds.numeric.has(c)) ||
          column;
    const gcol = sqlSafeId(groupCol);
    const rows = await duckDbClient.executeCustomSql(
      `SELECT ${gcol} AS label, SUM(${col}) AS value FROM ${ds.from} GROUP BY ${gcol} ORDER BY value DESC LIMIT ${Math.max(1, Math.min(20, topN))}`,
    );
    return {
      status: "ok",
      operation: "top",
      table: tableLabel,
      column,
      byColumn: groupCol,
      items: rows.map((r) => ({
        label: String(r.label ?? ""),
        value: Number(r.value ?? 0),
      })),
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      availableColumns: ds.columns,
      numericColumns: [...ds.numeric],
      hint: "Sorguyu bu kolon listesine göre düzeltip aynı aracı tekrar çağır.",
    };
  }
}

/** duckType + isNumeric kanıtından profil kategori sınıfı türetir (şema-sürümlü). */
type ProfileColumnKind = "numeric" | "text" | "date" | "boolean" | "other"

function classifyDuckType(
  duckType: string | undefined,
  isNumeric: boolean
): ProfileColumnKind {
  const t = (duckType ?? "").toLowerCase()
  if (/bool/.test(t)) return "boolean"
  if (/timestamp|date/.test(t)) return "date"
  if (isNumeric || /int|decimal|double|float|real|numeric|hugeint/.test(t)) {
    return "numeric"
  }
  if (/varchar|char|text|string|enum|uuid/.test(t)) return "text"
  return isNumeric ? "numeric" : "text"
}

function sqlAlias(col: string): string {
  return `__c_${col.replace(/[^a-zA-Z0-9_]/g, "_")}`
}

/**
 * SQL Expert profillemesi — açık tabloyu tek aggregate geçişiyle tarar:
 * satır sayısı, null oranı, kardinalite, sayısal min/max/avg/sum/negatif,
 * metin kolonları için en sık 3 değer. Aktif grid filtreleri WHERE olarak uygulanır.
 */
async function profileGrid(): Promise<unknown> {
  const ds = await resolveActiveDataset()
  if (!ds) {
    return {
      status: "error",
      error: "Açık tablo yok.",
      hint: "Sonuç tablosu henüz yüklenmedi; birkaç saniye sonra tekrar deneyin.",
    }
  }

  try {
    const { duckDbClient } = await import("@/services/duckdb")
    const { buildCombinedWhereClause } = await import(
      "@/services/duckdb/filter-parser"
    )
    const filters = useYulaGridStore.getState().filters
    const where = buildCombinedWhereClause(filters, ds.numeric)

    // Kolon tipleri: temel tabloda DuckDB şemasından (tarih/bool dahil),
    // özel görünümde örnek satır tipinden (numeric/text) türetilir.
    const kindOf = (name: string): ProfileColumnKind => {
      const meta = ds.described?.find((c) => c.name === name)
      if (meta) return classifyDuckType(meta.duckType, meta.isNumeric)
      return ds.numeric.has(name) ? "numeric" : "text"
    }

    const aggParts: string[] = ["COUNT(*) AS __row_count"]
    for (const col of ds.columns) {
      const q = sqlSafeId(col)
      const a = sqlAlias(col)
      const kind = kindOf(col)
      aggParts.push(`SUM(CASE WHEN ${q} IS NULL THEN 1 ELSE 0 END) AS ${a}_nulls`)
      aggParts.push(`COUNT(DISTINCT ${q}) AS ${a}_distinct`)
      if (kind === "numeric") {
        aggParts.push(
          `MIN(${q}) AS ${a}_min, MAX(${q}) AS ${a}_max, ROUND(AVG(${q}), 4) AS ${a}_avg, ROUND(SUM(${q}), 4) AS ${a}_sum, SUM(CASE WHEN ${q} < 0 THEN 1 ELSE 0 END) AS ${a}_negative`
        )
      } else if (kind === "date") {
        aggParts.push(
          `CAST(MIN(${q}) AS VARCHAR) AS ${a}_min, CAST(MAX(${q}) AS VARCHAR) AS ${a}_max`
        )
      }
    }

    const aggRows = await duckDbClient.executeCustomSql(
      `SELECT ${aggParts.join(", ")} FROM ${ds.from} ${where}`
    )
    const agg = aggRows[0] ?? {}

    // Top değerler — metin kolonlarında en sık 3 değer (maliyeti sınırlamak için en fazla 6 kolon)
    const textCols = ds.columns
      .filter((col) => kindOf(col) === "text")
      .slice(0, 6)
    const topValuesByColumn: Record<string, { value: string; count: number }[]> =
      {}
    for (const col of textCols) {
      const q = sqlSafeId(col)
      try {
        const rows = await duckDbClient.executeCustomSql(
          `SELECT CAST(${q} AS VARCHAR) AS value, COUNT(*) AS cnt FROM ${ds.from} ${where} GROUP BY 1 ORDER BY cnt DESC LIMIT 3`
        )
        topValuesByColumn[col] = rows.map((r) => ({
          value: String(r.value ?? ""),
          count: Number(r.cnt ?? 0),
        }))
      } catch (err) {
        console.warn(`[Yula exec] profil top-values hatası (${col}):`, err)
      }
    }

    const columns = ds.columns.map((col) => {
      const a = sqlAlias(col)
      const kind = kindOf(col)
      const entry: Record<string, unknown> = {
        name: col,
        kind,
        nullCount: Number(agg[`${a}_nulls`] ?? 0),
        distinctCount: Number(agg[`${a}_distinct`] ?? 0),
      }
      if (kind === "numeric") {
        entry.numeric = {
          min: agg[`${a}_min`] ?? null,
          max: agg[`${a}_max`] ?? null,
          avg: agg[`${a}_avg`] ?? null,
          sum: agg[`${a}_sum`] ?? null,
          negativeCount: Number(agg[`${a}_negative`] ?? 0),
        }
      } else if (kind === "date") {
        entry.dateRange = {
          min: agg[`${a}_min`] ?? null,
          max: agg[`${a}_max`] ?? null,
        }
      }
      if (topValuesByColumn[col]) {
        entry.topValues = topValuesByColumn[col]
      }
      return entry
    })

    const filterSummary = Object.entries(filters)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `${k}=${v}`)

    return {
      status: "ok",
      table: ds.tableName,
      view: ds.isCustom ? "custom" : "base",
      rowCount: Number(agg.__row_count ?? 0),
      filtersApplied: filterSummary,
      columns,
      note: "Tablo profil sonuçları yukarıdadır. Lütfen veriyi detaylıca inceleyip kullanıcıya doğrudan Türkçe markdown ile açıklayıcı ve net analiz sun. Başka bir araç çağırma.",
    }
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * get_report_schema — aktif raporun JSON şemasını yetkili kaynaktan döndürür
 * (kriter alanları + kolon tanımları + üstveri). Model çıktıyı markdown tablo
 * olarak özetler; kriter alan adları run_report criteria'sında aynen kullanılır.
 */
async function getReportSchema(): Promise<unknown> {
  const spec = useYulaGridStore.getState().spec
  const scope = spec?.reportScope
  const report = scope ? findReport(scope) : undefined
  if (!report) {
    return {
      status: "error",
      error: "Aktif rapor şeması bulunamadı.",
      hint: "Bir rapor sonuç ekranı açıkken tekrar deneyin.",
    }
  }

  const pathname = typeof window !== "undefined" ? window.location.pathname : ""
  const isGuidPath = isReportResultPath(pathname) || Boolean(spec?.tableName && spec.tableName.startsWith("report_"))
  const isViewingResults = isReportResultView(pathname, spec)

  const meta = readReportAiMetadata(report.fullSchema)
  const required = new Set(report.fullSchema.required ?? [])
  const criteria = Object.entries(report.fullSchema.properties ?? {}).map(
    ([name, prop]) => {
      const ai = readCriteriaAiMetadata(prop)
      return {
        name,
        title: prop.title ?? name,
        type: Array.isArray(prop.type) ? prop.type.join("|") : prop.type,
        required: required.has(name),
        options: Array.isArray(prop.enum)
          ? prop.enum.map((o) => String(o))
          : undefined,
        description:
          typeof prop.description === "string" ? prop.description : undefined,
        dateBehavior: ai.dateBehavior,
      }
    },
  )

  return {
    status: "ok",
    report: {
      scope: report.scope,
      title: report.title,
      pagePath: report.pagePath,
      mode: isGuidPath ? "view" : "criteria",
      isViewingResults,
    },
    activeGrid: isViewingResults && spec
      ? {
          tableName: spec.tableName,
          title: spec.title,
          columns: spec.columns,
          rowCount: spec.rowCount,
          columnTypes: spec.columnTypes,
          sampleRows: spec.sampleRows,
          columnValues: spec.columnValues,
        }
      : undefined,
    criteria,
    columnDescriptions: meta.columnDescriptions,
    aliases: meta.aliases,
    directive: isGuidPath
      ? "Kullanıcı GUID sonuç ekranındadır (View Modu). 'Bu rapor hakkında bilgi ver' veya benzeri sorular sorulduğunda öncelikle aktif sonuç tablosunun kolonlarını, satır sayısını ve veri içeriğini açıkla; kriter listesini yalnızca kullanıcı yeni rapor çalıştırmak isterse ikincil olarak sun."
      : "Kullanıcı rapor kriter ekranındadır (Criteria Modu). Raporun amacını ve çalıştırılabilir kriter alanlarını markdown tablo ile özetle.",
  }
}

/**
 * SQL Expert sorgu yürütme — modelin yazdığı TEK salt-okunur SELECT'i
 * guard'dan geçirip DuckDB'de çalıştırır; ilk 50 satırı modele döner.
 */
async function runExpertSql(
  input: Record<string, unknown>
): Promise<unknown> {
  const spec = await ensureGridSpec()
  if (!spec || spec.columns.length === 0) {
    return {
      status: "error",
      error: "Açık tablo yok.",
      hint: "Sonuç tablosu henüz yüklenmedi; birkaç saniye sonra tekrar deneyin.",
    }
  }

  const rawSql = typeof input.sql === "string" ? input.sql : ""
  const guard = guardReadOnlySelect(rawSql)
  if (!guard.ok) {
    return { status: "error", error: guard.error, hint: guard.hint }
  }

  try {
    const { duckDbClient } = await import("@/services/duckdb")
    const rows = await duckDbClient.executeCustomSql(guard.sql)
    const MAX_OUTPUT_ROWS = 50
    // silent = keşif/doğrulama sorgusu: ekrana tablo kartı basılmaz,
    // çıktı yine de MODELE tam döner.
    const display = input.display === "silent" ? "silent" : "card"
    return {
      status: "ok",
      rowCount: rows.length,
      note: guard.limited
        ? `LIMIT 200 otomatik eklendi; çıktı ilk ${MAX_OUTPUT_ROWS} satırla döndürüldü.`
        : `Çıktı ilk ${MAX_OUTPUT_ROWS} satırla döndürüldü.`,
      rows: rows.slice(0, MAX_OUTPUT_ROWS),
    }
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      hint: `SQL sözdizimini ve kolon adlarını kontrol et. Kolonlar: ${spec.columns.join(", ")}`,
    }
  }
}

/**
 * Özel SQL görünümünü kaldırıp temel tabloya döner (şema geri yükleme dahil).
 * set_grid_query{reset:true}, gridin "normal görünüme dön" butonu ve
 * "Yeni Sohbet" birlikte kullanır. SADECE customQuerySql'i sıfırlamak
 * YETERLİ DEĞİLDİR: set_grid_query spec.columns'u türetilmiş kolonlarla
 * ezmişti; describeTable ile temel şema + tipler geri yüklenmezse Yula
 * eski (türetilmiş) kolonlara habersizce devam eder.
 */
export async function resetGridCustomView(): Promise<void> {
  const store = useYulaGridStore.getState();
  store.setCustomQuerySql(null);
  store.setFilters({});
  store.runtimeApi?.clearAll();
  const spec = store.spec;
  if (!spec) return;
  try {
    const { duckDbClient } = await import("@/services/duckdb");
    const { deriveColumnKind } = await import(
      "@/features/jobs/lib/column-type-utils"
    );
    const base = await duckDbClient.describeTable(spec.tableName);
    if (base.length > 0) {
      store.register({
        ...spec,
        columns: base.map((c) => c.name),
        // Tipler DESCRIBE'dan (yetkili kaynak); örnek veriler/sözlük temizlenir
        columnTypes: Object.fromEntries(
          base.map((c) => [
            c.name,
            deriveColumnKind(c.duckType, c.isNumeric),
          ]),
        ),
        sampleRows: undefined,
        columnValues: undefined,
      });
    }
  } catch {
    // şema geri yükleme başarısız olsa da görünüm zaten sıfırlandı
  }
}

/**
 * set_grid_query — modelin yazdığı salt-okunur SELECT'i guard'dan geçirip
 * DuckDB'de koşar ve gridi bu sonuç kümesiyle yeniler (gruplama/aggregate
 * görünümleri). reset:true → temel tablo görünümüne dönüş.
 */
async function setGridQuery(
  input: Record<string, unknown>
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec || spec.columns.length === 0) {
    return {
      status: "error",
      error: "Açık tablo yok.",
      hint: "Sonuç tablosu henüz yüklenmedi; birkaç saniye sonra tekrar deneyin.",
    };
  }

  // ÖNCELİK: dolu sql HER ZAMAN kazanç — model "reset + sql"i birlikte
  // gönderirse sql'e uygulanan reset yerine sorgu uygulanır (aksi halde
  // model niyeti gerçekleşmeyince aynı çağrıyı tekrarlamak zorunda kalır).
  // reset:true yalnız sql yokken anlamlıdır.
  const hasSql = typeof input.sql === "string" && input.sql.trim().length > 0;

  if (!hasSql) {
    if (input.reset === true) {
      await resetGridCustomView();
      return {
        status: "ok",
        reset: true,
        message: "Özel sorgu kaldırıldı; temel tablo görünümüne dönüldü.",
      };
    }
    return {
      status: "error",
      error: "set_grid_query için sql gerekli.",
      hint: 'Yeni görünüm için sql gönder; yalnız temel görüne dönmek için {"reset": true}.',
    };
  }

  // Grid görünümü TÜM grupları göstermeli: model run_expert_sql alışkanlığıyla
  // LIMIT 50 gibi bir sınır yazarsa soyulur; güvenlik sınırını guard ekler.
  const cleanedSql = (input.sql as string).replace(/\s+LIMIT\s+\d+\s*$/i, "").trim();
  const guard = guardReadOnlySelect(cleanedSql, 500);
  if (!guard.ok) {
    return { status: "error", error: guard.error, hint: guard.hint };
  }

  // Sorgu açık tabloya referans vermeli (tableName yalnız [A-Za-z0-9_])
  if (!new RegExp(spec.tableName, "i").test(guard.sql)) {
    return {
      status: "error",
      error: `Sorgu açık tabloya (${spec.tableName}) referans vermiyor.`,
      hint: `FROM ya da JOIN ile ${spec.tableName} tablosunu kullan.`,
    };
  }

  try {
    const { duckDbClient } = await import("@/services/duckdb");
    const rows = await duckDbClient.executeCustomSql(guard.sql);
    const first = rows[0] as Record<string, unknown> | undefined;
    const columns = first ? Object.keys(first) : [];
    const title = typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : null;
    store.setCustomQuerySql(guard.sql, title);
    // Bağlam zarfı ve sonraki araç çağrıları türetilmiş kolonları görsün
    if (columns.length > 0) {
      store.register({ ...spec, title: title ?? spec.title, columns });
    }
    return {
      status: "ok",
      sql: guard.sql,
      title: title ?? spec.title,
      rowCount: rows.length,
      columns,
      message: `Grid "${title ?? spec.title}" görünümüyle yenilendi (${rows.length} satır).`,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      hint: `SQL sözdizimini ve kolon adlarını kontrol et. Kolonlar: ${spec.columns.join(", ")}`,
    };
  }
}

/**
 * visualize_grid_data — modelin ürettiği grafik KONFİGÜRASYONUNU deterministik
 * DuckDB aggregasyonuyla veriye çevirir. Model satır verisi taşımaz; kart
 * dönen gerçek satırlardan çizilir (transkripsiyon hatası imkânsızlaşır).
 */
async function visualizeGrid(
  input: Record<string, unknown>,
): Promise<unknown> {
  const ds = await resolveActiveDataset();
  if (!ds) {
    return {
      status: "error",
      error: "Açık tablo yok.",
      hint: "Sonuç tablosu henüz yüklenmedi; birkaç saniye sonra tekrar deneyin.",
    };
  }

  const chartType = String(input.chartType ?? "bar");
  if (!["bar", "line", "pie"].includes(chartType)) {
    return {
      status: "error",
      error: `Geçersiz grafik tipi: ${chartType}`,
      hint: "chartType bar | line | pie olmalı.",
    };
  }

  // Yeni kontrat: dimensionX/dimensionY. Eski konuşma geçmişi için
  // labelKey/valueKeys toleransı korunur.
  const labelKey = String(input.dimensionX ?? input.labelKey ?? "").trim();
  const valueKeys = (
    Array.isArray(input.dimensionY)
      ? input.dimensionY
      : typeof input.dimensionY === "string"
        ? [input.dimensionY]
        : Array.isArray(input.valueKeys)
          ? input.valueKeys
          : []
  ).map(String);
  const aggregation = (["sum", "avg", "min", "max", "count"] as const).includes(
    input.aggregation as "sum",
  )
    ? (input.aggregation as "sum" | "avg" | "min" | "max" | "count")
    : "sum";

  if (!labelKey || !ds.columns.includes(labelKey)) {
    return {
      status: "error",
      error: `Geçersiz kategori kolonu: ${labelKey}`,
      availableColumns: ds.columns,
      hint: "dimensionX, availableColumns içinden bir metin kolonu olmalı.",
    };
  }

  const invalid = valueKeys.filter((k) => !ds.columns.includes(k));
  if (aggregation !== "count" && (valueKeys.length === 0 || invalid.length > 0)) {
    return {
      status: "error",
      error:
        invalid.length > 0
          ? `Geçersiz ölçü kolonları: ${invalid.join(", ")}`
          : "dimensionY boş olamaz.",
      numericColumns: [...ds.numeric],
      hint: "dimensionY, numericColumns içinden sayısal kolonlar olmalı.",
    };
  }
  const nonNumeric = valueKeys.filter((k) => !ds.numeric.has(k));
  if (nonNumeric.length > 0) {
    return {
      status: "error",
      error: `Sayısal olmayan ölçü kolonları: ${nonNumeric.join(", ")}`,
      numericColumns: [...ds.numeric],
      hint: "Aynı aracı numericColumns içinden kolonlarla tekrar çağır.",
    };
  }

  // count → ölçü kolonu gerekmez; kart tek "Kayıt" serisi görür
  const seriesNames =
    aggregation === "count" && valueKeys.length === 0
      ? ["Kayıt"]
      : valueKeys;

  const { buildChartQuery } = await import("@/lib/chart-query");
  const sql = buildChartQuery({
    fromExpr: ds.from,
    labelKey,
    valueKeys: aggregation === "count" ? [] : valueKeys,
    aggregation,
    limit: typeof input.limit === "number" ? input.limit : undefined,
  });
  if (!sql) {
    return { status: "error", error: "Grafik sorgusu üretilemedi." };
  }

  try {
    const { duckDbClient } = await import("@/services/duckdb");
    const rows = await duckDbClient.executeCustomSql(sql);
    if (rows.length === 0) {
      return {
        status: "error",
        error: "Sorgu boş sonuç döndürdü; farklı kolonlarla deneyin.",
      };
    }
    return {
      status: "ok",
      sql,
      chart: {
        chartType,
        title:
          typeof input.title === "string" && input.title.trim()
            ? input.title.trim()
            : `${labelKey} bazlı grafik`,
        description:
          typeof input.description === "string" ? input.description : undefined,
        takeaway:
          typeof input.takeaway === "string" ? input.takeaway : undefined,
        dimensionX: labelKey,
        dimensionY: seriesNames,
        aggregation,
      },
      rowCount: rows.length,
      rows,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      hint: "Kolon tiplerini kontrol et; sayısal ölçü kolonları kullan.",
    };
  }
}

/** "qty"/"miktar" gibi takma adları gerçek kolona gevşekçe eşler */function resolveFieldLoose(
  field: string,
  columns: string[],
): string | undefined {
  const f = field.toLowerCase().trim();
  if (columns.includes(field)) return field;
  const direct = columns.find((c) => c.toLowerCase() === f);
  if (direct) return direct;
  const partial = columns.filter((c) => c.toLowerCase().includes(f));
  if (partial.length === 1) return partial[0];
  return undefined;
}

async function applyFilter(
  field: string,
  value: string,
  op: string,
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  let spec = await ensureGridSpec();

  if (field === "*") {
    store.runtimeApi?.clearAll();
    store.setFilters({});
    return {
      status: "ok",
      clearedAll: true,
      message:
        "Tüm filtreler temizlendi; tablo tam veri kümesine döndürülüyor.",
    };
  }

  if (!spec) {
    return { status: "error", error: "Açık tablo yok." };
  }

  let resolved = resolveFieldLoose(field, spec.columns) ?? undefined;
  let viewReset = false;

  // İstenen kolon ÖZEL GÖRÜNÜMDE (gruplama/aggregate) yoksa: görünüme filtre
  // yapıştırmanın anlamı yok (o kolonun hücresi bile görünmez). Temel tabloya
  // dönüp filtrelemek kullanıcının niyetidir (örn. özel özet görünümdeyken
  // "BATCH-007 filtrele" → temel kayıtlar istenir).
  const customActive = !!useYulaGridStore.getState().customQuerySql;
  if ((!resolved || !spec.columns.includes(resolved)) && customActive) {
    await resetGridCustomView();
    spec = (await ensureGridSpec()) ?? spec;
    resolved = resolveFieldLoose(field, spec.columns) ?? undefined;
    viewReset = !!resolved;
  }

  if (!resolved || !spec.columns.includes(resolved)) {
    return {
      status: "error",
      error: `Filtre için geçersiz kolon: ${field}`,
      availableColumns: spec.columns,
    };
  }
  field = resolved;

  let mapped = value.trim();

  // Deterministik boş/dolu op'ları → D365 karşılıkları ("boş olanlar" vaka çözümü):
  //   op:"empty"    → "''"    (NULL veya boş metin)
  //   op:"notEmpty" → "<>''"  (dolu kayıtlar)
  // NOT: value:"" (gerçekten boş string) hâlâ "filtre kaldır" demektir.
  if (op === "empty") mapped = "''";
  else if (op === "notEmpty") mapped = "<>''";

  if (mapped === "") {
    const next = { ...store.filters };
    delete next[resolved];
    store.setFilters(next);
    return {
      status: "ok",
      removedFilter: field,
      message: `${field} filtresi kaldırıldı.`,
    };
  }

  // D365 ifadesi mi? → OLDUĞU GİBİ geç (grid parser tam kuralları bilir)
  const isD365 =
    /[><=|&!*@]/.test(mapped) ||
    mapped.includes("..") ||
    mapped === "''" ||
    mapped === '""' ||
    mapped === "<>''";

  if (!isD365) {
    if (op === "contains") mapped = `%${mapped}%`;
    else if (op === "gt") mapped = `>${mapped}`;
    else if (op === "lt") mapped = `<${mapped}`;
  }

  // 1) Gridin gerçek filtre hücresini güncelle. runtimeApi YOKSA grid bağlı
  //    değildir: mağaza aynasına tek başına yazmak "filtre uygulandı" yalanı
  //    üretir (araç ok der ama hücre/query güncellenmez) → dürüst hata dön.
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    console.warn(
      "[Yula filter] runtimeApi yok — grid bağlantısı kapalı; filtre uygulanamadı:",
      resolved,
      mapped,
    );
    return {
      status: "error",
      error: "Açık grid bulunamadı; filtre uygulanamadı.",
      hint: "Rapor sonuç ekranı açıkken tekrar deneyin.",
    };
  }
  runtimeApi.applyFilter(resolved, mapped);
  // 2) Mağaza aynası güncel kalsın (bağlam zarfı kaynağı)
  store.setFilters((prev) => ({ ...prev, [resolved]: mapped }));
  return {
    status: "ok",
    appliedFilter: { field: resolved, op, value },
    viewReset,
    message: `"${field}" → ${resolved} kolonuna filtre uygulandı; tablo yenileniyor.${
      viewReset
        ? " (İstenen kolon önceki gruplama görünümünde olmadığı için temel tabloya dönüldü.)"
        : ""
    }`,
  };
}

export async function executeClientTool(
  toolName: string,
  input: unknown,
): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case "prepare_report_criteria":
      // Kart katmanı kaldırıldı — eski konuşmalardaki bekleyen çağrılar
      // sessizce kapatılır.
      return { status: "skipped", message: "Kriter kartı akışı kaldırıldı." };
    case "run_report": {
      const scope = String(args.report ?? "");
      const meta =
        (
          await import("@/features/reports/report-registry")
        ).findReport(scope);
      if (!meta) {
        return { status: "error", error: `Bilinmeyen rapor: ${scope}` };
      }
      try {
        const { validateCriteria } = await import(
          "@/features/report-criteria"
        );
        const criteriaObj = { ...((args.criteria ?? {}) as Record<string, unknown>) };

        // Relative date synthesizer & default fallback for date criteria
        if (!criteriaObj.kayitTarihi) {
          const today = new Date().toISOString().slice(0, 10);
          criteriaObj.kayitTarihi = today;
        } else if (typeof criteriaObj.kayitTarihi === "string") {
          const val = criteriaObj.kayitTarihi.toLowerCase().trim();
          if (val.includes("hafta")) {
            const end = new Date();
            const start = new Date();
            start.setDate(end.getDate() - 7);
            criteriaObj.kayitTarihi = `${start.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}`;
          } else if (val.includes("dün") || val.includes("dun")) {
            const dun = new Date();
            dun.setDate(dun.getDate() - 1);
            criteriaObj.kayitTarihi = dun.toISOString().slice(0, 10);
          } else if (val.includes("bugün") || val.includes("bugun")) {
            criteriaObj.kayitTarihi = new Date().toISOString().slice(0, 10);
          } else if (val.includes("ay")) {
            const end = new Date();
            const start = new Date();
            start.setDate(1);
            criteriaObj.kayitTarihi = `${start.toISOString().slice(0, 10)}..${end.toISOString().slice(0, 10)}`;
          }
        }

        const result = validateCriteria(
          meta.fullSchema,
          criteriaObj,
        );
        if (!result.valid) {
          return {
            status: "validation-error",
            errors: result.errors.map((e) => e.message).slice(0, 5),
            hint: "Kriter formuyla düzeltin veya criteria alanlarını tamamlayın.",
          };
        }
        if (!result.jobEndpoint) {
          return { status: "error", error: "Şemada x-job-endpoint yok." };
        }
        const { createArrowJob } = await import(
          "@/features/jobs/arrow-job-client"
        );
        const job = await createArrowJob(result.jobEndpoint, result.instance);
        return {
          status: "executed",
          jobId: job.id,
          jobStatus: job.status,
          navigateTo: `${meta.pagePath}/${job.id}`,
          message: `Job başlatıldı (${job.id}). Sonuç ekranı açılıyor.`,
        };
      } catch (err) {
        return {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    case "analyze_grid_data":
      return analyzeGrid(args);
    case "profile_grid_table":
      return profileGrid();
    case "run_expert_sql":
      return runExpertSql(args);
    case "get_report_schema":
      return getReportSchema();
    case "visualize_grid_data":
      return visualizeGrid(args);
    case "set_grid_query":
      return setGridQuery(args);
    case "request_user_confirmation":
      return {
        confirmed: false,
        message: "İnsan onayı kartı bekleniyor.",
      };
    case "filter_current_grid": {
      const field = String(args.field ?? "");
      const value = String(args.value ?? "");
      return await applyFilter(field, value, String(args.op ?? "eq"));
    }
    default:
      return { status: "unknown-tool", toolName };
  }
}
