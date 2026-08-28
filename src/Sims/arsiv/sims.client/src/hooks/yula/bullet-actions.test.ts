import { describe, expect, it } from "vitest"
import { parseBulletActions } from "./bullet-actions"

const GREETING = `Merhaba! Stok Bakiyesi Tablosu üzerindeyiz.

- **Stok Analizi:** En yüksek miktardaki ürünleri görebiliriz.
- **Filtreleme:** Miktarı 1'den küçük olanları listeleyebiliriz.

Başka nasıl yardımcı olabilirim?`

describe("parseBulletActions", () => {
  it("madde satırlarını aksiyona, düz satırları metne ayırır", () => {
    const segs = parseBulletActions(GREETING)
    expect(segs).toHaveLength(3)
    expect(segs[0].type).toBe("text")
    expect(segs[1]).toEqual({
      type: "actions",
      actions: [
        { title: "Stok Analizi", request: "En yüksek miktardaki ürünleri görebiliriz." },
        { title: "Filtreleme", request: "Miktarı 1'den küçük olanları listeleyebiliriz." },
      ],
    })
    expect(segs[2].type).toBe("text")
  })

  it("maddesiz metin tek text segmenti döner", () => {
    const segs = parseBulletActions("Merhaba!")
    expect(segs).toEqual([{ type: "text", value: "Merhaba!" }])
  })

  it("boş girdi güvenli", () => {
    expect(parseBulletActions(undefined)).toEqual([])
  })
})

describe("gerçek Gemma çıktısı (markdown * maddesi)", () => {
  const REAL = `Merhaba! Şu an Stok Bakiyesi Tablosu üzerindeyiz.\n\n*   **Stok miktarını filtrele:** "Stok miktarı 0'dan büyük olanları göster" gibi filtreler uygulayabilirim.\n*   **Excel'e aktar:** Mevcut tabloyu dışa aktarabilirim.`

  it("'*   **Başlık:** ...' biçimi aksiyona dönüşür", () => {
    const segs = parseBulletActions(REAL)
    const actions = segs.find((s) => s.type === "actions")
    expect(actions).toBeDefined()
    if (actions?.type === "actions") {
      expect(actions.actions.map((a) => a.title)).toEqual([
        "Stok miktarını filtrele",
        "Excel'e aktar",
      ])
      expect(actions.actions[1].request).toContain("dışa aktarabilirim")
    }
  })
})
