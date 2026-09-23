import { defineJurisdictionStrategy } from "@/lib/contracts/jurisdiction-strategy";

/**
 * Turkey (TR) Country Strategy for Stock Item Master Data.
 * Grounded for Turkish GİB, GTİP and tax legislation.
 */
export const itemTrStrategy = defineJurisdictionStrategy({
  countryCode: "TR",
  stateAugmentation: {
    fields: {
      gtip_code: {
        description: "12 haneli Gümrük Tarife İstatistik Pozisyonu (GTİP) kodu",
        aliases: ["GTİP", "Gümrük Kodu"],
        type: "string",
      },
      tevkifat_kodu: {
        description: "KDV Tevkifatı kodu (örn: 601, 602, 603)",
        aliases: ["Tevkifat Kodu", "Tevkifat"],
        type: "string",
      },
      otv_orani: {
        description: "Özel Tüketim Vergisi (ÖTV) oranı (%) veya maktu tutarı",
        aliases: ["ÖTV", "ÖTV Oranı"],
        type: "number",
      },
    },
    businessRules: [
      "İhracat faturasında yer alacak malzemeler için GTİP kodu girilmesi yasal zorunluluktur.",
      "Tevkifatlı satış yapılacaksa geçerli bir GİB tevkifat kodu seçilmelidir.",
    ],
  },
});
