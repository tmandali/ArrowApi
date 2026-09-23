import type { BoundedStateDefinition } from "@/lib/contracts/bounded-context";

export interface StockItemState {
  itemCode: string;
  itemName: string;
  itemGroup: string;
  stockUom: string;
  maintainStock: boolean;
  disabled: boolean;
  allowAlternative: boolean;
  isZeroRated: boolean;
  isExempt: boolean;
  isFixedAsset: boolean;
  activeTab: string;
}

/**
 * Bounded State definition for Stock Item Master Data.
 * Grounded for LLM cognition & domain reasoning.
 */
export const itemState: BoundedStateDefinition<StockItemState> = {
  entityName: "Item",
  description: "Stokta izlenen ticari mal, hammadde, yarı mamul veya mamul kartı (Master Data).",
  descriptionKey: "description",
  fields: {
    itemCode: {
      description: "Benzersiz stok/malzeme kodu (örn: STK-001, HAM-102)",
      descriptionKey: "fields.itemCode_desc",
      labelKey: "fields.itemCode_label",
      aliases: ["Stok Kodu", "Malzeme Kodu", "SKU", "Part Number"],
      aliasesKey: "fields.itemCode_aliases",
      type: "string",
    },
    itemName: {
      description: "Malzemenin ticari / resmi tanımı",
      aliases: ["Malzeme Adı", "Ürün Adı", "Tanım"],
      type: "string",
    },
    itemGroup: {
      description: "Malzeme ana grubu veya kategorisi",
      aliases: ["Ürün Grubu", "Kategori"],
      type: "string",
    },
    stockUom: {
      description: "Stok ana takip ölçü birimi",
      descriptionKey: "fields.stockUom_desc",
      labelKey: "fields.stockUom_label",
      aliases: ["Birim", "Ana Birim", "UOM"],
      enumValues: [
        { code: "AD", label: "Adet", labelKey: "fields.uom_AD", meaning: "Sayısal birim" },
        { code: "KG", label: "Kilogram", labelKey: "fields.uom_KG", meaning: "Ağırlık birimi" },
        { code: "MT", label: "Metre", labelKey: "fields.uom_MT", meaning: "Uzunluk birimi" },
        { code: "LT", label: "Litre", meaning: "Hacim birimi" },
        { code: "PK", label: "Paket", meaning: "Paketli ambalaj" },
      ],
    },
    maintainStock: {
      description: "Stok hareketleri ve miktar takibi yapılsın mı bayrağı",
      aliases: ["Stok Takibi"],
      type: "boolean",
    },
    disabled: {
      description: "Malzeme pasife alınmış mı (işlemlere kapalı mı)",
      aliases: ["Pasif", "Kullanım Dışı"],
      type: "boolean",
    },
    isZeroRated: {
      description: "KDV oranı sıfır mı (istisna kapsamında mı)",
      type: "boolean",
    },
    isExempt: {
      description: "KDV'den tamamen muaf mı",
      type: "boolean",
    },
    isFixedAsset: {
      description: "Demirbaş / duran varlık niteliğinde mi",
      type: "boolean",
    },
  },
  businessRules: [
    "Stok hareketleri (irsaliye, sayım, fatura) oluşmuş malzemenin stok ana birimi değiştirilemez.",
    "Pasife alınmış (disabled=true) malzemeler yeni irsaliye veya sipariş satırlarına eklenemez.",
    "Stok takibi kapalı olan (maintainStock=false) malzemeler depo bakiye raporlarında yer almaz (hizmet/masraf kalemi sayılır).",
  ],
};
