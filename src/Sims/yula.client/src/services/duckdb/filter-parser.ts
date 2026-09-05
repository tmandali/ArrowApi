/**
 * Grid filtre input'larından gelen ifadeleri güvenli SQL WHERE koşullarına dönüştürür.
 * Microsoft Dynamics 365 / Business Central sözdizimi ile %100 uyumludur.
 *
 * Desteklenen Dynamics 365 Sözdizimleri:
 * - `100..` (Büyük Eşit / >= 100)
 * - `..500` (Küçük Eşit / <= 500)
 * - `100..500` (Aralık / Between)
 * - `> 100`, `>= 100`, `< 500`, `<= 500`, `= 250`, `<> 0`, `!= 0`
 * - `&` (VE / AND): `>100&<500`
 * - `|` (VEYA / OR): `SKU-001|SKU-002`, `10|20`
 * - `*` ve `?` (Jokerler): `SKU*`, `*001`, `SKU-0?1`
 * - `!SKU-01` veya `<>SKU-01` (Hariç Tutma)
 * - `''` veya `""` (Boş / Null Değerler)
 * - `@SKU` (Büyük/Küçük Harf Duyarsız)
 * - `SKU-01` (Metin kolonlarında otomatik ILIKE '%SKU-01%')
 */

function escapeSqlString(val: string): string {
  return val.replace(/'/g, "''")
}

function escapeSqlIdentifier(col: string): string {
  return `"${col.replace(/"/g, '""')}"`
}

function isNumericString(val: string): boolean {
  return /^-?\d+(?:\.\d+)?$/.test(val.trim())
}

/**
 * Dynamics 365 Türkçe ve Avrupa tarih formatını (DD.MM.YYYY veya DD-MM-YYYY)
 * DuckDB ve SQL standardı ISO formatına (YYYY-MM-DD) dönüştürür.
 */
function normalizeD365DateValue(val: string): string {
  const trimmed = val.trim()
  const dmyMatch = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/)
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, "0")
    const month = dmyMatch[2].padStart(2, "0")
    const year = dmyMatch[3]
    return `${year}-${month}-${day}`
  }
  return trimmed
}

function convertWildcardsToSqlLike(val: string): string {
  // SQL LIKE pattern: * -> %, ? -> _
  const escaped = escapeSqlString(val)
  return escaped.replace(/\*/g, "%").replace(/\?/g, "_")
}

function buildSingleColumnCondition(
  col: string,
  rawFilter: string,
  isNumeric: boolean
): string | null {
  let trimmed = rawFilter.trim()
  if (!trimmed) return null

  // 1. D365 '@' öneki (Büyük/küçük harf duyarsız arama işareti)
  if (trimmed.startsWith("@")) {
    trimmed = trimmed.slice(1).trim()
    if (!trimmed) return null
  }

  // 2. Boş hücre kontrolü: `''` veya `""`
  if (trimmed === "''" || trimmed === '""') {
    return `(${col} IS NULL OR CAST(${col} AS VARCHAR) = '')`
  }

  // 2b. Dolu hücre kontrolü (boş OLMAYANLAR): `<>''`, `<>""`, `!= ''`, `!''`
  if (/^(?:<>|!=|!)\s*(?:''|"")$/.test(trimmed)) {
    return `(NOT (${col} IS NULL OR CAST(${col} AS VARCHAR) = ''))`
  }

  // 3. Dynamics 365 Açık uçlu aralıklar: `..500` veya `..sku-99` veya `..31.12.2026` (<= maxVal)
  const openStart = trimmed.match(/^\.\.\s*(.+)$/)
  if (openStart) {
    const rawMax = openStart[1].trim()
    if (isNumeric || isNumericString(rawMax)) {
      const num = parseFloat(rawMax)
      if (!isNaN(num)) {
        return isNumeric
          ? `(${col} <= ${num})`
          : `(TRY_CAST(${col} AS DOUBLE) <= ${num})`
      }
    }
    const maxVal = normalizeD365DateValue(rawMax)
    const escaped = escapeSqlString(maxVal)
    return `(UPPER(CAST(${col} AS VARCHAR)) <= '${escaped.toUpperCase()}')`
  }

  // 4. Dynamics 365 Açık uçlu aralıklar: `100..` veya `sku-00..` veya `01.01.2026..` (>= minVal)
  const openEnd = trimmed.match(/^(.+?)\s*\.\.$/)
  if (openEnd) {
    const rawMin = openEnd[1].trim()
    if (isNumeric || isNumericString(rawMin)) {
      const num = parseFloat(rawMin)
      if (!isNaN(num)) {
        return isNumeric
          ? `(${col} >= ${num})`
          : `(TRY_CAST(${col} AS DOUBLE) >= ${num})`
      }
    }
    const minVal = normalizeD365DateValue(rawMin)
    const escaped = escapeSqlString(minVal)
    return `(UPPER(CAST(${col} AS VARCHAR)) >= '${escaped.toUpperCase()}')`
  }

  // 5. Dynamics 365 Kapalı aralık: `100..500` veya `sku-01..sku-05` veya `01.01.2026..31.12.2026`
  const rangeMatch = trimmed.match(/^(.+?)\s*(?:\.\.|\s+-\s+)\s*(.+)$/)
  if (rangeMatch) {
    const rawMin = rangeMatch[1].trim()
    const rawMax = rangeMatch[2].trim()
    if (
      (isNumeric && !isNaN(parseFloat(rawMin)) && !isNaN(parseFloat(rawMax))) ||
      (isNumericString(rawMin) && isNumericString(rawMax))
    ) {
      const min = parseFloat(rawMin)
      const max = parseFloat(rawMax)
      const low = Math.min(min, max)
      const high = Math.max(min, max)
      return isNumeric
        ? `(${col} >= ${low} AND ${col} <= ${high})`
        : `(TRY_CAST(${col} AS DOUBLE) >= ${low} AND TRY_CAST(${col} AS DOUBLE) <= ${high})`
    }
    const minVal = normalizeD365DateValue(rawMin)
    const maxVal = normalizeD365DateValue(rawMax)
    const escMin = escapeSqlString(minVal)
    const escMax = escapeSqlString(maxVal)
    return `(UPPER(CAST(${col} AS VARCHAR)) >= '${escMin.toUpperCase()}' AND UPPER(CAST(${col} AS VARCHAR)) <= '${escMax.toUpperCase()}')`
  }

  // 6. Karşılaştırma operatörleri: `>`, `>=`, `<`, `<=`, `<>`, `!=`, `=`
  const opMatch = trimmed.match(/^(<>|!=|<=|>=|<|>|=)\s*(.+)$/)
  if (opMatch) {
    let op = opMatch[1]
    if (op === "<>") op = "!="
    const rawRight = opMatch[2].trim()

    if (isNumeric || isNumericString(rawRight)) {
      const num = parseFloat(rawRight)
      if (!isNaN(num)) {
        return isNumeric
          ? `(${col} ${op} ${num})`
          : `(TRY_CAST(${col} AS DOUBLE) ${op} ${num})`
      }
    }

    const rightVal = normalizeD365DateValue(rawRight)
    const escaped = escapeSqlString(rightVal)
    if (op === "=") {
      return `(CAST(${col} AS VARCHAR) ILIKE '${escaped}')`
    }
    if (op === "!=") {
      return `(CAST(${col} AS VARCHAR) NOT ILIKE '${escaped}' OR ${col} IS NULL)`
    }
    return `(UPPER(CAST(${col} AS VARCHAR)) ${op} '${escaped.toUpperCase()}')`
  }

  // 7. Not contains / Not equal: `!keyword`
  if (trimmed.startsWith("!")) {
    const rawKeyword = trimmed.slice(1).trim()
    if (!rawKeyword) return null

    if (isNumeric || isNumericString(rawKeyword)) {
      const num = parseFloat(rawKeyword)
      if (!isNaN(num)) {
        return isNumeric
          ? `(${col} != ${num} OR ${col} IS NULL)`
          : `(TRY_CAST(${col} AS DOUBLE) != ${num} OR ${col} IS NULL)`
      }
    }

    const keyword = normalizeD365DateValue(rawKeyword)
    if (keyword.includes("*") || keyword.includes("?")) {
      const pattern = convertWildcardsToSqlLike(keyword)
      return `(CAST(${col} AS VARCHAR) NOT ILIKE '${pattern}' OR ${col} IS NULL)`
    }

    const escaped = escapeSqlString(keyword)
    return `(CAST(${col} AS VARCHAR) NOT ILIKE '${escaped}' OR ${col} IS NULL)`
  }

  // 8. Sayısal kolon eşitlik kontrolü: `100` (eğer tam sayıysa)
  if (isNumeric && isNumericString(trimmed)) {
    const num = parseFloat(trimmed)
    if (!isNaN(num)) {
      return `(${col} = ${num})`
    }
  }

  // 9. Wildcards: `*` ve `?` (örn. `*kelime*`, `kelime*`, `*kelime`)
  if (trimmed.includes("*") || trimmed.includes("?")) {
    const pattern = convertWildcardsToSqlLike(trimmed)
    return `(CAST(${col} AS VARCHAR) ILIKE '${pattern}')`
  }

  // 10. Dynamics 365 Varsayılan Eşitlik (=) Filtresi:
  // D365 standardında operatörsüz veya jokersiz girilen değerler doğrudan tam eşleşmedir (=).
  // Kullanıcı içeren aramak istediğinde D365 standardı olan `*kelime*` veya `kelime*` yazar.
  const normalizedText = normalizeD365DateValue(trimmed)
  const escaped = escapeSqlString(normalizedText)
  return `(CAST(${col} AS VARCHAR) ILIKE '${escaped}')`
}

/**
 * Dynamics 365 `&` (VE / AND) ifadesini işler: örn. `>100&<500`
 */
function buildAndCondition(
  col: string,
  filterPart: string,
  isNumeric: boolean
): string | null {
  const trimmed = filterPart.trim()
  if (!trimmed) return null

  if (trimmed.includes("&")) {
    const andParts = trimmed.split("&").map((p) => p.trim()).filter(Boolean)
    const andClauses = andParts
      .map((part) => buildSingleColumnCondition(col, part, isNumeric))
      .filter((c): c is string => c !== null)

    if (andClauses.length > 0) {
      return `(${andClauses.join(" AND ")})`
    }
  }

  return buildSingleColumnCondition(col, trimmed, isNumeric)
}

export function buildColumnWhereClause(
  columnName: string,
  rawFilter: string,
  isNumeric: boolean
): string | null {
  const trimmed = rawFilter.trim()
  if (!trimmed) return null

  const col = escapeSqlIdentifier(columnName)

  // 1. Dynamics 365 `|` veya `,` (VEYA / OR): örn. `SKU-001|SKU-002`, `10..20|30..40`
  if (trimmed.includes("|") || (trimmed.includes(",") && !/^-?\d+,\d+$/.test(trimmed))) {
    const orParts = trimmed.split(/[,|]/).map((p) => p.trim()).filter(Boolean)
    const orClauses = orParts
      .map((part) => buildAndCondition(col, part, isNumeric))
      .filter((c): c is string => c !== null)

    if (orClauses.length > 0) {
      return `(${orClauses.join(" OR ")})`
    }
  }

  return buildAndCondition(col, trimmed, isNumeric)
}

export function buildCombinedWhereClause(
  filters: Record<string, string>,
  numericColumns: Set<string>
): string {
  const clauses: string[] = []

  for (const [colName, val] of Object.entries(filters)) {
    if (!val || !val.trim()) continue
    const isNum = numericColumns.has(colName)
    const clause = buildColumnWhereClause(colName, val, isNum)
    if (clause) {
      clauses.push(clause)
    }
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""
}
