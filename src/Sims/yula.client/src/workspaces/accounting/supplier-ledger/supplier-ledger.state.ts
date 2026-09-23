import type { BoundedStateDefinition } from "@/lib/contracts/bounded-context";

export interface SupplierLedgerFilterState {
  company?: string;
  supplier?: string;
  from_date?: string;
  to_date?: string;
  currency?: string;
}

/**
 * Bounded State for Supplier Ledger (Tedarikçi Cari Ekstresi / Kreditorenkonto).
 * CQRS Analytical Read Model for vendor payables, payments, and payment scheduling.
 */
export const supplierLedgerState: BoundedStateDefinition<SupplierLedgerFilterState> = {
  entityName: "SupplierLedgerReport",
  description: "Tedarikçi hesap bazında borç, ödeme ve açık fatura durumlarını gösteren satıcı cari hesap ekstresi.",
  fields: {
    company: {
      description: "Raporun çekileceği şirket kodu",
      type: "string",
    },
    supplier: {
      description: "Cari hesabı sorgulanan tedarikçi kodu",
      aliases: ["Tedarikçi Kodu", "Satıcı", "Kreditor"],
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
      aliases: ["Para Birimi"],
      type: "string",
    },
  },
  businessRules: [
    "Tedarikçi faturaları ve ödeme emirleri (havale/EFT) vadesine göre eşleştirilir.",
    "Tedarikçi bazlı stopaj ve tevkifat kesintileri ekstrede detaylandırılır.",
  ],
};
