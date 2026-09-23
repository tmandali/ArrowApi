import type { BoundedStateDefinition } from "@/lib/contracts/bounded-context";

export interface CustomerLedgerFilterState {
  company?: string;
  customer?: string;
  from_date?: string;
  to_date?: string;
  currency?: string;
}

/**
 * Bounded State for Customer Ledger (Müşteri Cari Ekstresi / Debitorenkonto).
 * CQRS Analytical Read Model for customer debit/credit transactions, aging, and open invoices.
 */
export const customerLedgerState: BoundedStateDefinition<CustomerLedgerFilterState> = {
  entityName: "CustomerLedgerReport",
  description: "Müşteri hesap bazında borç, tahsilat, bakiye ve yaşlandırma hareketlerini gösteren cari hesap ekstresi.",
  fields: {
    company: {
      description: "Raporun çekileceği şirket kodu",
      type: "string",
    },
    customer: {
      description: "Cari hesabı sorgulanan müşteri kodu",
      aliases: ["Cari Kodu", "Müşteri", "Debitor"],
      type: "string",
    },
    from_date: {
      description: "Ekstre başlangıç tarihi",
      aliases: ["Başlangıç Tarihi"],
      type: "date",
    },
    to_date: {
      description: "Ekstre bitiş tarihi",
      aliases: ["Bitiş Tarihi"],
      type: "date",
    },
    currency: {
      description: "Raporlama para birimi (TRY, EUR, USD)",
      aliases: ["Para Birimi", "Währung"],
      type: "string",
    },
  },
  businessRules: [
    "Müşteri ekstresinde açık hesap faturalar ve tahsilat eşleştirmeleri (reconciliation) ayrı ayrı izlenebilir.",
    "Gecikmiş bakiyeler için vade tarihi bazlı borç yaşlandırma (aging buckets) üretilir.",
  ],
};
