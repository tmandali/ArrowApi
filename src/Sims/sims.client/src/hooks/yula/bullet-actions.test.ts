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
