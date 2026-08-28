import { describe, expect, it } from "vitest"
import { buildColumnDigest, shapeSignature } from "./column-digest"

describe("shapeSignature", () => {
  // Bilinçli kabalaştırma: ardışık harf/rakam koşuları tek simgeye iner,
  // böylece "Sample 8" ↔ "Sample 222" aynı dokuya eşlenir.
  it.each([
    ["Sample 222", "a #"],
    ["Sample 8", "a #"],
    ["SKU-001", "a-#"],
    ["2025-01-15", "#-#-#"],
    ["!Ankara|İzmir", "a|a"],
    [">100", "#"],
  ])("%s → %s", (v, sig) => {
    expect(shapeSignature(v)).toBe(sig)
  })
})

describe("buildColumnDigest", () => {
  const cols = [
    { name: "ItemCode", label: "Item Code" },
    { name: "ItemName", label: "Item Name" },
    { name: "EmptyCol" },
  ]
  const rows = [
    { ItemCode: "SKU-001", ItemName: "Sample 8", EmptyCol: "" },
    { ItemCode: "", ItemName: "", EmptyCol: "   " },
    { ItemCode: "SKU-002", ItemName: "Pompa", EmptyCol: null },
  ]

  it("kolon başına ilk dolu örnek + imza üretir; boş kolonları atlar", () => {
    expect(buildColumnDigest(cols, rows)).toEqual({
      ItemCode: { label: "Item Code", shape: "a-#", example: "SKU-001" },
      ItemName: { label: "Item Name", shape: "a #", example: "Sample 8" },
    })
  })

  it("örnek değerleri kırpıp satır dilimini olduğu gibi kullanır", () => {
    const d = buildColumnDigest(
      [{ name: "A" }],
      [{ A: "x".repeat(100) }]
    )
    expect(d.A.example).toHaveLength(40)
  })

  it("boş girdi → boş sindirim", () => {
    expect(buildColumnDigest([], [])).toEqual({})
  })
})
