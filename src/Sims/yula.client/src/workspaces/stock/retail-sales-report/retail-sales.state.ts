import type { BoundedStateDefinition } from "@/lib/contracts/bounded-context";

export interface RetailSalesFilterState {
  company?: string;
  pos_profile?: string;
  from_date?: string;
  to_date?: string;
  cashier?: string;
}

/**
 * Bounded State for Retail Sales Report (Perakende / Kasa Satış Raporu).
 * CQRS Analytical Read Model for point-of-sale receipt movements and daily register closures.
 */
export const retailSalesState: BoundedStateDefinition<RetailSalesFilterState> = {
  entityName: "RetailSalesReport",
  description: "Mağaza ve POS kasalarından gerçekleştirilen perakende satışların analitik raporu.",
  fields: {
    company: {
      description: "Raporun çekileceği şirket kodu",
      type: "string",
    },
    pos_profile: {
      description: "POS / Kasa Profili filtresi (örn: Kasa 1, Online POS)",
      aliases: ["Kasa", "POS Profili", "Kasse"],
      type: "string",
    },
    from_date: {
      description: "Satış başlangıç tarihi",
      aliases: ["Başlangıç Tarihi"],
      type: "date",
    },
    to_date: {
      description: "Satış bitiş tarihi",
      aliases: ["Bitiş Tarihi"],
      type: "date",
    },
    cashier: {
      description: "Satışı yapan kasiyer / kullanıcı",
      aliases: ["Kasiyer", "Kassierer"],
      type: "string",
    },
  },
  businessRules: [
    "Perakende satışlar günlük kasa kapanış (Z-Raporu) toplamlarıyla çapraz doğrulanır.",
    "İadeler ve net satış tutarları DuckDB WASM üzerinde ayrıştırılarak net ciro hesaplanır.",
  ],
};
