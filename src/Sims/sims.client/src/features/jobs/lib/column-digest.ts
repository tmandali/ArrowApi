/**
 * Kolon sindirimi (schema digest): Needle/Gemma bağlamına ucuz şekilde
 * "hangi kolon neye benzer" bilgisini taşıyan saf yardımcılar.
 * Karar yetkilisi yine frontend execution katmanıdır; bu özet yalnızca
 * SLM/LLM'in ipucu kalitesini artırır.
 */

/** Değerin şekil imzası: harf dizileri→"a", sayı dizileri→"#". ("Sample 222" → "a #") */
export function shapeSignature(v: string): string {
  return v
    .replace(/^([!<>]=?|<>|!=|\*)/, "")
    .toLowerCase()
    // Türkçe İ/ı gibi harfler lowercase'de kombinasyonlu işaret üretebilir
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[a-z]+/g, "a")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
}

export interface ColumnDigestEntry {
  /** İnsan-okur etiket (varsa) — modelin anlam yorumunu sabitler */
  label?: string
  /** Örnek değerin şekil imzası */
  shape: string
  /** Temsili örnek değer (kırpılmış) */
  example: string
}

export interface MinimalDigestColumn {
  name: string
  /** İnsan-okur etiket — AI bağlamında anlam grounding'i sağlar */
  label?: string
}

/**
 * Kolonlar × satırlardan kolon başına {shape, example} özeti üretir.
 * Boş kolonlar atlanır; örnek değerler `maxExampleLength` ile kırpılır.
 */
export function buildColumnDigest(
  columns: MinimalDigestColumn[],
  rows: Array<Record<string, unknown>>,
  maxExampleLength = 40,
  maxColumns = 60
): Record<string, ColumnDigestEntry> {
  const digest: Record<string, ColumnDigestEntry> = {}
  for (const col of columns) {
    if (Object.keys(digest).length >= maxColumns) break
    let example = ""
    for (const row of rows) {
      const v = String(row?.[col.name] ?? "").trim()
      if (v) {
        example = v
        break
      }
    }
    if (!example) continue
    const entry: ColumnDigestEntry = {
      shape: shapeSignature(example),
      example: example.slice(0, maxExampleLength),
    }
    if (col.label && col.label !== col.name) entry.label = col.label
    digest[col.name] = entry
  }
  return digest
}
