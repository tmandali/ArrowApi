import { describe, expect, it } from "vitest"
import type { JsonSchemaObject } from "@/features/report-criteria"
import schema from "../../stock/item/schemas/stock-balance-criteria.schema.json"
import { buildCriteriaDigest } from "./build-criteria-digest"

describe("buildCriteriaDigest", () => {
  const digest = buildCriteriaDigest(schema as unknown as JsonSchemaObject)

  it("test_only alanları (sampleRows) dışlar", () => {
    expect(digest.fields.some((f) => f.key === "sampleRows")).toBe(false)
    expect(digest.fields.map((f) => f.key)).toEqual([
      "kayitTarihi",
      "durum",
      "tutarMiktar",
      "tutarParaBirimi",
      "urun",
    ])
  })

  it("başlık, zorunluluk ve enum taşır", () => {
    const tarih = digest.fields.find((f) => f.key === "kayitTarihi")!
    expect(tarih.title).toContain("Tarih")
    expect(tarih.required).toBe(true)

    const durum = digest.fields.find((f) => f.key === "durum")!
    expect(durum.enumValues).toEqual(["AKTIF", "PASIF", "BEKLEMEDE", "IPTAL"])
    expect(durum.required).toBe(false)
  })

  it("directive ve önerileri kırpıp taşır", () => {
    const tutar = digest.fields.find((f) => f.key === "tutarMiktar")!
    expect(tutar.directive).toBeTruthy()
    const kur = digest.fields.find((f) => f.key === "tutarParaBirimi")!
    expect(kur.suggestions).toEqual(["TRY", "USD", "EUR"])
  })
})
