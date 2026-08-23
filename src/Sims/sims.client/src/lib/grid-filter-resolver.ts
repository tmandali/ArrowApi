import { extractCleanFilterValue } from "@/lib/bc-filter-synthesizer"

export { extractCleanFilterValue }

export interface MinimalGridColumn {
  name: string
  label?: string
  align?: "left" | "right" | "center"
  isNumeric?: boolean
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
 * Grid kolonlarını doğal dil kriterine, veri örneklerine veya veri tipine göre eşleştiren çözümleyici.
 */
export function resolveGridColumn(
  requestedColumn: string | undefined,
  columns: MinimalGridColumn[],
  appliedValue?: string,
  sampleRows?: Array<Record<string, any>>
): string | undefined {
  if (!columns || columns.length === 0) return undefined

  // 1. Kullanıcı veya sentezleyici spesifik bir kolon / kavram talep ettiyse
  if (requestedColumn) {
    const cleanReq = requestedColumn.toLowerCase().replace(/[\s_-]+/g, "")

    // 1.1 Doğrudan veya İsim/Etiket Eşleşmesi
    const directMatch = columns.find((c) => {
      const cNameClean = c.name.toLowerCase().replace(/[\s_-]+/g, "")
      const cLabelClean = (c.label || "").toLowerCase().replace(/[\s_-]+/g, "")
      return (
        cNameClean === cleanReq ||
        cLabelClean === cleanReq ||
        cNameClean.includes(cleanReq) ||
        cLabelClean.includes(cleanReq)
      )
    })
    if (directMatch) return directMatch.name

    // 1.2 Eşanlamlı Kavram Eşleşmesi (örn: "qty" -> "balance", "status" -> "is_passive", "durum")
    const synonyms = COLUMN_SYNONYMS[cleanReq] || []
    if (synonyms.length > 0) {
      const synonymMatch = columns.find((c) => {
        const cNameClean = c.name.toLowerCase().replace(/[\s_-]+/g, "")
        const cLabelClean = (c.label || "").toLowerCase().replace(/[\s_-]+/g, "")
        return synonyms.some((s) => {
          const sClean = s.toLowerCase().replace(/[\s_-]+/g, "")
          return cNameClean.includes(sClean) || cLabelClean.includes(sClean) || sClean.includes(cNameClean)
        })
      })
      if (synonymMatch) return synonymMatch.name
    }

    // Kullanıcı açıkça bir kolon türü istemiş ama tabloda bu kolon yoksa (örn: tabloda durum kolonu yok), körü körüne başka kolona yönelme!
    return undefined
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
  // Değerin ekrandaki örnek satırlarda hangi kolona ait olduğunu veriden bulur
  if (appliedValue && sampleRows && sampleRows.length > 0) {
    const cleanVal = appliedValue.trim().replace(/^([!<>]=?|<>|!=|\*)/, "").replace(/\*$/, "").toLowerCase()
    const prefixMatch = cleanVal.match(/^([a-zA-Z0-9]+)[-_]/)?.[1]

    for (const col of columns) {
      for (const row of sampleRows) {
        const sampleVal = String(row[col.name] || "").trim().toLowerCase()
        if (!sampleVal) continue

        // A. Tam değer eşleşmesi (örn: "Aktif", "Tamamlandı", "İstanbul", "EUR", "!SKU-020" -> "SKU-020")
        if (sampleVal === cleanVal) {
          return col.name
        }

        // B. Kod ön eki eşleşmesi (örn: örnek satırda "BATCH-001" var, aranan "!BATCH-006")
        if (prefixMatch && (sampleVal.startsWith(prefixMatch + "-") || sampleVal.startsWith(prefixMatch + "_"))) {
          return col.name
        }
      }
    }
  }

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
      const descriptiveCol = columns.find((c) => !/^(id|row_id|guid)$/i.test(c.name) && c.align !== "right")
      return descriptiveCol ? descriptiveCol.name : columns[0]?.name
    }
  }

  return undefined
}
