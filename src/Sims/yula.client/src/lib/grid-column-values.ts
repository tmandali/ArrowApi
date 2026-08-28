/**
 * Düşük kardinaliteli kolon değerleri sindirimi — saf modül.
 *
 * Natural Language Postgres rehberindeki "industries listesi" tekniği:
 * model kategorik değerleri uydurmasın; metin/bool kolonların gerçekte
 * var olan değerlerini DuckDB'den alıp prompt'aGrounding olarak ver.
 * Yalnız saf fonksiyonlar burada; DuckDB erişimi computeColumnValuesDigest'te.
 */

/** Bu eşiği aşan tablolarda tam tarama riskine girme (OPFS/WASM bütçesi). */
export const COLUMN_VALUES_MAX_TABLE_ROWS = 5_000_000;

export const COLUMN_VALUES_MAX_COLUMNS = 12;

/** Kolon başına döndürülecek en sık değer sayısı. */
export const COLUMN_VALUES_PER_COLUMN = 10;

/** Hangi kolon tipleri değer sözlüğü adayı (sayı/tarih uydurmaya en açık değil). */
export function isLowCardinalityCandidate(kind: string | undefined): boolean {
  return kind === "text" || kind === "bool";
}

function sqlSafeId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Bir kolonun en sık değerleri için GROUP BY sorgusu (limit+1 → taşma tespiti). */
export function buildColumnValuesQuery(
  tableName: string,
  column: string,
  limitPlusOne: number,
): string {
  return `SELECT ${sqlSafeId(column)} AS value, COUNT(*) AS n FROM ${sqlSafeId(tableName)} GROUP BY 1 ORDER BY n DESC, 1 ASC LIMIT ${limitPlusOne}`;
}

/**
 * Kolonun ilk değerlerinin TÜMÜ düz sayıysa büyük olasılıkla benzersiz
 * kimliktir (Id/rownumber) → kategori/grup kolonu olamaz.
 * "…" taşma işareti hariç tutulur; yapısal desen testidir, kelime listesi değil.
 */
export function looksLikeIdentifierValues(values?: string[]): boolean {
  if (!values || values.length === 0) return false;
  const known = values.filter((v) => v !== "…");
  return known.length > 0 && known.every((v) => /^\d+$/.test(v.trim()));
}

export interface ColumnValuesDigestInput {
  tableName: string;
  columns: string[];
  columnTypes?: Record<string, string>;
  /** Bilinen toplam satır sayısı; null/unknown ise digest üretilmez (maliyet guard'ı). */
  rowCount?: number | null;
}

/**
 * Metin/bool kolonların en sık gerçek değerlerini DuckDB'den toplar.
 * Kolon başına hata sessizce atlanır; hiç değer toplanamazsa null döner.
 */
export async function computeColumnValuesDigest(
  input: ColumnValuesDigestInput,
): Promise<Record<string, string[]> | null> {
  if (
    input.rowCount == null ||
    input.rowCount > COLUMN_VALUES_MAX_TABLE_ROWS
  ) {
    return null;
  }
  const candidates = input.columns
    .filter((c) => isLowCardinalityCandidate(input.columnTypes?.[c]))
    .slice(0, COLUMN_VALUES_MAX_COLUMNS);
  if (candidates.length === 0) return null;

  const { duckDbClient } = await import("@/services/duckdb");
  const out: Record<string, string[]> = {};
  for (const col of candidates) {
    try {
      const rows = await duckDbClient.executeCustomSql(
        buildColumnValuesQuery(
          input.tableName,
          col,
          COLUMN_VALUES_PER_COLUMN + 1,
        ),
      );
      if (rows.length === 0) continue;
      const values = rows
        .slice(0, COLUMN_VALUES_PER_COLUMN)
        .map((r) => {
          const v = (r as Record<string, unknown>).value;
          return v === null || v === undefined || v === "" ? "(boş)" : String(v);
        });
      if (rows.length > COLUMN_VALUES_PER_COLUMN) values.push("…");
      out[col] = values;
    } catch {
      // Tek kolonun sorgusu patlarsa digest'i bozma
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}
