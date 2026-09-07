import { formatGridCellValue } from "@/utils/format-cell"
import { MIN_COL_WIDTH, type SpreadsheetColumn } from "./types"

let measurementCanvas: HTMLCanvasElement | null = null

/**
 * Canvas 2D context kullanarak verilen metnin piksel genişliğini ölçer (0 ms, reflow yok).
 */
export function measureTextWidth(text: string, font = "12px sans-serif"): number {
  if (typeof document === "undefined" || !text) return (text?.length || 0) * 8
  try {
    if (!measurementCanvas) {
      measurementCanvas = document.createElement("canvas")
    }
    const ctx = measurementCanvas.getContext("2d")
    if (!ctx) return text.length * 8
    ctx.font = font
    return ctx.measureText(text).width
  } catch {
    return text.length * 8
  }
}

/**
 * Kolon başlığı ve mevcut satır içeriklerine göre en uygun "tam sığdır" (fit-content) piksel genişliğini hesaplar.
 */
export function calculateColumnAutoFitWidth<T>(
  col: SpreadsheetColumn,
  items: readonly T[]
): number {
  const headerWidth =
    measureTextWidth(col.label || col.name || "", "bold 11px sans-serif") + 40

  let maxContentWidth = 0
  const sampleLimit = Math.min(items.length, 120)

  for (let i = 0; i < sampleLimit; i++) {
    const item = items[i] as Record<string, unknown> | null | undefined
    if (!item) continue

    const rowValues =
      item.values && typeof item.values === "object"
        ? (item.values as Record<string, unknown>)
        : null

    const nestedRow =
      item.row && typeof item.row === "object"
        ? (item.row as Record<string, unknown>)
        : null

    const rawVal =
      rowValues?.[col.name] ??
      nestedRow?.[col.name] ??
      item[col.name] ??
      (col.kind === "account" ? (nestedRow?.name as unknown) ?? item.name : undefined)

    if (rawVal == null) continue

    const formattedVal = formatGridCellValue(rawVal, col.align)
    let w = measureTextWidth(formattedVal, "12px sans-serif")

    if (typeof item.depth === "number") {
      w += item.depth * 16 + 24
    }

    if (w > maxContentWidth) {
      maxContentWidth = w
    }
  }

  const contentWidth = maxContentWidth > 0 ? maxContentWidth + 28 : 0
  const fitWidth = Math.round(Math.max(headerWidth, contentWidth))
  return Math.max(MIN_COL_WIDTH, Math.min(520, fitWidth))
}

/**
 * Kolon hizalamasına (align) ve etiket uzunluğuna göre varsayılan piksel genişliği hesaplar.
 * İsim listesi veya kelime tahmini içermez; tamamen yapısal özelliklere dayanır.
 */
export function getDefaultColumnWidth(col: SpreadsheetColumn): number {
  const labelLen = (col.label || col.name || "").length
  // Sayısal (sağa hizalı) kolonlar için kompakt genişlik (80px - 130px)
  if (col.align === "right") {
    return Math.max(80, Math.min(130, labelLen * 7 + 28))
  }
  // Metin / genel (sola hizalı) kolonlar için dengeli genişlik (100px - 220px)
  return Math.max(100, Math.min(220, labelLen * 8 + 32))
}
