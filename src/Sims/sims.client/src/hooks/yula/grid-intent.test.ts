import { describe, expect, it } from "vitest"
import { resolveGridFastRoute } from "./grid-intent"
import type { ScreenContext } from "./types"

const screen = (columnTypes: Record<string, string>): ScreenContext =>
  ({
    screenId: "report-grid-test",
    screenTitle: "Test Tablosu",
    workspaceId: "stock",
    activeDataSummary: {
      isViewingResults: true,
      columns: ["Id", "ItemCode", "ItemName", "Qty", "IsActive"],
      columnTypes,
      sampleRows: [{ Id: "1", ItemCode: "SKU-001", IsActive: true }],
    },
  }) as unknown as ScreenContext

const BOOL_ONE = { Id: "text", ItemCode: "text", ItemName: "text", Qty: "number", IsActive: "bool" }
const BOOL_TWO = { ...BOOL_ONE, IsApproved: "bool" }

describe("resolveGridFastRoute — durum niyeti deterministik bool filtre", () => {
  it("'pasif olanlar' → tek bool kolona query=false", () => {
    const r = resolveGridFastRoute("pasif olanlar", screen(BOOL_ONE), true)
    expect(r.matched).toBe(true)
    expect(r.toolName).toBe("filter_active_grid")
    expect(r.args.column).toBe("IsActive")
    expect(r.args.query).toBe("false")
  })

  it("'aktif olanlar' → query=true", () => {
    const r = resolveGridFastRoute("aktif olanlar", screen(BOOL_ONE), true)
    expect(r.matched).toBe(true)
    expect(r.args.query).toBe("true")
  })

  it("birden fazla bool kolon → belirsiz, kısayol eşleşmez (modele bırakılır)", () => {
    const r = resolveGridFastRoute("pasif olanlar", screen(BOOL_TWO), true)
    const isStatusShortcut =
      r.matched && r.toolName === "filter_active_grid" && r.args.column === "IsActive"
    expect(isStatusShortcut).toBe(false)
  })
})
