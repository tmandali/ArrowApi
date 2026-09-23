import type { BoundedStateDefinition } from "@/lib/contracts/bounded-context";

export interface StockBalanceFilterState {
  company?: string;
  warehouse?: string;
  item_group?: string;
  item_code?: string;
  from_date?: string;
  to_date?: string;
  include_zero_stock?: boolean;
}

/**
 * Bounded State for Stock Balance Analytical Report (CQRS Read Model).
 * Grounded for DuckDB SQL querying & filter understanding.
 */
export const stockBalanceState: BoundedStateDefinition<StockBalanceFilterState> = {
  entityName: "StockBalanceReport",
  description: "Depo bazlı anlık veya tarih aralıklı malzeme stok bakiye ve miktar raporu (Analytical Context).",
  fields: {
    company: {
      description: "Raporun çekileceği şirket kodu",
      type: "string",
    },
    warehouse: {
      description: "Filtrelenen hedef depo kodu (boş bırakılırsa tüm depolar)",
      aliases: ["Depo", "Ambar"],
      type: "string",
    },
    item_group: {
      description: "Filtrelenen malzeme grubu",
      aliases: ["Ürün Grubu", "Kategori"],
      type: "string",
    },
    item_code: {
      description: "Tek bir malzeme sorgulanacaksa malzeme kodu",
      aliases: ["Stok Kodu", "SKU"],
      type: "string",
    },
    to_date: {
      description: "Bakiye hesaplama bitiş tarihi (kapanış tarihi)",
      aliases: ["Tarih", "Bitiş Tarihi"],
      type: "date",
    },
    include_zero_stock: {
      description: "Bakiyesi sıfır olan malzemeler raporda listelensin mi",
      aliases: ["Sıfır Bakiyeliler", "Tükenenler"],
      type: "boolean",
    },
  },
  businessRules: [
    "Depo seçilmediğinde şirket geneli konsolide bakiye hesaplanır.",
    "Bakiye hesabı = Toplam Giriş Miktarı - Toplam Çıkış Miktarı mantığıyla DuckDB WASM üzerinde çalışır.",
    "Analitik rapor ekranlarında doğrudan DOM/veri yazma (mutation) süreci bulunmaz; salt okuma ve filtreleme geçerlidir.",
  ],
};
