"use client";

import * as React from "react";
import type { SpreadsheetColumn } from "../virtual-spreadsheet";

/**
 * Airtable benzeri kolon görsel kuralları (hücre bar'ı, renk çipleri,
 * negatif vurgusu) için kolon başına istatistik üretir.
 *
 * Performans: istatistikler SADECE veri kimliği değiştiğinde (yeni sorgu /
 * loadMore eklemesi → rows referansı değişir) tek geçişte hesaplanır.
 * Scroll (virtualization) rows referansını değiştirmeyeceği için sıfır maliyet.
 * Katman varsayılan KAPALIdır: yalnızca enabledColumns'da açık olan kolonlar
 * işlenir; açık kolon yoksa tarama yapılmaz (sıfır maliyet).
 */
export type ColumnStyleSpec =
  | { kind: "bar"; min: number; max: number }
  | { kind: "chip"; domain: Map<string, number> } // value → hue
  | { kind: "plain" };

/**
 * Kolon başına otomatik görsel katman (bar / çip) anahtarı.
 * Varsayılan: TÜMÜ KAPALI — kullanıcının footer menüsünden o kolon için
 * açıkça açtığı katmanlar işlenir; açık kolon yoksa sıfır tarama.
 */
export type ColumnVisuals = Record<string, boolean>;

/**
 * İstatistik taraması en fazla bu kadar satırı alır.
 * Yüklü/streaming tablolarda (loadMore her batch'te rows referansını değiştirir)
 * her recompute'u O(sabit) tutar; aksi halde kümülatif O(n²) olurdu.
 * Bar/çip yalnızca GÖRSEL işarettir → eşit aralıklı örnek min/max için yeterlidir.
 */
const MAX_STATS_ROWS = 20000;
/**
 * Toplam hücre okuma bütçesi (satır × kolon). Kolon sayısı arttıkça örneklem
 * küçülür; maliyet her koşulda O(sabit). Renk katmanı kolon order'ından
 * bağımsızdır → order değişiminde görsel durum korunur.
 */
const CELL_READ_BUDGET = 2_000_000;
const MIN_SAMPLE_ROWS = 200;
/** Altın açı: eşit dağarcıktan homojen renk dağılımı verir. */
const CHIP_HUE_STEP = 137.508;

/**
 * Tarama dizisi: tablo `cap`'ten küçükse tüm satırlar, büyükse eşit
 * aralıklı örnek (ilk + son + aradaki uçlar yakalanır).
 */
function statsScanIndices(rows: readonly Record<string, unknown>[], cap: number): number[] {
  const n = rows.length;
  const effective = Math.min(n, cap);
  if (n <= cap) {
    const idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    return idx;
  }
  const step = n / effective;
  const idx: number[] = new Array(effective);
  for (let i = 0; i < effective; i++) idx[i] = Math.floor(i * step);
  return idx;
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? NaN : Number(t);
  }
  // Arrow / DuckDB sayısal nesneleri (valueOf tabanlı)
  if (v != null && typeof v === "object") {
    const fo = (v as { valueOf?: unknown }).valueOf;
    if (typeof fo === "function") return Number(fo.call(v));
  }
  return NaN;
}

function chipDomain(distinct: Set<string>): Map<string, number> {
  const sorted = [...distinct].sort();
  const map = new Map<string, number>();
  for (let i = 0; i < sorted.length; i++) {
    map.set(sorted[i], Math.round((i * CHIP_HUE_STEP) % 360));
  }
  return map;
}
const MAX_CHIP_DISTINCT = 16;
const MIN_CHIP_DISTINCT = 2;

export function useColumnStyleStats(args: {
  rows: readonly Record<string, unknown>[];
  effectiveColumns: readonly SpreadsheetColumn[];
  numericColumns: Set<string>;
  booleanColumns: Set<string>;
  /**
   * Kolon başına otomatik görsel katman (bar / çip) anahtarı.
   * Varsayılan: kapalı (tarama yok). Footer menüsünden kolon bazında açılır.
   */
  enabledColumns?: ColumnVisuals;
}): Record<string, ColumnStyleSpec> {
  const { rows, effectiveColumns, numericColumns, booleanColumns, enabledColumns } = args;

  return React.useMemo(() => {
    const specs: Record<string, ColumnStyleSpec> = {};
    if (!enabledColumns || rows.length === 0) return specs;

    // Yalnızca açık kolonlar işlenir → maliyet açık kolon sayısıyla ölçeklenir.
    const enabledCols = effectiveColumns.filter((c) => enabledColumns[c.name]);
    if (enabledCols.length === 0) return specs;

    const colCount = Math.max(1, enabledCols.length);
    const sampleCap = Math.max(
      MIN_SAMPLE_ROWS,
      Math.min(MAX_STATS_ROWS, Math.floor(CELL_READ_BUDGET / colCount))
    );
    const scan = statsScanIndices(rows, sampleCap);

    for (const col of enabledCols) {
      const isBool = booleanColumns.has(col.name);
      const isNumeric = numericColumns.has(col.name);

      // --- Çipli kolon: bool + düşük kardinalite string ---
      if (!isNumeric) {
        const distinct = new Set<string>();
        for (const i of scan) {
          const raw = rows[i];
          const values = (raw.values ?? raw) as Record<string, unknown>;
          const v = values[col.name];
          if (v == null) continue;
          const s = String(v);
          if (s === "") continue;
          distinct.add(s);
          if (distinct.size > MAX_CHIP_DISTINCT) break;
        }
        if (isBool || (distinct.size >= MIN_CHIP_DISTINCT && distinct.size <= MAX_CHIP_DISTINCT)) {
          specs[col.name] = { kind: "chip", domain: chipDomain(distinct) };
        }
        continue;
      }

      // --- Bar'lı kolon: sayısal min/max ölçeği ---
      let min = Infinity;
      let max = -Infinity;
      let any = false;
      for (const i of scan) {
        const raw = rows[i];
        const values = (raw.values ?? raw) as Record<string, unknown>;
        const n = toNumber(values[col.name]);
        if (Number.isFinite(n)) {
          any = true;
          if (n < min) min = n;
          if (n > max) max = n;
        }
      }
      if (any && min < max) {
        specs[col.name] = { kind: "bar", min, max };
      }
    }
    return specs;
  }, [rows, effectiveColumns, numericColumns, booleanColumns, enabledColumns]);
}
