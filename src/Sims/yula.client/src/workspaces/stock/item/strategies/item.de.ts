import { defineJurisdictionStrategy } from "@/lib/contracts/jurisdiction-strategy";

/**
 * Germany (DE) Country Strategy for Stock Item Master Data.
 * Grounded for German GoBD, customs Zolltarifnummer, and MwSt compliance.
 */
export const itemDeStrategy = defineJurisdictionStrategy({
  countryCode: "DE",
  stateAugmentation: {
    fields: {
      zolltarifnummer: {
        description: "8-stellige Warennummer für den Außenhandel (Zolltarifnummer / HS-Code)",
        aliases: ["Zolltarifnummer", "HS-Code", "Warennummer"],
        type: "string",
      },
      mwst_satz: {
        description: "Deutscher Mehrwertsteuersatz (19% Regelsatz, 7% ermäßigter Satz, 0% steuerfrei)",
        aliases: ["MwSt", "Umsatzsteuersatz", "VAT Rate"],
        enumValues: [
          { code: "19", label: "19% Regelsatz" },
          { code: "7", label: "7% ermäßigter Satz" },
          { code: "0", label: "0% steuerfrei" },
        ],
      },
      gobd_audit_id: {
        description: "GoBD-konforme Revisions- und Stammdatenänderungs-ID",
        type: "string",
      },
    },
    businessRules: [
      "Für grenzüberschreitenden EU-Warenverkehr muss eine gültige Zolltarifnummer hinterlegt sein.",
      "Änderungen an steuerrelevanten Stammdaten werden gemäß GoBD revisionssicher protokolliert.",
    ],
  },
});
