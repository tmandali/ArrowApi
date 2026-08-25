import { describe, expect, it } from "vitest"
import {
  extractCleanFilterValue,
  resolveColumnCandidates,
  resolveGridColumn,
  stripColumnTokensFromValue,
  unwrapQuotedValue,
} from "./grid-filter-resolver"
import { hasDirectGridFilterSignal } from "@/hooks/yula/grid-intent"

describe("stripColumnTokensFromValue", () => {
  it("'itemname timur' + Item Code → 'timur'", () => {
    expect(stripColumnTokensFromValue("itemname timur", "Item Code")).toBe(
      "timur"
    )
  })

  it("etiket + ipucu birlikte verilirse de söker", () => {
    expect(
      stripColumnTokensFromValue("item code ABC-1", "item_code", "Item Code")
    ).toBe("ABC-1")
  })

  it("kolon kelimesi içermeyen değere dokunmaz", () => {
    expect(stripColumnTokensFromValue("timur", "Item Code")).toBe("timur")
    expect(stripColumnTokensFromValue("2025-01-01..2025-01-31", "Posting Date")).toBe(
      "2025-01-01..2025-01-31"
    )
  })

  it("tüm kelimeler kolon kelimesi olsa bile orijinali korur", () => {
    expect(stripColumnTokensFromValue("item", "Item Code")).toBe("item")
  })

  it("tanımsız kolonlarda değeri olduğu gibi döndürür", () => {
    expect(stripColumnTokensFromValue("ankara", undefined)).toBe("ankara")
  })

  it("Türkçe katlama ile eşler", () => {
    // "Kodu" token'ı (fold sonrası) değerde birebir sökülür
    expect(stripColumnTokensFromValue("kodu timur", "Malzeme Kodu")).toBe(
      "timur"
    )
  })
})

describe("resolveGridColumn — item-code eğilimi kırıldı", () => {
  const cols = [
    { name: "ItemCode", label: "Item Code" },
    { name: "ItemName", label: "Item Name" },
    { name: "Quantity", label: "Quantity", align: "right" as const },
    { name: "PostingDate", label: "Posting Date" },
  ]
  const samples = [
    { ItemCode: "SKU-001", ItemName: "Vana", Quantity: 5, PostingDate: "2025-01-15" },
    { ItemCode: "SKU-002", ItemName: "Pompa", Quantity: 0, PostingDate: "2025-02-20" },
  ]

  it("pattern fallback tarih kolonuna gitmez (ilk metin kolonu döner)", () => {
    expect(resolveGridColumn(undefined, cols, "MAIN", samples)).toBe("ItemCode")
  })

  it("few-shot tam eşleşme doğru kolonu bulur", () => {
    expect(resolveGridColumn(undefined, cols, "Pompa", samples)).toBe("ItemName")
  })

  it("skorlu eşleşme: 'itemname' → ItemName (Item Code DEĞİL)", () => {
    expect(resolveGridColumn("itemname", cols)).toBe("ItemName")
  })

  it("tam ad eşleşmesi contains'i yener", () => {
    expect(resolveGridColumn("itemcode", cols)).toBe("ItemCode")
  })

  it("sayısal değer sayı kolonuna gider", () => {
    expect(resolveGridColumn(undefined, cols, ">100", samples)).toBe("Quantity")
  })
})

describe("extractCleanFilterValue — bileşik item girişleri ayrışır", () => {
  it("'itemname timur' → hint=description (tabloda Item Name varsa oraya), value='timur'", () => {
    const r = extractCleanFilterValue("itemname timur")
    expect(r.columnHint).toBe("description")
    expect(r.value).toBe("timur")
  })

  it("'ürün kodu ABC-1' → hint=item_code, value='ABC-1'", () => {
    const r = extractCleanFilterValue("ürün kodu ABC-1")
    expect(r.columnHint).toBe("item_code")
    expect(r.value).toContain("ABC-1")
  })

  it("'itemname' İÇEREN ama önde olmayan cümleler hint üretmez (kelime sınırı)", () => {
    const r = extractCleanFilterValue("timur'un items kayıtları")
    expect(r.columnHint).toBeUndefined()
  })
})

describe("nitelik-sözdizimi: name/ad → Description kavramı", () => {
  const cols = [
    { name: "ItemCode", label: "Item Code" },
    { name: "ItemName", label: "Item Name" },
    { name: "Quantity", label: "Quantity", align: "right" as const },
    { name: "PostingDate", label: "Posting Date" },
  ]

  it("'item adı ahmet' → hint=description", () => {
    expect(extractCleanFilterValue("item adı ahmet").columnHint).toBe("description")
  })

  it("eksik önekli 'name timur' → hint=description, value='timur'", () => {
    const r = extractCleanFilterValue("name timur")
    expect(r.columnHint).toBe("description")
    expect(r.value).toBe("timur")
  })

  it("sözlüksüz: kavramsal hint ('description') ad/örnek kanıtı yoksa tanımsız döner (model katmanına devredilir)", () => {
    expect(resolveGridColumn("description", cols)).toBeUndefined()
  })

  it("hint=item_code → ItemCode kolonu", () => {
    expect(resolveGridColumn("item_code", cols)).toBe("ItemCode")
  })
})

describe("veri kanıtı önce: örnek-set ipucunu ezer", () => {
  const cols = [
    { name: "ItemCode", label: "Item Code" },
    { name: "ItemName", label: "Item Name" },
    { name: "Quantity", label: "Quantity", align: "right" as const },
    { name: "PostingDate", label: "Posting Date" },
  ]
  const samples = [
    { ItemCode: "SKU-001", ItemName: "Sample 8", Quantity: 5, PostingDate: "2025-01-15" },
    { ItemCode: "SKU-002", ItemName: "Pompa", Quantity: 0, PostingDate: "2025-02-20" },
  ]

  it("'sample item 8' senaryosu: hint=item_code ama 'Sample 8' ItemName'de birebir → ItemName", () => {
    expect(resolveGridColumn("item_code", cols, "Sample 8", samples)).toBe("ItemName")
  })

  it("kod-ön eki kanıtı yanlış hint'i ezer", () => {
    expect(resolveGridColumn("description", cols, "SKU-009", samples)).toBe("ItemCode")
  })

  it("zayıf içerir kanıtı güçlü ipucunu (≥70) ezmez", () => {
    expect(resolveGridColumn("quantity", cols, "omp", samples)).toBe("Quantity")
  })

  it("ipucu tabloda hiç yoksa zayıf kanıt devreye girer", () => {
    expect(
      resolveGridColumn("warehouse", cols, "van", [
        { ItemCode: "SKU-001", ItemName: "Vana" },
      ])
    ).toBe("ItemName")
  })
})

describe("şekil-imzası kanıtı (Sample Item 222 vakası)", () => {
  const cols = [
    { name: "ItemCode", label: "Item Code" },
    { name: "ItemName", label: "Item Name" },
    { name: "Quantity", label: "Quantity", align: "right" as const },
    { name: "PostingDate", label: "Posting Date" },
  ]
  // Örnek sette birebir "sample 222" YOK — sadece dokü var
  const samples = [
    { ItemCode: "SKU-001", ItemName: "Sample 8", Quantity: 5, PostingDate: "2025-01-15" },
    { ItemCode: "SKU-002", ItemName: "Pompa", Quantity: 0, PostingDate: "2025-02-20" },
  ]

  it("'Sample Item 222' → değer 'Sample 222' şekli ItemName ile uyuşur → ItemName (Item Code DEĞİL)", () => {
    expect(resolveGridColumn("item_code", cols, "Sample 222", samples)).toBe("ItemName")
  })

  it("kaba imza ('a') kanıt sayılmaz + sözlüksüz hint → tanımsız döner", () => {
    expect(resolveGridColumn("description", cols, "Pompalar", samples)).toBeUndefined()
  })

  it("saf sayı/operator değerleri şekil kanalına girmez", () => {
    expect(resolveGridColumn(undefined, cols, ">100", samples)).toBe("Quantity")
    expect(resolveGridColumn(undefined, cols, "2025-01-15", samples)).toBe("PostingDate")
  })
})

describe("resolveColumnCandidates — Step-1 aday listesi", () => {
  const cols = [
    { name: "ItemCode", label: "Item Code" },
    { name: "ItemName", label: "Item Name" },
    { name: "Quantity", label: "Quantity", align: "right" as const },
    { name: "PostingDate", label: "Posting Date" },
  ]
  const samples = [
    { ItemCode: "SKU-001", ItemName: "Sample 8", Quantity: 5, PostingDate: "2025-01-15" },
    { ItemCode: "SKU-002", ItemName: "Pompa", Quantity: 0, PostingDate: "2025-02-20" },
  ]

  it("örnek kanıtı ilk sıraya taşır (Sample 8 → ItemName birinci)", () => {
    const c = resolveColumnCandidates("item_code", cols, "Sample 8", samples)
    expect(c[0]).toBe("ItemName")
    expect(c).toContain("ItemCode")
  })

  it("sayısal değer → Quantity başta; tarih kolonu listede düşük/son", () => {
    const c = resolveColumnCandidates(undefined, cols, ">100", samples)
    expect(c[0]).toBe("Quantity")
  })

  it("ifade çekirdeği meta kolona kilitlemez: '>500' + hint 'qty' → Qty (Unit Price DEĞİL)", () => {
    // qty>500 vakası: ">500" çekirdeğinin şekli ("#") UnitPrice örneğiyle eşleşse de
    // güçlü ipucu (tam isim eşleşmesi) şekle yenik düşmez; Id meta olarak hariçtir.
    const cols = [
      { name: "Id", label: "Id" },
      { name: "ItemCode", label: "Item Code" },
      { name: "ItemName", label: "Item Name" },
      { name: "Warehouse", label: "Warehouse" },
      { name: "Qty", label: undefined as unknown as string },
      { name: "UnitPrice", label: "Unit Price" },
      { name: "PostingDate", label: "Posting Date" },
      { name: "IsActive", label: "Is Active" },
      { name: "BatchNumber", label: "Batch Number" },
    ]
    const samples = [
      { Id: "1", ItemCode: "SKU-001", ItemName: "Sample Item 1", Warehouse: "WH-01", Qty: 1.5, UnitPrice: 11.75, PostingDate: "2026-08-15", IsActive: true, BatchNumber: "BATCH-001" },
      { Id: "2", ItemCode: "SKU-002", ItemName: "Sample Item 2", Warehouse: "WH-02", Qty: 2.5, UnitPrice: 13, PostingDate: "2026-08-14", IsActive: true, BatchNumber: "BATCH-002" },
      { Id: "3", ItemCode: "SKU-003", ItemName: "Sample Item 3", Warehouse: "WH-03", Qty: 3.5, UnitPrice: 14.25, PostingDate: "2026-08-13", IsActive: false, BatchNumber: "BATCH-003" },
    ]
    expect(resolveGridColumn("qty", cols, ">500", samples)).toBe("Qty")
    expect(resolveColumnCandidates("qty", cols, undefined, samples)[0]).toBe("Qty")
  })

  it("hiç sinyal yoksa boş liste (model serbest, uydurma yok)", () => {
    expect(resolveColumnCandidates(undefined, cols, undefined, undefined)).toEqual([])
  })

  it("limit uygulanır", () => {
    const c = resolveColumnCandidates("item", cols, "Sample 8", samples, 1)
    expect(c).toHaveLength(1)
    expect(c[0]).toBe("ItemName")
  })
})

describe("literal sözleşmesi — tırnaklı değer birebir taşınır", () => {
  it("'itemname \"Sample Item 14\"' → tırnaklı değer korunur, hint=item adı kavramı", () => {
    const r = extractCleanFilterValue('itemname "Sample Item 14"')
    expect(r.quoted).toBe(true)
    expect(r.value).toBe('"Sample Item 14"')
    expect(r.columnHint).toBe("description")
  })

  it("tırnak dışındaki kelimelerden ipucu çıkarılır", () => {
    const r = extractCleanFilterValue('depo "MAIN"')
    expect(r.quoted).toBe(true)
    expect(r.value).toBe('"MAIN"')
    expect(r.columnHint).toBe("warehouse")
  })

  it("unwrapQuotedValue içeriği açar; düz değere dokunmaz", () => {
    expect(unwrapQuotedValue('"Sample Item 14"')).toEqual({
      content: "Sample Item 14",
      quoted: true,
    })
    expect(unwrapQuotedValue("Sample 8").quoted).toBe(false)
  })

  it("tırnaklı değerde stopword silinmez (Item kelimesi yaşar)", () => {
    const r = extractCleanFilterValue('"Sample Item 14"')
    expect(r.value).toContain("Item")
  })
})

describe("açık kolon adı önceliği (unit price vakası)", () => {
  it("'unit price 25' + tabloda Unit Price → hint=Unit Price, değer='25'", () => {
    const r = extractCleanFilterValue("unit price 25", ["Unit Price", "Item Code"])
    expect(r.columnHint).toBe("Unit Price")
    expect(r.value).toBe("25")
  })

  it("etiket çok kelimeli olsa da yakalanır ve değerden çıkarılır", () => {
    const r = extractCleanFilterValue("posting date haziran", ["Posting Date", "Qty"])
    expect(r.columnHint).toBe("Posting Date")
    expect(r.value.toLowerCase()).not.toContain("posting")
  })

  it("kolon adı geçmiyorsa davranış değişmez (SKU kodu item_code verir)", () => {
    const r = extractCleanFilterValue("sku-102", ["Unit Price"])
    expect(r.columnHint).toBe("item_code")
    expect(r.value).toBe("sku-102")
  })

  it("resolver: gerçek kolon adı hint olarak gelirse birebir eşleşir", () => {
    const cols = [
      { name: "UnitPrice", label: "Unit Price" },
      { name: "ItemName", label: "Item Name" },
    ]
    expect(resolveGridColumn("Unit Price", cols, "25")).toBe("UnitPrice")
  })
})


describe("hasDirectGridFilterSignal — şema/şekil türevli (sözlüksüz)", () => {
  it.each([
    ["unit price > 100", undefined],
    ["qty<50", undefined],
    ["SKU-102 filtrele", undefined],
    ["WH-01 kayıtları", undefined],
    ['depo "MAIN"', undefined],
    ["unit price 25", ["Unit Price", "Qty"]],
    ["posting date haziran", ["Posting Date"]],
    // Sayısal eşik niyeti: sayı + şemada numeric kolon
    ["fiyatı 100 den büyük olanlar", undefined],
  ])("sinyal: %s", (p, cols) => {
    // Üçüncü case şema-numerik kanıtıyla çalışır; diğerleri operatör/kod/quote/kolon-adı
    const numericCols =
      p === "fiyatı 100 den büyük olanlar" ? { "Unit Price": "number", Qty: "number" } : undefined
    expect(
      hasDirectGridFilterSignal(
        p as string,
        cols as string[] | undefined,
        numericCols as Record<string, string> | undefined
      )
    ).toBe(true)
  })

  it.each([
    ["bu tabloyu nasıl yorumlamalıyım", undefined],
    ["sample 8", undefined],
    ["merhaba", undefined],
    ["unit price 25", undefined],
    // Sayı var AMA şemada numeric kolon bilgisi yoksa sinyal değildir
    ["fiyatı 100 den büyük olanlar", undefined],
  ])("sinyal değil: %s", (p, cols) => {
    expect(
      hasDirectGridFilterSignal(
        p as string,
        cols as string[] | undefined,
        undefined as unknown as Record<string, string> | undefined
      )
    ).toBe(false)
  })
})
