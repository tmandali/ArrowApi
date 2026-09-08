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
  isNumeric: boolean,
  isBoolean = false
): string | null {
  let trimmed = rawFilter.trim()
  if (!trimmed) return null

  const colTrim = `TRIM(CAST(${col} AS VARCHAR))`

  // 1. D365 '@' öneki (Büyük/küçük harf duyarsız arama işareti)
  if (trimmed.startsWith("@")) {
    trimmed = trimmed.slice(1).trim()
    if (!trimmed) return null
  }

  // 2. Boş hücre kontrolü: `''`, `""`, `' '`, `" "`, `boş`, `bos`, `empty`, `null`
  const emptyKeywords = /^(?:''|""|' '|" "|boş|bos|empty|null)$/i
  if (emptyKeywords.test(trimmed)) {
    return `(${col} IS NULL OR ${colTrim} = '')`
  }

  // 2b. Dolu hücre kontrolü (boş OLMAYANLAR): `<>''`, `<>""`, `!= ''`, `!''`, `dolu`, `not null`
  const notEmptyKeywords = /^(?:(?:<>|!=|!)\s*(?:''|""|' '|" ")|dolu|not\s*null)$/i
  if (notEmptyKeywords.test(trimmed)) {
    return `(${col} IS NOT NULL AND ${colTrim} != '')`
  }

  // 2c. Boolean / Mantıksal Alan Kontrolü: `evet`, `hayır`, `hayir`, `true`, `false`, `1`, `0`
  const trimmedLower = trimmed.toLowerCase()
  const isColLikelyBool =
    isBoolean ||
    /^(?:is_|has_|[a-z0-9_]+(mi|mu|mı|mü)|aktif|pasif|iptal|kapali|onay|kilitli)$/i.test(
      col.replace(/"/g, "")
    )

  const isTrueQuery =
    /^(?:evet|true|yes|aktif|active)$/i.test(trimmedLower) ||
    (isColLikelyBool && (trimmed === "1" || trimmedLower === "e" || trimmedLower === "y"))
  const isFalseQuery =
    /^(?:hayır|hayir|false|no|pasif|passive|inactive)$/i.test(trimmedLower) ||
    (isColLikelyBool && (trimmed === "0" || trimmedLower === "h" || trimmedLower === "n"))

  if (isTrueQuery) {
    return `(TRY_CAST(${col} AS BOOLEAN) = true OR ${colTrim} = '1' OR ${colTrim} ILIKE 'true' OR ${colTrim} ILIKE 'evet')`
  }

  if (isFalseQuery) {
    return `(TRY_CAST(${col} AS BOOLEAN) = false OR ${colTrim} = '0' OR ${colTrim} ILIKE 'false' OR ${colTrim} ILIKE 'hayır' OR ${colTrim} ILIKE 'hayir')`
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
    return `(UPPER(${colTrim}) <= '${escaped.toUpperCase()}')`
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
    return `(UPPER(${colTrim}) >= '${escaped.toUpperCase()}')`
  }

  // 5. Dynamics 365 Kapalı aralık: `100..500` veya `sku-01..sku-05` veya `01.01.2026..31.12.2026`
  // `..` standardı sayı, tarih veya metin aralığı olabilir.
  // ` - ` (tire) ise YALNIZCA her iki taraf da geçerli sayı veya tarih olduğunda aralık sayılır;
  // metinlerde tire ("MERKEZ - ŞUBE") normal metin aramasıdır.
  let isRange = false
  let rawMin = ""
  let rawMax = ""

  const dotRange = trimmed.match(/^(.+?)\s*\.\.\s*(.+)$/)
  if (dotRange) {
    isRange = true
    rawMin = dotRange[1].trim()
    rawMax = dotRange[2].trim()
  } else {
    const dashRange = trimmed.match(/^(.+?)\s+-\s+(.+)$/)
    if (dashRange) {
      const p1 = dashRange[1].trim()
      const p2 = dashRange[2].trim()
      const isNumRange = (isNumeric || isNumericString(p1)) && isNumericString(p2)
      const isDateRange = /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(p1) && /^\d{1,4}[./-]\d{1,2}[./-]\d{1,4}$/.test(p2)
      if (isNumRange || isDateRange) {
        isRange = true
        rawMin = p1
        rawMax = p2
      }
    }
  }

  if (isRange) {
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
    return `(UPPER(${colTrim}) >= '${escMin.toUpperCase()}' AND UPPER(${colTrim}) <= '${escMax.toUpperCase()}')`
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
      return `(${colTrim} ILIKE '${escaped}')`
    }
    if (op === "!=") {
      return `(${colTrim} NOT ILIKE '${escaped}' OR ${col} IS NULL)`
    }
    return `(UPPER(${colTrim}) ${op} '${escaped.toUpperCase()}')`
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
      return `(${colTrim} NOT ILIKE '${pattern}' OR ${col} IS NULL)`
    }

    const escaped = escapeSqlString(keyword)
    return `(${colTrim} NOT ILIKE '%${escaped}%' OR ${col} IS NULL)`
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
    return `(${colTrim} ILIKE '${pattern}')`
  }

  // 10. Tırnak içine alınmış tam arama: `"Elma Sirkesi"` veya `'Elma Sirkesi'`
  const quotedMatch = trimmed.match(/^["'](.*)["']$/)
  if (quotedMatch) {
    const inner = quotedMatch[1].trim()
    const escaped = escapeSqlString(inner)
    return `(${colTrim} ILIKE '%${escaped}%')`
  }

  // 11. Çoklu Kelime & İçerir (Contains / Multi-word Token Matching):
  // Kullanıcı arama kutusuna "Elma Sirke" veya "Elma" girdiğinde:
  // Veride "Elma Sirkesi", "Kırmızı Elma" gibi boşluk içeren kayıtlar filtrelenir.
  // Boşlukla ayrılmış her token bağımsız olarak ILIKE '%token%' şeklinde AND'lenir.
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length > 1) {
    const clauses = words.map((w) => {
      const normalizedWord = normalizeD365DateValue(w)
      const esc = escapeSqlString(normalizedWord)
      return `${colTrim} ILIKE '%${esc}%'`
    })
    return `(${clauses.join(" AND ")})`
  }

  const normalizedText = normalizeD365DateValue(trimmed)
  const escaped = escapeSqlString(normalizedText)
  return `(${colTrim} ILIKE '%${escaped}%')`
}

/**
 * Dynamics 365 `&` (VE / AND) ifadesini işler: örn. `>100&<500`
 */
function buildAndCondition(
  col: string,
  filterPart: string,
  isNumeric: boolean,
  isBoolean = false
): string | null {
  const trimmed = filterPart.trim()
  if (!trimmed) return null

  if (trimmed.includes("&")) {
    const andParts = trimmed.split("&").map((p) => p.trim()).filter(Boolean)
    const andClauses = andParts
      .map((part) => buildSingleColumnCondition(col, part, isNumeric, isBoolean))
      .filter((c): c is string => c !== null)

    if (andClauses.length > 0) {
      return `(${andClauses.join(" AND ")})`
    }
  }

  return buildSingleColumnCondition(col, trimmed, isNumeric, isBoolean)
}

export function buildColumnWhereClause(
  columnName: string,
  rawFilter: string,
  isNumeric: boolean,
  isBoolean = false
): string | null {
  const trimmed = rawFilter.trim()
  if (!trimmed) return null

  const col = escapeSqlIdentifier(columnName)

  // 1. Dynamics 365 `|` veya `,` (VEYA / OR): örn. `SKU-001|SKU-002`, `10..20|30..40`
  if (trimmed.includes("|") || (trimmed.includes(",") && !/^-?\d+,\d+$/.test(trimmed))) {
    const orParts = trimmed.split(/[,|]/).map((p) => p.trim()).filter(Boolean)
    const orClauses = orParts
      .map((part) => buildAndCondition(col, part, isNumeric, isBoolean))
      .filter((c): c is string => c !== null)

    if (orClauses.length > 0) {
      return `(${orClauses.join(" OR ")})`
    }
  }

  return buildAndCondition(col, trimmed, isNumeric, isBoolean)
}

export function buildCombinedWhereClause(
  filters: Record<string, string>,
  numericColumns: Set<string> = new Set(),
  booleanColumns: Set<string> = new Set()
): string {
  const clauses: string[] = []

  for (const [colName, val] of Object.entries(filters)) {
    if (!val || !val.trim()) continue
    const isNum = numericColumns.has(colName)
    const isBool = booleanColumns.has(colName)
    const clause = buildColumnWhereClause(colName, val, isNum, isBool)
    if (clause) {
      clauses.push(clause)
    }
  }

  return clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : ""
}
