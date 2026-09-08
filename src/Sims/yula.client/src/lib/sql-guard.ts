/**
 * Salt-okunur SELECT guard — `run_expert_sql` aracı için saf modül.
 * Modelin ürettiği SQL, istemcideki DuckDB'ye verilmeden önce burada doğrulanır;
 * çerçevesiz olduğundan test edilebilirlik desenine uyar.
 */

export interface SqlGuardOk {
  ok: true
  /** Çalıştırılmaya hazır (LIMIT zorunlu tutulmuş) sorgu */
  sql: string
  /** LIMIT yoktu ve otomatik eklendi */
  limited: boolean
}

export interface SqlGuardError {
  ok: false
  error: string
  hint: string
}

export type SqlGuardResult = SqlGuardOk | SqlGuardError

/** Statement-level yasaklıklar (yazma/şema/dosya işlemleri). */
const FORBIDDEN_KEYWORDS = [
  "insert",
  "update",
  "delete",
  "drop",
  "alter",
  "create",
  "truncate",
  "copy",
  "attach",
  "detach",
  "pragma",
  "call",
  "reset",
  "export",
  "import",
  "install",
  "load",
  "vacuum",
  "checkpoint",
  "grant",
  "revoke",
  "analyze",
] as const

/** okuma fonksiyonları — diğer rapor dosyalarına sızmayı engeller. */
const FORBIDDEN_FUNCTION_PATTERNS: RegExp[] = [
  /\bread_(?:parquet|csv|json|arrow)\s*\(/i,
  /\bglob\s*\(/i,
]

const MAX_SQL_LENGTH = 8000

/**
 * Tek tırnak literal ve çift tırnak identifier'ları maskeler; böylece
 * örn. WHERE not = 'lütfen insert et' ifadesindeki "insert" false-positive olmaz.
 */
function maskQuoted(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""')
}

/**
 * Sorguyu salt-okunur tek SELECT olarak doğrular; LIMIT yoksa ekler.
 * Sondaki ';' kabul edilir, gövdedeki ekstra ';' çoklu statement sayılır.
 */
export function guardReadOnlySelect(
  rawSql: string,
  rowLimit = 200
): SqlGuardResult {
  const trimmed = rawSql.trim()
  if (!trimmed) {
    return {
      ok: false,
      error: "SQL query is empty.",
      hint: "Provide a SELECT query to execute.",
    }
  }
  if (trimmed.length > MAX_SQL_LENGTH) {
    return {
      ok: false,
      error: `SQL query is too long (${trimmed.length} characters).`,
      hint: `Keep the query under ${MAX_SQL_LENGTH} characters.`,
    }
  }

  const body = trimmed.replace(/;+\s*$/, "")
  if (body.includes(";")) {
    return {
      ok: false,
      error: "Multiple statements detected.",
      hint: "Submit only a single SELECT query without semicolons.",
    }
  }

  if (!/^(select|with)\b/i.test(body)) {
    return {
      ok: false,
      error: "Only SELECT or WITH (CTE) queries can be executed.",
      hint: "Write query starting with SELECT or WITH.",
    }
  }

  const masked = maskQuoted(body)
  const lowered = masked.toLowerCase()

  const forbidden = FORBIDDEN_KEYWORDS.find((kw) =>
    new RegExp(`\\b${kw}\\b`).test(lowered)
  )
  if (forbidden) {
    return {
      ok: false,
      error: `Read-only guard: '${forbidden.toUpperCase()}' is forbidden.`,
      hint: "Only read data using SELECT; DDL and mutation statements are forbidden.",
    }
  }

  const forbiddenFn = FORBIDDEN_FUNCTION_PATTERNS.find((p) => p.test(masked))
  if (forbiddenFn) {
    return {
      ok: false,
      error: "Read-only guard: file reading functions are forbidden.",
      hint: "Only query the active report table in FROM/JOIN clauses.",
    }
  }

  const shouldAddLimit = rowLimit > 0 && !/\blimit\b/i.test(lowered);
  const sql = shouldAddLimit ? `${body} LIMIT ${rowLimit}` : body;
  return { ok: true, sql, limited: shouldAddLimit };
}

/**
 * DuckDB rapor tablosu adı kalıbı: `report_<uuid-underscored>`
 * Örn: report_5b4db7dd_2bf3_4d86_ac6d_78fde865e32d
 * Hem tırnaksız hem çift tırnaklı biçimi yakalar.
 */
const REPORT_TABLE_PATTERN =
  /(?:"report_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}"|\breport_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}\b)/gi

/**
 * SQL ifadesi içindeki `active_view` referanslarını ve eski (stale)
 * `report_<uuid>` tablo referanslarını mevcut tablonun adına çözümler.
 *
 * İki sorunu aynı anda giderir:
 * 1. **Infinite recursion**: active_view'ün kendi içinden active_view çağırması
 *    (`CREATE OR REPLACE VIEW active_view AS … FROM active_view`)
 * 2. **Catalog Error**: Kayıtlı sorgunun eski iş tablosuna (`report_d56e92aa_…`)
 *    referans vermesi — yeni rapor farklı bir tablo adına sahip olduğundan
 *    `Table does not exist!` hatası oluşur.
 */
export function resolveActiveViewReferences(sql: string, targetTable: string): string {
  if (!sql || !targetTable) return sql
  const escapedTarget = `"${targetTable.replace(/"/g, '""')}"`

  // 1. Eski/farklı report_<uuid> tablo adlarını mevcut tabloyla değiştir
  let resolved = sql.replace(REPORT_TABLE_PATTERN, (match) => {
    // Mevcut tabloyla aynıysa dokunma
    const bare = match.replace(/"/g, "")
    return bare === targetTable ? match : escapedTarget
  })

  // 2. active_view referanslarını mevcut tabloyla değiştir
  resolved = resolved.replace(
    /(?:"active_view"|'active_view'|\bactive_view\b)/gi,
    escapedTarget
  )

  return resolved
}

/**
 * Bir sorguyu localStorage'a kaydetmeden önce taşınabilir hale getirir:
 * fiziksel tablo adını `active_view` yer tutucusuyla değiştirir.
 * Bu sayede aynı sorgu farklı iş ID'leriyle (farklı tablo adlarıyla) açıldığında
 * doğru çalışmaya devam eder.
 */
export function normalizeQueryForStorage(sql: string, tableName: string): string {
  if (!sql || !tableName) return sql
  // Hem tırnaklı hem tırnaksız biçimi yakala
  const escapedTable = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return sql.replace(
    new RegExp(`(?:"${escapedTable.replace(/"/g, '""')}"|\\b${escapedTable}\\b)`, "gi"),
    "active_view"
  )
}
