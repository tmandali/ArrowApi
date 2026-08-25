import { extractCleanFilterValue, unwrapQuotedValue } from "@/lib/bc-filter-synthesizer"
import { shapeSignature } from "@/features/jobs/lib/column-digest"

export { extractCleanFilterValue, unwrapQuotedValue }

export interface MinimalGridColumn {
  name: string
  label?: string
  align?: "left" | "right" | "center"
  isNumeric?: boolean
}

const FOLD_TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", I: "i", Ö: "o", Ş: "s", Ü: "u",
}
const foldTrLocal = (s: string): string =>
  s.replace(/[çğıöşüÇĞİIÖŞÜ]/g, (ch) => FOLD_TR_MAP[ch] ?? ch)

/**
 * Filtre değerinden hedef kolonun kendi ad/etiket kelimelerini söker.
 * Örn: kolon "Item Code" + değer "itemname timur" → "timur".
 *
 * Jeneriktir (kelime listesi yok): tokenlar çözümlenen kolonun kendisinden
 * türetilir. Bileşik yazımlar da yakalanır ("itemname" → "item" içerir).
 * Tüm kelimeler sökülecek olsaydı orijinal değer korunur.
 */
export function stripColumnTokensFromValue(
  value: string,
  ...columnNames: Array<string | undefined | null>
): string {
  const raw = String(value ?? "").trim()
  if (!raw || !raw.includes(" ")) {
    // Tek kelimelik değer zaten kolon kelimesi olamaz (kolon eşleşmesi ayrı yapılır)
    if (!raw) return raw
  }
  const tokens = new Set<string>()
  for (const name of columnNames) {
    if (!name) continue
    for (const part of String(name).split(/[^a-zA-Z0-9çğıöşüÇĞİÖŞÜ]+/)) {
      const f = foldTrLocal(part).toLowerCase()
      if (f.length >= 3) tokens.add(f)
    }
  }
  // Yalnızca BAŞTAN soyulur: kavram/nitelik kelimeleri değerin ÖN EKİ olarak
  // yazılır ("item name X"→"X"). Değer İÇİNDEKİ eşleşen kelimeler (örn.
  // "Sample Item 10" içindeki "Item") ASLA silinmez — veri bütünlüğü önce gelir.
  const words = raw.split(/\s+/).filter(Boolean)
  let start = 0
  while (start < words.length) {
    const f = foldTrLocal(words[start]!).toLowerCase()
    const hit = [...tokens].some(
      (t) => f === t || (t.length >= 4 && f.includes(t))
    )
    if (!hit) break
    start++
  }
  const kept = words.slice(start)
  return kept.length > 0 ? kept.join(" ") : raw
}

/**
 * BC filtre ifadesi tespiti: ">500", "100..500", "!Ankara", "SKU*", "<>0" gibi
 * değerler ARANAN LITERAL değil, KISIT ifadesidir → bunlardan örnek/şekil kanıtı
 * üretilmez (ifade imzası yanlış kolona kilitlememesi için).
 */
export function isFilterExpression(value?: string): boolean {
  const t = (value ?? "").trim()
  if (!t) return false
  return /^[<>=!~*|]/.test(t) || /\.\./.test(t)
}

/** BC filtre ifadesinden aranan literal çekirdeği soyar: ">500"→"500", "SKU*"→"SKU". */
function coreLiteral(value?: string): string | undefined {
  if (isFilterExpression(value)) {
    const t = (value ?? "").trim().replace(/^[<>=!~*|]+/, "")
    const core = t.split("..")[0].trim()
    return core || undefined
  }
  return value?.trim() || undefined
}


/**
 * Few-shot örnek-seti eşleşmesi: değerin hangi kolonda yaşadığını Arrow/DuckDB
 * örnek satırlarından bulur. Güç kademeleri: tam=3 > kod-ön eki=2 > içerir=1.
 */
function findSampleColumnMatch(
  appliedValue: string | undefined,
  columns: MinimalGridColumn[],
  sampleRows?: Array<Record<string, any>>
): { name: string; strength: number } | undefined {
  if (!appliedValue || !sampleRows || sampleRows.length === 0) return undefined
  const cleanVal = appliedValue.trim().replace(/^([!<>]=?|<>|!=|\*)/, "").replace(/\*$/, "").toLowerCase()
  if (!cleanVal) return undefined
  const prefixMatch = cleanVal.match(/^([a-zA-Z0-9]+)[-_]/)?.[1]

  let bestHit: { name: string; strength: number } | undefined
  for (const col of columns) {
    for (const row of sampleRows) {
      const sampleVal = String(row[col.name] || "").trim().toLowerCase()
      if (!sampleVal) continue

      let strength = 0
      if (sampleVal === cleanVal) strength = 3
      else if (prefixMatch && (sampleVal.startsWith(prefixMatch + "-") || sampleVal.startsWith(prefixMatch + "_"))) strength = 2
      else if (cleanVal.length >= 3 && sampleVal.includes(cleanVal)) strength = 1

      if (strength > (bestHit?.strength ?? 0)) bestHit = { name: col.name, strength }
    }
  }
  return bestHit
}

/**
 * Deterministik aday listesi (Step-1): Arrow şeması + tipler + örnek kanıtı +
 * şekil imzasından en güçlü `limit` kolonu sıralar. Model (Needle/Gemma) yalnızca
 * bu dar listeden seçim yapar (Step-2); yetkili çözüm yine resolveGridColumn'dadır.
 */
export function resolveColumnCandidates(
  requestedColumn: string | undefined,
  columns: MinimalGridColumn[],
  appliedValue?: string,
  sampleRows?: Array<Record<string, any>>,
  limit = 3,
  columnAliases?: Record<string, string[]>
): string[] {
  if (!columns || columns.length === 0) return []
  const literalVal = coreLiteral(appliedValue)
  const sampleHit = findSampleColumnMatch(literalVal, columns, sampleRows)
  const shapeSet = new Set(findShapeColumnMatch(literalVal, columns, sampleRows))
  const cleanReq = requestedColumn
    ? requestedColumn.toLowerCase().replace(/[\s_-]+/g, "")
    : ""
  const scored = columns.map((c) => {
    const cName = c.name.toLowerCase().replace(/[\s_-]+/g, "")
    const cLabel = (c.label || "").toLowerCase().replace(/[\s_-]+/g, "")
    let s = 0
    for (const t of [cName, cLabel]) {
      if (!t) continue
      if (cleanReq) {
        if (t === cleanReq) s = Math.max(s, 100)
        else if (cleanReq.length >= 3 && t.startsWith(cleanReq)) s = Math.max(s, 70)
        else if (cleanReq.length >= 3 && t.includes(cleanReq)) s = Math.max(s, 50)
        else if (t.length >= 3 && cleanReq.includes(t)) s = Math.max(s, 40)
      }
    }
    // Şema alias'ları (x-ai.columnAliases): kavram eşleşmesi — koddaki sözlük yerine
    const aliases = columnAliases?.[c.name] || []
    for (const phrase of aliases) {
      const aClean = String(phrase).toLowerCase().replace(/[\s_-]+/g, "")
      if (!aClean || !cleanReq) continue
      if (aClean === cleanReq) s = Math.max(s, 95)
      else if (cleanReq.length >= 3 && aClean.startsWith(cleanReq)) s = Math.max(s, 65)
      else if (cleanReq.length >= 3 && aClean.includes(cleanReq)) s = Math.max(s, 45)
    }
    if (sampleHit && sampleHit.name === c.name) {
      s += sampleHit.strength >= 3 ? 80 : sampleHit.strength === 2 ? 60 : 20
    }
    if (shapeSet.has(c.name)) s += 25
    return { name: c.name, s }
  })

  return scored
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.name)
}

/**
 * Örnek-sette birebir değer olmasa bile veri DOKUSU eşleşmesini sağlar.
 * (İmza üretimi tek kaynakta: features/jobs/lib/column-digest.ts)
 */
function findShapeColumnMatch(
  appliedValue: string | undefined,
  columns: MinimalGridColumn[],
  sampleRows?: Array<Record<string, any>>
): string[] {
  if (!appliedValue || !sampleRows || sampleRows.length === 0) return []
  const sig = shapeSignature(appliedValue.trim())
  // Şekilsiz/kaba imzalar kanıt sayılmaz: en az bir rakam (#) VEYA çok parçalı
  // yapı gerekir ("sample 222"→"a #" ✓, "MAIN"→"a" ✗).
  const informative =
    sig.includes("#") || sig.replace(/[\s\-.]/g, "").length > 1
  if (!sig || !informative || !/[a#]/.test(sig.replace(/[\s\-.]/g, ""))) return []

  const matching: string[] = []
  const META_COL = /^(id|row_id|guid)$/i
  for (const col of columns) {
    if (META_COL.test(col.name)) continue // Id gibi meta kolonlar şekil kanıtı üretemez
    for (const row of sampleRows) {
      const sampleVal = String(row[col.name] ?? "").trim()
      if (!sampleVal) continue
      if (shapeSignature(sampleVal) === sig) {
        matching.push(col.name)
        break
      }
    }
  }
  return matching
}

/**
 * Grid kolonlarını doğal dil kriterine, veri örneklerine veya veri tipine göre eşleştiren çözümleyici.
 */
export function resolveGridColumn(
  requestedColumn: string | undefined,
  columns: MinimalGridColumn[],
  appliedValue?: string,
  sampleRows?: Array<Record<string, any>>,
  columnAliases?: Record<string, string[]>
): string | undefined {
  if (!columns || columns.length === 0) return undefined

  // 0. VERİ KANITI ÖNCE (Arrow şema tipleri + örnek seti): değer örnek satırlarda
  // birebir veya kod-ön ekiyle bulunuyorsa bu, anahtar-kelime ipucundan güçlüdür.
  //   "Sample 8" ItemName örneklerinde birebir varsa → ItemName (hint item_code olsa bile).
  // Filtre ifadelerinde kanıt, operatörden SOYULMUŞ çekirdek değerle üretilir:
  // ">500" → "500" (şekil "#"); böylece Id gibi meta kolonlara kilitlemez ve
  // gerçek sayısal kolonlar (Qty/UnitPrice) aday kalır.
  const literalVal = coreLiteral(appliedValue)
  const sampleHit = findSampleColumnMatch(literalVal, columns, sampleRows)
  if (sampleHit && sampleHit.strength >= 2) return sampleHit.name

  // 0b. ŞEKİL-İMZASI kanıtı: örnek-sette birebir değer yoksa bile veri dokusu
  // uyuşan kolonlar ("Sample 222" ↔ ItemName örneği "Sample 8") adaydır.
  const shapeCols = findShapeColumnMatch(literalVal, columns, sampleRows)
  if (shapeCols.length === 1 && !isFilterExpression(appliedValue)) return shapeCols[0]

  // 1. Kullanıcı veya sentezleyici spesifik bir kolon / kavram talep ettiyse
  if (requestedColumn) {
    const cleanReq = requestedColumn.toLowerCase().replace(/[\s_-]+/g, "")

    // Eski dönem kalıntısı "numeric" sahte ipucunu yok say (gerçek tip fallback'ı var)
    if (cleanReq === "numeric") return undefined

    // 1.1 Skorlu ad/etiket eşleşmesi: tam eşleşme > başlangıç > içerir.
    // İlk-hits kazandıran eski davranış, item-code ailesine sistematik eğilim üretiyordu.
    let best: { name: string; score: number } | undefined
    for (const c of columns) {
      const cNameClean = c.name.toLowerCase().replace(/[\s_-]+/g, "")
      const cLabelClean = (c.label || "").toLowerCase().replace(/[\s_-]+/g, "")
      for (const target of [cNameClean, cLabelClean]) {
        if (!target) continue
        let score = 0
        if (target === cleanReq) score = 100
        else if (cleanReq.length >= 3 && target.startsWith(cleanReq)) score = 70
        else if (cleanReq.length >= 3 && target.includes(cleanReq)) score = 50
        else if (target.length >= 3 && cleanReq.includes(target)) score = 40
        if (score > (best?.score ?? -1)) best = { name: c.name, score }
      }
    }
    if (best && best.score >= 40) {
      // Zayıf veri kanıtı (yalnız 'içerir') + zayıf ipucu (<70) → örnek-set kazanır
      if (sampleHit && best.score < 70 && !isFilterExpression(appliedValue)) return sampleHit.name
      // Şekil kanıtı: doğal literallerde ipucu skoruna bakılmaksızın kazanır;
      // ifade çekirdeklerinde (">500"→"500") yalnızca zayıf ipucu yönlendirilir.
      if (
        shapeCols.length > 0 &&
        !shapeCols.includes(best.name) &&
        (best.score < 70 || !isFilterExpression(appliedValue))
      ) {
        return shapeCols[0]
      }
      return best.name
    }
    // 1.1b Şema alias eşleşmesi (x-ai.columnAliases) — isim bulunamadıysa kavram köprüsü
    for (const c of columns) {
      const aliases = columnAliases?.[c.name] || []
      let aBest: number | undefined
      for (const phrase of aliases) {
        const aClean = String(phrase).toLowerCase().replace(/[\s_-]+/g, "")
        if (!aClean || !cleanReq) continue
        let score = 0
        if (aClean === cleanReq) score = 95
        else if (cleanReq.length >= 3 && aClean.startsWith(cleanReq)) score = 65
        else if (cleanReq.length >= 3 && aClean.includes(cleanReq)) score = 45
        aBest = Math.max(aBest ?? -1, score)
      }
      // Alias kanıtı şekil/örnek çelişkisinde yalnızca güçlüyse (95) kazanır
      if (aBest !== undefined && aBest >= 95) {
        if (!shapeCols.length || shapeCols.includes(c.name)) return c.name
      }
    }

    // Kullanıcı açıkça bir kolon türü istemiş ama tabloda bu kolon yoksa:
    // körü körüne başka kolona yönelme — yalnızca veri kanıtı varsa ona güven.
    return sampleHit?.name
  }

  // 2. Semantik Değer Analizi (Boolean / Durum Kavramları)
  if (appliedValue) {
    const valLower = appliedValue.trim().toLowerCase()
    const isPassiveReq = /^(pasif|passive|kapalı|kapali|disabled|blocked|engelli)/i.test(valLower)
    const isActiveReq = /^(aktif|active|açık|acik|enabled)/i.test(valLower)

    if (isPassiveReq || isActiveReq) {
      const statusCol = columns.find((c) => {
        const cNameClean = c.name.toLowerCase()
        const cLabelClean = (c.label || "").toLowerCase()
        return (
          cNameClean.includes("status") ||
          cNameClean.includes("durum") ||
          cNameClean.includes("passiv") ||
          cNameClean.includes("pasif") ||
          cNameClean.includes("activ") ||
          cNameClean.includes("aktif") ||
          cLabelClean.includes("durum") ||
          cLabelClean.includes("pasif") ||
          cLabelClean.includes("aktif")
        )
      })
      if (statusCol) return statusCol.name
      // Tabloda durum/pasif kolonu yoksa undefined dön (ItemCode'a gitmesini engelle)
      return undefined
    }
  }

  // 3. Veri Odaklı Örnekleme Eşleşmesi (Few-Shot Data Grounding)
  // Zayıf kanıt (yalnızca 'içerir', strength=1) bu aşamada kullanılır;
  // güçlü kanıt zaten adım 0'da döndü.
  if (sampleHit) return sampleHit.name
  // Hiçbir ipucu eşleşmediyse şekil-imzası uyuşan ilk kolon
  if (shapeCols.length > 0) return shapeCols[0]

  // 4. Veri Tipi Odaklı Eşleştirme (Type-Driven Fallbacks)
  // 4.1 Tarih Tipi
  const isDatePattern = appliedValue ? /\b\d{4}-\d{2}-\d{2}\b/.test(appliedValue) : false
  if (isDatePattern) {
    const dateCol = columns.find((c) => {
      const sampleVal = sampleRows?.[0] ? String(sampleRows[0][c.name] || "") : ""
      return /\b\d{4}-\d{2}-\d{2}\b/.test(sampleVal) || /date|tarih/i.test(c.name) || /date|tarih/i.test(c.label || "")
    })
    if (dateCol) return dateCol.name
    return undefined
  }

  // 4.2 Sayısal / Metrik Tipi (>0, 100..500 veya sayı)
  const isNumericFilter = appliedValue ? /^([<>]=?|\.\.|[0-9]+(\.[0-9]+)?$)/.test(appliedValue.trim()) : false
  if (isNumericFilter) {
    const numCol = columns.find((c) => {
      if (/^(id|row_id|guid)$/i.test(c.name)) return false
      return c.align === "right" || (sampleRows?.[0] && typeof sampleRows[0][c.name] === "number")
    })
    if (numCol) return numCol.name
    return undefined
  }

  // 5. Kod Deseni ve Yapılandırılmış Arama Terimi Koruması (Pattern-Guarded Fallback)
  if (appliedValue) {
    const valTrimmed = appliedValue.trim()

    // Soru işaretleri veya çoklu doğal dil cümleleri filtre olarak algılanmaz
    if (valTrimmed.includes("?") || valTrimmed.split(/\s+/).length >= 3) {
      return undefined
    }

    // Yaygın sohbet ve bağlaç kelimeleri filtrelenmez
    if (/^(merhaba|selam|günaydın|iyi|tamam|ok|evet|hayır|neden|nasıl|kim|ne|ve|veya|ile|için|olan|olanlar)$/i.test(valTrimmed)) {
      return undefined
    }

    // A. Business Central filtre operatörü içerenler (örn: "!SKU-002", "*Çelik*", "MAIN|ANKARA", ">100")
    const hasBcOperator = /[*!&|<>=]|\.\./.test(valTrimmed)

    // B. Alfanümerik Kod Deseni (örn: "SKU-001", "BATCH_02", "MAIN", "WH01", "ITM-99")
    const isStructuredCode = /^[a-zA-Z0-9_-]{2,30}$/.test(valTrimmed)

    if (hasBcOperator || isStructuredCode) {
      // İlk metin kolonu yerine: tarih görünümlü kolonları da dışla (Posting Date eğilimini kır)
      const descriptiveCol = columns.find(
        (c) =>
          !/^(id|row_id|guid)$/i.test(c.name) &&
          c.align !== "right" &&
          !/date|tarih/i.test(c.name) &&
          !/date|tarih/i.test(c.label || "")
      )
      return descriptiveCol ? descriptiveCol.name : columns[0]?.name
    }
  }

  return undefined
}
