import { describe, expect, it } from "vitest"
import { detectGridIntent, resolveGridFastRoute } from "./grid-intent"
import { applyViewingStateGuard } from "./sidecar-protocol"
import type { ScreenContext } from "./types"

const gridScreen: ScreenContext = {
  screenId: "report-grid-test",
  screenTitle: "Stok Bakiyesi Tablosu",
  workspaceId: "stock",
  activeDataSummary: {
    isViewingResults: true,
    totalRows: 1200,
    columns: ["Posting Date", "Item", "Quantity"],
    columnTypes: { "Posting Date": "date", Item: "text", Quantity: "number" },
    sampleRows: [{ "Posting Date": "2025-01-15", Item: "SKU-001", Quantity: 5 }],
  },
} as unknown as ScreenContext

describe("detectGridIntent — count niyeti", () => {
  it.each([
    "kaç kayıt var",
    "kaç kayit var",
    "Kaç Satır var?",
    "toplam kaç tane var",
    "kayıt sayısı nedir",
    "how many records",
    "record count",
  ])("count döner: %s", (p) => {
    expect(detectGridIntent(p)).toBe("count")
  })

  it("kelime sınırı: 'kaçak' count DEĞİL", () => {
    expect(detectGridIntent("kaçak stok listele")).not.toBe("count")
  })

  it("mevcut niyetler bozulmadı", () => {
    expect(detectGridIntent("filtreleri temizle")).toBe("clear")
    expect(detectGridIntent("anomali var mı")).toBe("anomaly")
    expect(detectGridIntent("özet grafik")).toBe("summary")
    expect(detectGridIntent("merhaba")).toBeNull()
  })
})

describe("resolveGridFastRoute — count soruları filtre OLMAZ", () => {
  it("'kaç kayıt var' → analyze_grid_data + kpi (filter_active_grid DEĞİL)", () => {
    const r = resolveGridFastRoute("kaç kayıt var", gridScreen, true)
    expect(r.matched).toBe(true)
    expect(r.toolName).toBe("analyze_grid_data")
    expect(r.args.chartType).toBe("kpi")
  })

  it("net filtre hâlâ filter_active_grid'a gider", () => {
    const r = resolveGridFastRoute("SKU-102 filtrele", gridScreen, true)
    expect(r.toolName).toBe("filter_active_grid")
  })
})

describe("applyViewingStateGuard — Needle yanlış araç seçerse", () => {
  it("Needle filter dedi ama prompt sayım sorusu → analyze_grid_data", () => {
    const t = applyViewingStateGuard(
      "filter_active_grid",
      "kaç kayıt var",
      true,
      false
    )
    expect(t).toBe("analyze_grid_data")
  })

  it("normal filtre isteği filter_active_grid kalır", () => {
    const t = applyViewingStateGuard(
      "filter_active_grid",
      "SKU-102 göster",
      true,
      false
    )
    expect(t).toBe("filter_active_grid")
  })
})
