import { defineJurisdictionStrategy } from "@/lib/contracts/jurisdiction-strategy";
import type { SalesInvoiceHeader } from "../sales-invoice.state";

/**
 * Turkey (TR) Country Strategy for Sales Invoice.
 * Mandates GİB E-Fatura / E-Arşiv legal standards, Tevkifat rules, and fiscal signatures.
 */
export const salesInvoiceTrStrategy = defineJurisdictionStrategy<SalesInvoiceHeader>({
  countryCode: "TR",
  stateAugmentation: {
    fields: {
      gib_uuid: {
        type: "string",
        description: "GİB E-Fatura / E-Arşiv Evrensel Tekil Tanımlayıcısı (UUID / ETTN)",
        aliases: ["GİB UUID", "ETTN", "Fatura UUID"],
      },
      gib_status_code: {
        type: "string",
        description: "GİB Entegratör Durum Kodu (örn: 1220 - Başarıyla İmzalandı)",
        aliases: ["GİB Durum Kodu", "Entegratör Kodu"],
      },
      gib_profile: {
        type: "enum",
        description: "GİB Fatura Senaryosu",
        aliases: ["GİB Senaryo", "Fatura Tipi"],
        enumValues: [
          { code: "TICARIFATURA", label: "Ticari Fatura" },
          { code: "TEMELFATURA", label: "Temel Fatura" },
          { code: "IHRACAT", label: "İhracat Faturası" },
          { code: "EARSIVFATURA", label: "E-Arşiv Fatura" },
        ],
      },
      tevkifat_kodu: {
        type: "string",
        description: "KDV Tevkifatı Kodu (örn: 601, 604)",
        aliases: ["Tevkifat Kodu"],
      },
      tevkifat_orani: {
        type: "string",
        description: "KDV Tevkifat Pay/Payda Oranı (örn: 5/10, 7/10)",
        aliases: ["Tevkifat Oranı"],
      },
    },
    businessRules: [
      "Türkiye'de fatura imzalandığında GİB ETTN/UUID üretilmesi ve GİB portalına iletilmesi yasal zorunluluktur.",
      "Tevkifatlı faturalarda tevkifat kodu ve oranı zorunludur, matrah ayrıştırması yapılmalıdır.",
    ],
  },
});
