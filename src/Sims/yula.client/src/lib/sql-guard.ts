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

/** Statement-level yasaklıklar (DuckDB yazma/şema/dosya işlemleri). */
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

/** DuckDB okuma fonksiyonları — diğer rapor dosyalarına sızmayı engeller. */
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
      error: "SQL boş.",
      hint: "Çalıştırılacak bir SELECT sorgusu yaz.",
    }
  }
  if (trimmed.length > MAX_SQL_LENGTH) {
    return {
      ok: false,
      error: `SQL çok uzun (${trimmed.length} karakter).`,
      hint: `Sorguyu ${MAX_SQL_LENGTH} karakterin altında tut.`,
    }
  }

  const body = trimmed.replace(/;+\s*$/, "")
  if (body.includes(";")) {
    return {
      ok: false,
      error: "Çoklu statement algılandı.",
      hint: "Yalnız TEK bir SELECT gönder; ';' ile ayırma.",
    }
  }

  if (!/^(select|with)\b/i.test(body)) {
    return {
      ok: false,
      error: "Yalnızca SELECT veya WITH (CTE) sorguları çalıştırılabilir.",
      hint: "Sorguyu SELECT ... ya da WITH ... SELECT ... olarak yaz.",
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
      error: `Salt-okunur guard: '${forbidden.toUpperCase()}' kullanılamaz.`,
      hint: "Veriyi yalnız SELECT ile oku; yazma/şema komutları yasaktır.",
    }
  }

  const forbiddenFn = FORBIDDEN_FUNCTION_PATTERNS.find((p) => p.test(masked))
  if (forbiddenFn) {
    return {
      ok: false,
      error: "Salt-okunur guard: dosya okuma fonksiyonları yasaktır.",
      hint: "Yalnızca açık rapor tablosunu (FROM/JOIN) sorgula.",
    }
  }

  const limited = !/\blimit\b/i.test(lowered)
  const sql = limited ? `${body} LIMIT ${rowLimit}` : body
  return { ok: true, sql, limited }
}
