import { defineJurisdictionStrategy } from "@/lib/contracts/jurisdiction-strategy";
import type { DeliveryNoteHeader } from "../delivery-note.state";

/**
 * Germany (DE) Country Strategy for Delivery Note.
 * Mandates German Lieferschein and logistics standards (Spedition, Frachtbrief CMR, Lademittel/Europaletten).
 */
export const deliveryNoteDeStrategy = defineJurisdictionStrategy<DeliveryNoteHeader>({
  countryCode: "DE",
  stateAugmentation: {
    fields: {
      lieferschein_nr: {
        type: "string",
        description: "Fortlaufende deutsche Lieferscheinnummer",
        aliases: ["Lieferschein-Nr", "LS-Nummer"],
      },
      spedition_name: {
        type: "string",
        description: "Name des beauftragten Speditions- oder Paketdienstleisters",
        aliases: ["Spedition", "Paketdienst", "Carrier"],
      },
      frachtbrief_nr: {
        type: "string",
        description: "CMR Frachtbrief-Nummer für internationale oder Speditionstransporte",
        aliases: ["Frachtbrief-Nr", "CMR"],
      },
      europaletten_anzahl: {
        type: "number",
        description: "Anzahl der übergebenen Europaletten / Tauschpaletten",
        aliases: ["Europaletten", "Lademittel"],
      },
    },
    businessRules: [
      "Der Lieferschein muss dem Warenbegleitpapier physisch oder digital beigefügt werden.",
      "Lademitteltäusche (Europaletten) müssen dokumentiert und gegengezeichnet werden.",
    ],
  },
});
