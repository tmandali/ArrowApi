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
  const words = raw.split(/\s+/).filter(Boolean)
  const kept = words.filter((w) => {
    const f = foldTrLocal(w).toLowerCase()
    for (const t of tokens) {
      if (f === t || (t.length >= 4 && f.includes(t))) return false
    }
    return true
  })
  return kept.length > 0 ? kept.join(" ") : raw
}

/**
 * Grid kolonlarını doğal dil kriterine, veri örneklerine veya veri tipine göre eşleştiren çözümleyici.
 */
const COLUMN_SYNONYMS: Record<string, string[]> = {
  status: ["status", "durum", "state", "is_passive", "ispassive", "passive", "pasif", "is_active", "isactive", "aktif", "disabled", "blocked", "engelli"],
  durum: ["status", "durum", "state", "is_passive", "ispassive", "passive", "pasif", "is_active", "isactive", "aktif", "disabled", "blocked", "engelli"],
  item_code: ["item_code", "itemcode", "item", "sku", "code", "kod", "malzeme", "urun", "ürün", "product"],
  itemcode: ["item_code", "itemcode", "item", "sku", "code", "kod", "malzeme", "urun", "ürün", "product"],
  sku: ["item_code", "itemcode", "item", "sku", "code", "kod", "malzeme", "urun", "ürün", "product"],
  code: ["item_code", "itemcode", "item", "sku", "code", "kod", "malzeme", "urun", "ürün", "product"],
  kod: ["item_code", "itemcode", "item", "sku", "code", "kod", "malzeme", "urun", "ürün", "product"],
  description: ["description", "açıklama", "aciklama", "tanım", "tanim", "name", "ad", "adı", "item_description"],
  desc: ["description", "açıklama", "aciklama", "tanım", "tanim", "name", "ad", "adı", "item_description"],
  aciklama: ["description", "açıklama", "aciklama", "tanım", "tanim", "name", "ad", "adı", "item_description"],
  warehouse: ["warehouse", "depo", "ambar", "location", "lokasyon", "tesis", "plant"],
  depo: ["warehouse", "depo", "ambar", "location", "lokasyon", "tesis", "plant"],
  wh: ["warehouse", "depo", "ambar", "location", "lokasyon", "tesis", "plant"],
  date: ["date", "tarih", "time", "posting_date", "tarihi", "islem_tarihi", "kayit_tarihi"],
  tarih: ["date", "tarih", "time", "posting_date", "tarihi", "islem_tarihi", "kayit_tarihi"],
  cost: ["cost", "maliyet", "unit_cost", "birim_maliyet", "price", "fiyat", "tutar", "total_value"],
  fiyat: ["cost", "maliyet", "unit_cost", "birim_maliyet", "price", "fiyat", "tutar", "total_value"],
  price: ["cost", "maliyet", "unit_cost", "birim_maliyet", "price", "fiyat", "tutar", "total_value"],
  tutar: ["cost", "maliyet", "unit_cost", "birim_maliyet", "price", "fiyat", "tutar", "total_value"],
  amount: ["cost", "maliyet", "unit_cost", "birim_maliyet", "price", "fiyat", "tutar", "total_value"],
  balance: ["balance", "bakiye", "quantity", "qty", "miktar", "stok", "stock", "kalan", "mevcut"],
  qty: ["balance", "bakiye", "quantity", "qty", "miktar", "stok", "stock", "kalan", "mevcut"],
  quantity: ["balance", "bakiye", "quantity", "qty", "miktar", "stok", "stock", "kalan", "mevcut"],
  miktar: ["balance", "bakiye", "quantity", "qty", "miktar", "stok", "stock", "kalan", "mevcut"],
  bakiye: ["balance", "bakiye", "quantity", "qty", "miktar", "stok", "stock", "kalan", "mevcut"],
  stok: ["balance", "bakiye", "quantity", "qty", "miktar", "stok", "stock", "kalan", "mevcut"],
  stock: ["balance", "bakiye", "quantity", "qty", "miktar", "stok", "stock", "kalan", "mevcut"],
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
  limit = 3
): string[] {
  if (!columns || columns.length === 0) return []
  const sampleHit = findSampleColumnMatch(appliedValue, columns, sampleRows)
  const shapeSet = new Set(findShapeColumnMatch(appliedValue, columns, sampleRows))
  const cleanReq = requestedColumn
    ? requestedColumn.toLowerCase().replace(/[\s_-]+/g, "")
    : ""
  const synonyms = cleanReq ? COLUMN_SYNONYMS[cleanReq] || [] : []

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
      for (const syn of synonyms) {
        const sc = syn.toLowerCase().replace(/[\s_-]+/g, "")
        if (!sc) continue
        if (t === sc) s = Math.max(s, 90)
        else if (t.startsWith(sc)) s = Math.max(s, 60)
        else if (t.includes(sc)) s = Math.max(s, 45)
      }
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
  for (const col of columns) {
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
  sampleRows?: Array<Record<string, any>>
): string | undefined {
  if (!columns || columns.length === 0) return undefined

  // 0. VERİ KANITI ÖNCE (Arrow şema tipleri + örnek seti): değer örnek satırlarda
  // birebir veya kod-ön ekiyle bulunuyorsa bu, anahtar-kelime ipucundan güçlüdür.
  //   "Sample 8" ItemName örneklerinde birebir varsa → ItemName (hint item_code olsa bile).
  const sampleHit = findSampleColumnMatch(appliedValue, columns, sampleRows)
  if (sampleHit && sampleHit.strength >= 2) return sampleHit.name

  // 0b. ŞEKİL-İMZASI kanıtı: örnek-sette birebir değer yoksa bile veri dokusu
  // uyuşan kolonlar ("Sample 222" ↔ ItemName örneği "Sample 8") adaydır.
  const shapeCols = findShapeColumnMatch(appliedValue, columns, sampleRows)
  if (shapeCols.length === 1) return shapeCols[0]

  // 1. Kullanıcı veya sentezleyici spesifik bir kolon / kavram talep ettiyse
  if (requestedColumn) {
    const cleanReq = requestedColumn.toLowerCase().replace(/[\s_-]+/g, "")

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
      if (sampleHit && best.score < 70) return sampleHit.name
      // Şekil kanıtı ipucunu yalanlıyorsa (Item Code önerildi ama dokusu uyuşmuyor) → uyumlu kolon
      if (shapeCols.length > 0 && !shapeCols.includes(best.name)) {
        return shapeCols[0]
      }
      return best.name
    }

    // 1.2 Eşanlamlı Kavram Eşleşmesi — skorlu: en güçlü sinonym hit kazanır
    const synonyms = COLUMN_SYNONYMS[cleanReq] || []
    if (synonyms.length > 0) {
      let synBest: { name: string; score: number } | undefined
      for (const c of columns) {
        const cNameClean = c.name.toLowerCase().replace(/[\s_-]+/g, "")
        const cLabelClean = (c.label || "").toLowerCase().replace(/[\s_-]+/g, "")
        for (const s of synonyms) {
          const sClean = s.toLowerCase().replace(/[\s_-]+/g, "")
          if (!sClean) continue
          let score = 0
          if (cNameClean === sClean || cLabelClean === sClean) score = 90
          else if (cNameClean.startsWith(sClean) || cLabelClean.startsWith(sClean)) score = 60
          else if (cNameClean.includes(sClean) || cLabelClean.includes(sClean)) score = 45
          else if (sClean.includes(cNameClean) && cNameClean.length >= 3) score = 30
          if (score > (synBest?.score ?? -1)) synBest = { name: c.name, score }
        }
      }
      if (synBest && synBest.score >= 30) {
        if (sampleHit && synBest.score < 70) return sampleHit.name
        if (shapeCols.length > 0 && !shapeCols.includes(synBest.name)) {
          return shapeCols[0]
        }
        return synBest.name
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
