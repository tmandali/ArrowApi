import { defineJurisdictionStrategy } from "@/lib/contracts/jurisdiction-strategy";
import type { SalesOrderHeader } from "../sales-order.state";

/**
 * Turkey (TR) Country Strategy for Sales Order.
 * Adds GİB e-Fatura/e-Arşiv profile requirements and Tevkifat rules.
 */
export const salesOrderTrStrategy = defineJurisdictionStrategy<SalesOrderHeader>({
  countryCode: "TR",
  stateAugmentation: {
    fields: {
      e_invoice_profile: {
        type: "enum",
        description: "GİB E-Fatura / E-Arşiv Senaryosu",
        aliases: ["Fatura Senaryosu", "GİB Senaryo"],
        enumValues: [
          { code: "TICARIFATURA", label: "Ticari Fatura (Kabul/Red Bildirimi)" },
          { code: "TEMELFATURA", label: "Temel Fatura" },
          { code: "IHRACAT", label: "İhracat Faturası" },
          { code: "EARSIVFATURA", label: "E-Arşiv Fatura" },
        ],
      },
      tax_office: {
        type: "string",
        description: "Müşterinin bağlı olduğu Vergi Dairesi",
        aliases: ["Vergi Dairesi"],
      },
      tax_id: {
        type: "string",
        description: "Müşteri VKN (Vergi Kimlik No) veya TCKN",
        aliases: ["VKN", "TCKN", "Vergi No"],
      },
    },
    businessRules: [
      "Kurumsal müşteriler için 10 haneli VKN ve Vergi Dairesi zorunludur.",
      "Bireysel nihai tüketiciler için 11 haneli TCKN veya genel 11111111111 kullanılabilir.",
      "İhracat siparişlerinde senaryo 'IHRACAT' ve GTİP kodları zorunludur.",
    ],
  },
});
