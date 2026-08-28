/**
 * Microsoft Dynamics 365 (Business Central / NAV / F&O) uyumlu filtre eşleştirici.
 *
 * Tarih ve Ondalıklı Alan Desteği:
 * - Ondalıklı sayılar: Hem nokta (`.`) hem virgül (`,`) ondalık ayracı olarak desteklenir.
 *   Örnekler: `> 10.5`, `< 10,5`, `10.5..50.25`, `10,5..50,25`, `1.250,50`
 * - Tarih alanları: ISO (`YYYY-MM-DD`), Avrupa/Türkçe (`DD.MM.YYYY`, `DD/MM/YYYY`) desteklenir.
 *   Örnekler: `> 01.08.2026`, `2026-01-01..2026-12-31`, `01.01.2026..31.12.2026`, `..15.08.2026`
 */

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${escaped}$`, "i")
}

/**
 * Ondalıklı ve binlik ayraçlı sayıları güvenli şekilde number tipine dönüştürür.
 * Desteklenen formatlar: `123`, `123.45`, `123,45`, `1,234.56`, `1.234,56`
 */
function parseNumber(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // 1.234,56 (Türkçe/Avrupa binlik nokta, ondalık virgül)
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(trimmed)) {
    const normalized = trimmed.replace(/\./g, "").replace(",", ".")
    const n = parseFloat(normalized)
    return isNaN(n) ? null : n
  }

  // 1,234.56 (US/İngilizce binlik virgül, ondalık nokta)
  if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(trimmed)) {
    const normalized = trimmed.replace(/,/g, "")
    const n = parseFloat(normalized)
    return isNaN(n) ? null : n
  }

  // 123,45 (Virgüllü ondalık)
  if (/^-?\d+(?:,\d+)?$/.test(trimmed)) {
    const normalized = trimmed.replace(",", ".")
    const n = parseFloat(normalized)
    return isNaN(n) ? null : n
  }

  // 123.45 (Noktalı ondalık)
  if (/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    const n = parseFloat(trimmed)
    return isNaN(n) ? null : n
  }

  return null
}

/**
 * ISO veya DD.MM.YYYY / DD/MM/YYYY formatındaki tarihleri timestamp milisaniyeye dönüştürür.
 */
function parseDateToTimestamp(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // DD.MM.YYYY veya DD/MM/YYYY
  const euMatch = trimmed.match(
    /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/
  )
  if (euMatch) {
    const day = parseInt(euMatch[1], 10)
    const month = parseInt(euMatch[2], 10) - 1
    const year = parseInt(euMatch[3], 10)
    const hours = parseInt(euMatch[4] ?? "0", 10)
    const mins = parseInt(euMatch[5] ?? "0", 10)
    const secs = parseInt(euMatch[6] ?? "0", 10)
    const d = new Date(year, month, day, hours, mins, secs)
    if (!isNaN(d.getTime())) return d.getTime()
  }

  // YYYY-MM-DD veya ISO
  const isoMatch = trimmed.match(
    /^(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?:[\sT](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/
  )
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10) - 1
    const day = parseInt(isoMatch[3], 10)
    const hours = parseInt(isoMatch[4] ?? "0", 10)
    const mins = parseInt(isoMatch[5] ?? "0", 10)
    const secs = parseInt(isoMatch[6] ?? "0", 10)
    const d = new Date(year, month, day, hours, mins, secs)
    if (!isNaN(d.getTime())) return d.getTime()
  }

  return null
}

function matchSingleCondition(cellValue: unknown, query: string): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true

  const cellStr = cellValue == null ? "" : String(cellValue).trim()
  const cellLower = cellStr.toLowerCase()

  // 1. Boş hücre kontrolü: `''` veya `""`
  if (trimmed === "''" || trimmed === '""') {
    return cellStr === ""
  }

  // 2. Boolean (Mantıksal) alan kontrolü (true/false, yes/no, evet/hayır, 1/0)
  const isCellBool = typeof cellValue === "boolean" || cellLower === "true" || cellLower === "false"
  if (isCellBool) {
    const isCellTrue = cellValue === true || cellLower === "true"
    const trueKeywords = ["true", "yes", "evet", "1", "t", "y", "aktif", "active"]
    const falseKeywords = ["false", "no", "hayır", "0", "f", "n", "pasif", "passive", "inactive"]

    if (trueKeywords.includes(trimmed.toLowerCase())) {
      return isCellTrue
    }
    if (falseKeywords.includes(trimmed.toLowerCase())) {
      return !isCellTrue
    }
  }

  const cellNum = parseNumber(cellStr)
  const cellDate = parseDateToTimestamp(cellStr)

  // 2. Dynamics 365 Aralıkları: `A..B`, `A..`, `..B`
  // Açık uçlu ..B
  if (trimmed.startsWith("..")) {
    const right = trimmed.slice(2).trim()
    const rightNum = parseNumber(right)
    if (cellNum != null && rightNum != null) {
      return cellNum <= rightNum
    }
    const rightDate = parseDateToTimestamp(right)
    if (cellDate != null && rightDate != null) {
      // Gün sonuna kadar dahil etmek için gün seviyesinde kontrol
      return cellDate <= rightDate + 86399999
    }
  }

  // Açık uçlu A..
  if (trimmed.endsWith("..") && !trimmed.startsWith("..")) {
    const left = trimmed.slice(0, -2).trim()
    const leftNum = parseNumber(left)
    if (cellNum != null && leftNum != null) {
      return cellNum >= leftNum
    }
    const leftDate = parseDateToTimestamp(left)
    if (cellDate != null && leftDate != null) {
      return cellDate >= leftDate
    }
  }

  // Kapalı aralık A..B
  if (trimmed.includes("..")) {
    const [leftPart, rightPart] = trimmed.split("..").map((p) => p.trim())
    if (leftPart && rightPart) {
      const leftNum = parseNumber(leftPart)
      const rightNum = parseNumber(rightPart)
      if (cellNum != null && leftNum != null && rightNum != null) {
        const low = Math.min(leftNum, rightNum)
        const high = Math.max(leftNum, rightNum)
        return cellNum >= low && cellNum <= high
      }

      const leftDate = parseDateToTimestamp(leftPart)
      const rightDate = parseDateToTimestamp(rightPart)
      if (cellDate != null && leftDate != null && rightDate != null) {
        const low = Math.min(leftDate, rightDate)
        const high = Math.max(leftDate, rightDate) + 86399999
        return cellDate >= low && cellDate <= high
      }
    }
  }

  // 3. Karşılaştırma Operatörleri: `>`, `>=`, `<`, `<=`, `<>`, `!=`, `=`
  const opMatch = trimmed.match(/^([><]=?|<>|!=|=)\s*(.+)$/)
  if (opMatch) {
    const op = opMatch[1]
    const rawTarget = opMatch[2].trim()

    // Sayısal karşılaştırma (Ondalıklı sayılar dahil)
    const targetNum = parseNumber(rawTarget)
    if (cellNum != null && targetNum != null) {
      switch (op) {
        case ">":
          return cellNum > targetNum
        case ">=":
          return cellNum >= targetNum
        case "<":
          return cellNum < targetNum
        case "<=":
          return cellNum <= targetNum
        case "=":
          return cellNum === targetNum
        case "<>":
        case "!=":
          return cellNum !== targetNum
      }
    }

    // Tarihsel karşılaştırma
    const targetDate = parseDateToTimestamp(rawTarget)
    if (cellDate != null && targetDate != null) {
      switch (op) {
        case ">":
          return cellDate > targetDate + 86399999
        case ">=":
          return cellDate >= targetDate
        case "<":
          return cellDate < targetDate
        case "<=":
          return cellDate <= targetDate + 86399999
        case "=":
          return cellDate >= targetDate && cellDate <= targetDate + 86399999
        case "<>":
        case "!=":
          return cellDate < targetDate || cellDate > targetDate + 86399999
      }
    }
  }

  // 4. Dynamics 365 `<>` ve `!` Hariç Tutma (Not Equal / Not Contains)
  if (trimmed.startsWith("<>") || trimmed.startsWith("!")) {
    const prefixLen = trimmed.startsWith("<>") ? 2 : 1
    const target = trimmed.slice(prefixLen).trim()
    if (!target) return true

    if (target.includes("*") || target.includes("?")) {
      const rx = wildcardToRegExp(target)
      return !rx.test(cellStr)
    }

    const targetNum = parseNumber(target)
    if (cellNum != null && targetNum != null) {
      return cellNum !== targetNum
    }
    return !cellLower.includes(target.toLowerCase())
  }

  // 5. Dynamics 365 Wildcards: `*` ve `?`
  if (trimmed.includes("*") || trimmed.includes("?")) {
    const rx = wildcardToRegExp(trimmed)
    return rx.test(cellStr)
  }

  // 6. Düz metin eşleşmesi (Contains)
  return cellLower.includes(trimmed.toLowerCase())
}

export function matchCellFilter(
  cellValue: unknown,
  filterQuery: string
): boolean {
  const trimmed = filterQuery.trim()
  if (!trimmed) return true

  // 1. Dynamics 365 `&` (VE / AND): örn. `>100&<500` veya `>01.01.2026&<31.12.2026`
  if (trimmed.includes("&")) {
    const andParts = trimmed.split("&").map((p) => p.trim()).filter(Boolean)
    if (andParts.length > 1) {
      return andParts.every((part) => matchCellFilter(cellValue, part))
    }
  }

  // 2. Dynamics 365 `|` (VEYA / OR): örn. `SKU-001|SKU-002` veya `01.08.2026|15.08.2026`
  if (trimmed.includes("|")) {
    const orParts = trimmed.split("|").map((p) => p.trim()).filter(Boolean)
    if (orParts.length > 1) {
      return orParts.some((part) => matchSingleCondition(cellValue, part))
    }
  }

  return matchSingleCondition(cellValue, trimmed)
}
