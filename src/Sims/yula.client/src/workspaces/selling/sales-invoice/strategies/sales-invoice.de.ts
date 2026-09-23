import { defineJurisdictionStrategy } from "@/lib/contracts/jurisdiction-strategy";
import type { SalesInvoiceHeader } from "../sales-invoice.state";

/**
 * Germany (DE) Country Strategy for Sales Invoice.
 * Mandates German XRechnung, ZUGFeRD, and GoBD compliance standards.
 */
export const salesInvoiceDeStrategy = defineJurisdictionStrategy<SalesInvoiceHeader>({
  countryCode: "DE",
  stateAugmentation: {
    fields: {
      leitweg_id: {
        type: "string",
        description: "Elektronische Rechnungsadresse für öffentliche Auftraggeber (Leitweg-ID)",
        aliases: ["Leitweg-ID", "Käuferreferenz"],
      },
      xrechnung_version: {
        type: "string",
        description: "XRechnung Standard Version (z. B. 3.0.1)",
        aliases: ["XRechnung Version"],
      },
      ust_idnr: {
        type: "string",
        description: "Umsatzsteuer-Identifikationsnummer des Rechnungsempfängers",
        aliases: ["USt-IdNr", "VAT ID"],
      },
      gobd_archiv_hash: {
        type: "string",
        description: "GoBD-konformer Revisionssicherheits-Prüfsummen-Hash (SHA-256)",
        aliases: ["GoBD Hash", "Archiv-Prüfsumme"],
      },
    },
    businessRules: [
      "B2G-Rechnungen in Deutschland müssen im XRechnung-Format mit gültiger Leitweg-ID übermittelt werden.",
      "Gemäß GoBD müssen Rechnungsdaten unveränderbar und revisionssicher archiviert werden.",
    ],
  },
});
