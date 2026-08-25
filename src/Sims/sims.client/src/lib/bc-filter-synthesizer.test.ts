import { describe, expect, it } from "vitest"
import { extractCleanFilterValue } from "@/lib/bc-filter-synthesizer"


describe("explicit column → remainder is value (valueMode)", () => {
  it("'Item name = Sample Item 10' → '= Sample Item 10' (değer içindeki 'Item' yutulmaz)", () => {
    const r = extractCleanFilterValue("Item name = Sample Item 10", ["Item Name", "Qty"])
    expect(r.columnHint).toBe("Item Name")
    expect(r.value).toBe("= Sample Item 10")
  })
  it("valueMode BC sentezini engellemez: 'Unit price > 100' → '>100'", () => {
    const r = extractCleanFilterValue("Unit price > 100", ["Unit Price", "Qty"])
    expect(r.columnHint).toBe("Unit Price")
    expect(r.value).toBe(">100")
  })
})
