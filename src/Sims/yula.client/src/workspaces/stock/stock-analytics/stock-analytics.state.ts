import type { BoundedStateDefinition } from "@/lib/contracts/bounded-context";

export interface StockAnalyticsFilterState {
  company?: string;
  item_code?: string;
  item_group?: string;
  warehouse?: string;
  range_type?: "Monthly" | "Quarterly" | "Yearly";
  year?: number;
}

/**
 * Bounded State for Stock Analytics (Malzeme Analitik ve Trend Raporu).
 * CQRS Analytical Read Model for multi-dimensional trends and turnover rates.
 */
export const stockAnalyticsState: BoundedStateDefinition<StockAnalyticsFilterState> = {
  entityName: "StockAnalyticsReport",
  description: "Dönemsel malzeme stok hareketleri, devir hızı ve tüketim trend analiz raporu.",
  fields: {
    company: {
      description: "Analizin çekileceği şirket kodu",
      type: "string",
    },
    item_code: {
      description: "Trendi incelenecek malzeme kodu",
      aliases: ["Malzeme Kodu", "Stok Kodu"],
      type: "string",
    },
    item_group: {
      description: "Malzeme kategorisi veya grubu",
      aliases: ["Ürün Grubu", "Kategori"],
      type: "string",
    },
    warehouse: {
      description: "Analize dahil edilecek depo",
      aliases: ["Depo", "Lager"],
      type: "string",
    },
    range_type: {
      description: "Zaman kırılım periyodu (Aylık, Çeyreklik, Yıllık)",
      aliases: ["Periyot", "Kırılım"],
      type: "enum",
      enumValues: [
        { code: "Monthly", label: "Aylık" },
        { code: "Quarterly", label: "Çeyreklik" },
        { code: "Yearly", label: "Yıllık" },
      ],
    },
    year: {
      description: "Analiz edilecek mali yıl",
      aliases: ["Yıl", "Mali Yıl"],
      type: "number",
    },
  },
  businessRules: [
    "Dönemsel trend analizi DuckDB üzerinde gruplanarak Recharts grafik projeksiyonuna beslenir.",
    "Devir hızı = Satılan Malın Maliyeti (COGS) / Ortalama Stok formülü ile dinamik hesaplanır.",
  ],
};
