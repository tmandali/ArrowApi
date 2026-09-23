import type { BoundedStateDefinition } from "@/lib/contracts/bounded-context";

export interface StockLedgerFilterState {
  company?: string;
  warehouse?: string;
  item_code?: string;
  from_date?: string;
  to_date?: string;
  voucher_type?: string;
  batch_no?: string;
}

/**
 * Bounded State for Stock Ledger Analytical Report (Stok Ekstresi / CQRS Read Model).
 * Grounded for DuckDB SQL movements, valuation rates, and serial/batch traceability.
 */
export const stockLedgerState: BoundedStateDefinition<StockLedgerFilterState> = {
  entityName: "StockLedgerReport",
  description: "Kronolojik malzeme giriş, çıkış ve devir hareketlerini gösteren analitik stok ekstresi raporu.",
  fields: {
    company: {
      description: "Raporun çekileceği şirket kodu",
      type: "string",
    },
    warehouse: {
      description: "Hareketlerin sorgulanacağı depo",
      aliases: ["Depo", "Ambar", "Lager"],
      type: "string",
    },
    item_code: {
      description: "Ekstresi çıkarılacak malzeme kodu",
      aliases: ["Stok Kodu", "Malzeme", "Artikel"],
      type: "string",
    },
    from_date: {
      description: "Hareket sorgusu başlangıç tarihi",
      aliases: ["Başlangıç Tarihi", "Start Date"],
      type: "date",
    },
    to_date: {
      description: "Hareket sorgusu bitiş tarihi",
      aliases: ["Bitiş Tarihi", "End Date"],
      type: "date",
    },
    voucher_type: {
      description: "Hareket türü filtresi (örn: Sevk İrsaliyesi, Satınalma İrsaliyesi, Transfer)",
      aliases: ["Evrak Türü", "Fiş Tipi", "Belegart"],
      type: "string",
    },
    batch_no: {
      description: "Parti / Lot numarası filtresi",
      aliases: ["Parti No", "Lot No", "Charge"],
      type: "string",
    },
  },
  businessRules: [
    "Stok ekstresi satırları kronolojik işlem tarihi ve fiş sırasına göre artan (ASC) düzende listelenir.",
    "Her satırda yürüyen bakiye (running balance) ve ortalama maliyet (valuation rate) DuckDB SQL pencereleme fonksiyonları ile hesaplanır.",
  ],
};
