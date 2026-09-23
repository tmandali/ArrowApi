import { defineJurisdictionStrategy } from "@/lib/contracts/jurisdiction-strategy";
import type { SalesOrderHeader } from "../sales-order.state";

/**
 * Germany (DE) Country Strategy for Sales Order.
 * Adds EU Reverse Charge (Steuerschuldnerschaft) and USt-IdNr validations.
 */
export const salesOrderDeStrategy = defineJurisdictionStrategy<SalesOrderHeader>({
  countryCode: "DE",
  stateAugmentation: {
    fields: {
      ust_idnr: {
        type: "string",
        description: "Umsatzsteuer-Identifikationsnummer (USt-IdNr. - DE999999999)",
        aliases: ["USt-IdNr", "VAT ID"],
      },
      steuerschuldnerschaft: {
        type: "boolean",
        description: "§ 13b UStG - Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge)",
        aliases: ["Reverse Charge", "§13b"],
      },
      leitweg_id: {
        type: "string",
        description: "Elektronische Rechnungsadresse für öffentliche Auftraggeber (Leitweg-ID)",
        aliases: ["Leitweg-ID"],
      },
    },
    businessRules: [
      "Innergemeinschaftliche Lieferungen erfordern eine gültige EU-USt-IdNr.",
      "Bei B2G-Aufträgen muss eine gültige Leitweg-ID angegeben werden.",
    ],
  },
});
